// Transforma o texto solto de um PDF (pedaços com posição) em blocos de leitura: títulos e
// parágrafos, na ordem certa, sem cabeçalhos nem números de página, com a marca de onde cada
// página do original começa. Depois divide em capítulos.

import type { DocumentoPdf, ItemPdf, PaginaPdf } from './tipos'

export interface MarcaDePagina {
  pagina: number
  rotulo: string
}

export type Parte = string | MarcaDePagina

export interface Bloco {
  tipo: 'p' | 'h1' | 'h2' | 'h3' | 'aviso'
  partes: Parte[]
  /** Página em que o bloco começa. */
  pagina: number
}

export interface Capitulo {
  titulo: string
  blocos: Bloco[]
}

export interface DocumentoEstruturado {
  blocos: Bloco[]
  capitulos: Capitulo[]
  paginasSemTexto: number[]
  /** O primeiro título grande da primeira página, bom candidato a título do livro. */
  tituloSugerido?: string
}

export const AVISO_PAGINA_SEM_TEXTO = 'Esta página não tem texto para adaptar. Veja a página original.'

const PAGINAS_POR_PARTE = 10

/** Um trecho de linha: pedaços na mesma altura, sem um vão grande entre eles. */
interface Linha {
  texto: string
  x0: number
  x1: number
  y: number
  tamanho: number
  pagina: number
  coluna: number
}

// ---------------------------------------------------------------------------------------------
// Linhas

function juntarPedacos(itens: ItemPdf[], tamanho: number) {
  let texto = ''
  let fimAnterior = -Infinity
  for (const item of itens) {
    const vao = item.x - fimAnterior
    if (texto && vao > tamanho * 0.15 && !texto.endsWith(' ') && !item.texto.startsWith(' ')) texto += ' '
    texto += item.texto
    fimAnterior = item.x + item.largura
  }
  return texto.replace(/\s+/g, ' ').trim()
}

const mediana = (valores: number[]) => {
  if (!valores.length) return 0
  const ordenados = [...valores].sort((a, b) => a - b)
  return ordenados[Math.floor(ordenados.length / 2)]
}

function montarLinhas(pagina: PaginaPdf): Linha[] {
  const itens = pagina.itens.filter(i => i.texto.trim()).sort((a, b) => b.y - a.y || a.x - b.x)

  // Agrupa por altura na página; a tolerância deixa números sobrescritos na mesma linha.
  const grupos: ItemPdf[][] = []
  for (const item of itens) {
    const grupo = grupos[grupos.length - 1]
    const referencia = grupo?.[0]
    if (grupo && Math.abs(referencia.y - item.y) <= 0.5 * Math.max(referencia.altura, item.altura)) grupo.push(item)
    else grupos.push([item])
  }

  const linhas: Linha[] = []
  for (const grupo of grupos) {
    grupo.sort((a, b) => a.x - b.x)
    // Um vão grande na mesma altura separa colunas (ou uma nota na margem).
    let trecho: ItemPdf[] = []
    const fechar = () => {
      if (!trecho.length) return
      const tamanho = mediana(trecho.map(i => i.altura))
      const texto = juntarPedacos(trecho, tamanho)
      const ultimo = trecho[trecho.length - 1]
      if (texto) {
        linhas.push({
          texto,
          x0: trecho[0].x,
          x1: ultimo.x + ultimo.largura,
          y: trecho[0].y,
          tamanho,
          pagina: pagina.numero,
          coluna: 0,
        })
      }
      trecho = []
    }
    for (const item of grupo) {
      const anterior = trecho[trecho.length - 1]
      if (anterior && item.x - (anterior.x + anterior.largura) > 1.8 * Math.max(anterior.altura, item.altura)) fechar()
      trecho.push(item)
    }
    fechar()
  }
  return linhas
}

// ---------------------------------------------------------------------------------------------
// Cabeçalhos, rodapés e números de página

const NUMERO_DE_PAGINA = /^((p[áa]g(ina)?\.?|page|p\.)\s*)?([0-9]+|[ivxlcdm]+)(\s*(\/|de|of)\s*[0-9]+)?$|^[-–—]\s*[0-9]+\s*[-–—]$/i

const normalizar = (texto: string) => texto.toLowerCase().replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim()

const naMargem = (linha: Linha, pagina: PaginaPdf) => linha.y > pagina.altura * 0.9 || linha.y < pagina.altura * 0.1

function removerCabecalhosERodapes(porPagina: Linha[][], paginas: PaginaPdf[]) {
  const comTexto = porPagina.filter(l => l.length).length
  const repeticoes = new Map<string, number>()
  porPagina.forEach((linhas, i) => {
    const vistas = new Set(linhas.filter(l => naMargem(l, paginas[i])).map(l => normalizar(l.texto)))
    for (const texto of vistas) repeticoes.set(texto, (repeticoes.get(texto) ?? 0) + 1)
  })
  const minimo = Math.max(2, Math.ceil(comTexto * 0.3))
  return porPagina.map((linhas, i) =>
    linhas.filter(l => {
      if (!naMargem(l, paginas[i])) return true
      if (NUMERO_DE_PAGINA.test(l.texto)) return false
      return (repeticoes.get(normalizar(l.texto)) ?? 0) < minimo
    }),
  )
}

// ---------------------------------------------------------------------------------------------
// Colunas

/** Põe as linhas da página na ordem de leitura. Detecta duas colunas. */
function ordenarPagina(linhas: Linha[]): Linha[] {
  const porAltura = [...linhas].sort((a, b) => b.y - a.y || a.x0 - b.x0)
  if (linhas.length < 4) return porAltura
  const minX = Math.min(...linhas.map(l => l.x0))
  const maxX = Math.max(...linhas.map(l => l.x1))
  const largura = maxX - minX
  if (largura < 200) return porAltura

  const esquerda = porAltura.filter(l => l.x1 <= minX + largura * 0.52)
  const direita = porAltura.filter(l => l.x0 >= minX + largura * 0.48)
  const atravessam = porAltura.filter(l => !esquerda.includes(l) && !direita.includes(l))
  const proporcao = (lista: Linha[]) => lista.length / linhas.length
  const duasColunas =
    esquerda.length >= 2 &&
    direita.length >= 2 &&
    proporcao(esquerda) >= 0.2 &&
    proporcao(direita) >= 0.2 &&
    proporcao(atravessam) <= 0.3
  if (!duasColunas) return porAltura

  for (const l of direita) l.coluna = 1
  const topoDasColunas = Math.max(...esquerda.concat(direita).map(l => l.y))
  const acima = atravessam.filter(l => l.y >= topoDasColunas)
  const abaixo = atravessam.filter(l => l.y < topoDasColunas)
  return [...acima, ...esquerda, ...direita, ...abaixo]
}

// ---------------------------------------------------------------------------------------------
// Hífen no fim da linha

const ENCLITICOS = new Set(['me', 'te', 'se', 'lhe', 'lhes', 'o', 'a', 'os', 'as', 'lo', 'la', 'los', 'las', 'no', 'na', 'nos', 'nas', 'vos'])
const LETRA = /\p{L}/u

interface Vocabulario {
  palavras: Set<string>
  hifenizadas: Set<string>
}

function montarVocabulario(linhas: Linha[]): Vocabulario {
  const palavras = new Set<string>()
  const hifenizadas = new Set<string>()
  for (const { texto } of linhas) {
    for (const palavra of texto.toLowerCase().match(/[\p{L}]+(?:-[\p{L}]+)*/gu) ?? []) {
      if (palavra.includes('-')) hifenizadas.add(palavra)
      else palavras.add(palavra)
    }
  }
  return { palavras, hifenizadas }
}

/** Como juntar duas linhas do mesmo parágrafo: com espaço, sem nada, ou tirando o hífen. */
function juntarLinhas(anterior: string, proxima: string, vocabulario: Vocabulario): { anterior: string; separador: string } {
  if (anterior.endsWith('­')) return { anterior: anterior.slice(0, -1), separador: '' }
  const hifen = /[-‐]$/.test(anterior) && LETRA.test(anterior.at(-2) ?? '')
  if (!hifen) return { anterior, separador: ' ' }

  const inicio = anterior.slice(0, -1).match(/[\p{L}]+$/u)?.[0] ?? ''
  const fim = proxima.match(/^[\p{L}]+/u)?.[0] ?? ''
  if (!fim || fim[0] !== fim[0].toLowerCase()) return { anterior, separador: '' }

  const junta = `${inicio}${fim}`.toLowerCase()
  const comHifen = `${inicio}-${fim}`.toLowerCase()
  if (vocabulario.palavras.has(junta)) return { anterior: anterior.slice(0, -1), separador: '' }
  if (vocabulario.hifenizadas.has(comHifen) || ENCLITICOS.has(fim.toLowerCase())) return { anterior, separador: '' }
  return { anterior: anterior.slice(0, -1), separador: '' }
}

// ---------------------------------------------------------------------------------------------
// Blocos

function tamanhoDoCorpo(linhas: Linha[]) {
  const pesos = new Map<number, number>()
  for (const l of linhas) {
    const tamanho = Math.round(l.tamanho * 2) / 2
    pesos.set(tamanho, (pesos.get(tamanho) ?? 0) + l.texto.length)
  }
  let melhor = 0
  let maiorPeso = -1
  for (const [tamanho, peso] of pesos) {
    if (peso > maiorPeso) {
      melhor = tamanho
      maiorPeso = peso
    }
  }
  return melhor
}

const ehTitulo = (linha: Linha, corpo: number) => linha.tamanho >= corpo * 1.2 && linha.texto.length <= 160
const terminaFrase = (texto: string) => /[.!?:;…"”»)\]]$/.test(texto)

interface Margens {
  esquerda: number
  direita: number
}

function margensPorColuna(linhas: Linha[], corpo: number) {
  const margens = new Map<string, Margens>()
  for (const l of linhas) {
    if (Math.abs(l.tamanho - corpo) > corpo * 0.15) continue
    const chave = `${l.pagina}:${l.coluna}`
    const m = margens.get(chave)
    if (!m) margens.set(chave, { esquerda: l.x0, direita: l.x1 })
    else {
      m.esquerda = Math.min(m.esquerda, l.x0)
      m.direita = Math.max(m.direita, l.x1)
    }
  }
  return margens
}

function passoDasLinhas(linhas: Linha[], corpo: number) {
  const vaos: number[] = []
  for (let i = 1; i < linhas.length; i++) {
    const a = linhas[i - 1]
    const b = linhas[i]
    if (a.pagina !== b.pagina || a.coluna !== b.coluna) continue
    if (Math.abs(a.tamanho - corpo) > 1 || Math.abs(b.tamanho - corpo) > 1) continue
    const vao = a.y - b.y
    if (vao > 0 && vao < corpo * 3) vaos.push(vao)
  }
  return mediana(vaos) || corpo * 1.3
}

function comecaParagrafo(anterior: Linha, linha: Linha, margens: Map<string, Margens>, passo: number) {
  const m = margens.get(`${linha.pagina}:${linha.coluna}`)
  const ma = margens.get(`${anterior.pagina}:${anterior.coluna}`)
  if (Math.abs(anterior.tamanho - linha.tamanho) > 1.5) return true
  const mesmaColuna = anterior.pagina === linha.pagina && anterior.coluna === linha.coluna
  if (mesmaColuna && anterior.y - linha.y > passo * 1.3) return true
  if (m) {
    const recuo = linha.x0 - m.esquerda
    const recuoAnterior = ma ? anterior.x0 - ma.esquerda : 0
    if (recuo > linha.tamanho * 0.8 && recuo < linha.tamanho * 8 && recuoAnterior <= linha.tamanho * 0.8) return true
  }
  if (ma) {
    const larguraDaColuna = ma.direita - ma.esquerda
    const sobra = ma.direita - anterior.x1
    if (sobra > anterior.tamanho * 2.5 && terminaFrase(anterior.texto)) return true
    if (sobra > larguraDaColuna * 0.35) return true
  }
  if (/^[—–]/.test(linha.texto) && terminaFrase(anterior.texto)) return true
  return false
}

function montarBlocos(paginas: PaginaPdf[], linhasPorPagina: Linha[][]) {
  const todas = linhasPorPagina.flat()
  const corpo = tamanhoDoCorpo(todas)
  const passo = passoDasLinhas(todas, corpo)
  const margens = margensPorColuna(todas, corpo)
  const vocabulario = montarVocabulario(todas)

  const tamanhosDeTitulo = [...new Set(todas.filter(l => ehTitulo(l, corpo)).map(l => Math.round(l.tamanho)))].sort(
    (a, b) => b - a,
  )
  const nivelDoTitulo = (linha: Linha) =>
    (['h1', 'h2', 'h3'] as const)[Math.min(2, tamanhosDeTitulo.indexOf(Math.round(linha.tamanho)))]

  const blocos: Bloco[] = []
  const paginasSemTexto: number[] = []
  let atual: Bloco | null = null
  let anterior: Linha | null = null
  let marcaPendente: MarcaDePagina | null = null

  const textoFinal = (bloco: Bloco) => {
    const ultimo = bloco.partes[bloco.partes.length - 1]
    return typeof ultimo === 'string' ? ultimo : ''
  }
  const novoBloco = (tipo: Bloco['tipo'], pagina: number) => {
    atual = { tipo, partes: [], pagina }
    blocos.push(atual)
    return atual
  }
  const acrescentar = (bloco: Bloco, texto: string) => {
    if (marcaPendente) {
      bloco.partes.push(marcaPendente)
      marcaPendente = null
    }
    bloco.partes.push(texto)
  }

  paginas.forEach((pagina, i) => {
    marcaPendente = { pagina: pagina.numero, rotulo: pagina.rotulo }
    const linhas = linhasPorPagina[i]
    if (!linhas.length) {
      paginasSemTexto.push(pagina.numero)
      acrescentar(novoBloco('aviso', pagina.numero), AVISO_PAGINA_SEM_TEXTO)
      atual = null
      anterior = null
      return
    }
    for (const linha of linhas) {
      const titulo = ehTitulo(linha, corpo)
      const tipo = titulo ? nivelDoTitulo(linha) : 'p'
      const bloco: Bloco | null = atual
      const continuaTitulo =
        bloco !== null &&
        titulo &&
        anterior !== null &&
        bloco.tipo === tipo &&
        anterior.pagina === linha.pagina &&
        Math.abs(anterior.tamanho - linha.tamanho) < 0.5 &&
        anterior.y - linha.y <= linha.tamanho * 1.6
      const continuaParagrafo =
        bloco !== null && !titulo && bloco.tipo === 'p' && anterior !== null && !comecaParagrafo(anterior, linha, margens, passo)

      if ((continuaTitulo || continuaParagrafo) && bloco) {
        const ultimo = textoFinal(bloco)
        const { anterior: ajustado, separador } = juntarLinhas(ultimo, linha.texto, vocabulario)
        if (typeof bloco.partes[bloco.partes.length - 1] === 'string') {
          bloco.partes[bloco.partes.length - 1] = ajustado + separador
        }
        acrescentar(bloco, linha.texto)
      } else {
        acrescentar(novoBloco(tipo, linha.pagina), linha.texto)
      }
      anterior = linha
    }
  })

  // Junta os pedaços de texto vizinhos (sem marca de página entre eles).
  for (const bloco of blocos) {
    const partes: Parte[] = []
    for (const parte of bloco.partes) {
      const ultima = partes[partes.length - 1]
      if (typeof parte === 'string' && typeof ultima === 'string') partes[partes.length - 1] = ultima + parte
      else partes.push(parte)
    }
    bloco.partes = partes
  }

  return { blocos, paginasSemTexto }
}

// ---------------------------------------------------------------------------------------------
// Capítulos

const textoDoBloco = (bloco: Bloco) =>
  bloco.partes
    .filter((p): p is string => typeof p === 'string')
    .join('')
    .trim()

const comparavel = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

function dividirPorIndices(blocos: Bloco[], inicios: { indice: number; titulo: string }[], tituloInicial: string) {
  const capitulos: Capitulo[] = []
  const ordenados = [...inicios].sort((a, b) => a.indice - b.indice)
  if (ordenados[0]?.indice > 0) capitulos.push({ titulo: tituloInicial, blocos: blocos.slice(0, ordenados[0].indice) })
  ordenados.forEach((inicio, i) => {
    const fim = ordenados[i + 1]?.indice ?? blocos.length
    const trecho = blocos.slice(inicio.indice, fim)
    if (trecho.length) capitulos.push({ titulo: inicio.titulo, blocos: trecho })
  })
  return capitulos
}

function dividirEmCapitulos(doc: DocumentoPdf, blocos: Bloco[]): Capitulo[] {
  if (!blocos.length) return []
  const tituloInicial = 'Início'

  // 1. Pelos marcadores do PDF.
  const niveis = [...new Set(doc.marcadores.map(m => m.nivel))].sort((a, b) => a - b)
  for (const nivel of niveis) {
    const marcadores = doc.marcadores.filter(m => m.nivel === nivel)
    if (marcadores.length < 2) continue
    const inicios: { indice: number; titulo: string }[] = []
    let desde = 0
    for (const marcador of marcadores) {
      const naPagina = blocos.findIndex((b, i) => i >= desde && b.pagina >= marcador.pagina)
      if (naPagina < 0) continue
      const alvo = comparavel(marcador.titulo)
      const titulo = blocos.findIndex(
        (b, i) => i >= naPagina && b.pagina === marcador.pagina && b.tipo !== 'p' && comparavel(textoDoBloco(b)) === alvo,
      )
      const indice = titulo >= 0 ? titulo : naPagina
      if (inicios.some(i => i.indice === indice)) continue
      inicios.push({ indice, titulo: marcador.titulo.trim() })
      desde = indice
    }
    if (inicios.length >= 2) return dividirPorIndices(blocos, inicios, tituloInicial)
  }

  // 2. Pelos títulos, do maior para o menor.
  for (const tipo of ['h1', 'h2', 'h3'] as const) {
    const inicios = blocos.flatMap((b, indice) => (b.tipo === tipo ? [{ indice, titulo: textoDoBloco(b) }] : []))
    if (inicios.length >= 2) return dividirPorIndices(blocos, inicios, tituloInicial)
  }

  // 3. Em partes de algumas páginas.
  const rotulos = new Map(doc.paginas.map(p => [p.numero, p.rotulo]))
  const capitulos: Capitulo[] = []
  for (const bloco of blocos) {
    const parte = Math.floor((bloco.pagina - 1) / PAGINAS_POR_PARTE)
    let capitulo = capitulos[parte]
    if (!capitulo) {
      const primeira = parte * PAGINAS_POR_PARTE + 1
      const ultima = Math.min(doc.paginas.length, primeira + PAGINAS_POR_PARTE - 1)
      capitulo = capitulos[parte] = {
        titulo: `Páginas ${rotulos.get(primeira) ?? primeira} a ${rotulos.get(ultima) ?? ultima}`,
        blocos: [],
      }
    }
    capitulo.blocos.push(bloco)
  }
  const resultado = capitulos.filter(Boolean)
  if (resultado.length === 1 && doc.titulo) resultado[0].titulo = doc.titulo
  return resultado
}

// ---------------------------------------------------------------------------------------------

export function estruturar(doc: DocumentoPdf): DocumentoEstruturado {
  const brutas = doc.paginas.map(montarLinhas)
  const limpas = removerCabecalhosERodapes(brutas, doc.paginas).map(ordenarPagina)
  const { blocos, paginasSemTexto } = montarBlocos(doc.paginas, limpas)
  const primeiroTitulo = blocos.find(b => b.pagina === doc.paginas[0]?.numero && b.tipo === 'h1')
  return {
    blocos,
    capitulos: dividirEmCapitulos(doc, blocos),
    paginasSemTexto,
    tituloSugerido: primeiroTitulo ? textoDoBloco(primeiroTitulo) : undefined,
  }
}
