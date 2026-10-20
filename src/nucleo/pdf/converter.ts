// PDF → EPUB: o "texto adaptado". Roda uma vez, na importação.

import { escaparXml } from '../epub/comum'
import { escreverEpub, type CapituloEpub, type PaginaEpub } from '../epub/escrever'
import { estruturar, type Capitulo, type MarcaDePagina } from './estruturar'
import { extrairPdf, type OpcoesDeExtracao } from './extrair'
import { detectarIdioma, normalizarIdioma } from './idioma'

export interface ResultadoConversao {
  /** false quando o PDF é só imagem (digitalizado): fica só a página original. */
  temTexto: boolean
  epub: Uint8Array | null
  titulo: string | null
  autores: string[]
  idioma: string | null
  paginas: number
  paginasSemTexto: number
}

export interface OpcoesDeConversao extends OpcoesDeExtracao {
  identificador: string
  /** Título a usar se o PDF não tiver um que preste (normalmente, o nome do arquivo). */
  tituloReserva: string
}

/** Títulos que programas põem sozinhos e não dizem nada sobre o livro. */
const tituloQuePresta = (titulo: string | undefined) =>
  titulo &&
  titulo.length >= 3 &&
  !/\.(docx?|pdf|odt|rtf|tex|indd|pages)$/i.test(titulo) &&
  !/^(microsoft word|untitled|sem t[ií]tulo|documento?\s*\d*$|document\s*\d*$|slide\s*\d*$)/i.test(titulo)
    ? titulo
    : undefined

const separarAutores = (autor: string | undefined) =>
  tituloQuePresta(autor)
    ?.split(/\s*(?:;|&|,| e | and )\s*/)
    .map(a => a.trim())
    .filter(Boolean) ?? []

function paraXhtml(capitulos: Capitulo[]) {
  const paginas: PaginaEpub[] = []
  const marca = (m: MarcaDePagina, capitulo: number) => {
    const ancora = `pagina-${m.pagina}`
    paginas.push({ rotulo: m.rotulo, capitulo, ancora })
    return `<span epub:type="pagebreak" role="doc-pagebreak" id="${ancora}" aria-label="${escaparXml(m.rotulo)}"></span>`
  }
  const epub: CapituloEpub[] = capitulos.map((capitulo, i) => {
    const corpo = capitulo.blocos
      .map(bloco => {
        const conteudo = bloco.partes.map(p => (typeof p === 'string' ? escaparXml(p) : marca(p, i))).join('')
        return bloco.tipo === 'aviso' ? `<p class="aviso">${conteudo}</p>` : `<${bloco.tipo}>${conteudo}</${bloco.tipo}>`
      })
      .join('\n')
    return { titulo: capitulo.titulo, corpo: `<section epub:type="chapter">\n${corpo}\n</section>` }
  })
  return { capitulos: epub, paginas }
}

export async function converterPdfEmEpub(bytes: Uint8Array, opcoes: OpcoesDeConversao): Promise<ResultadoConversao> {
  const doc = await extrairPdf(bytes, opcoes)
  const autores = separarAutores(doc.autor)
  const caracteres = doc.paginas.reduce((soma, p) => soma + p.itens.reduce((s, i) => s + i.texto.trim().length, 0), 0)
  const temTexto = caracteres >= Math.max(40, doc.paginas.length * 15)

  if (!temTexto) {
    return {
      temTexto: false,
      epub: null,
      titulo: tituloQuePresta(doc.titulo) ?? null,
      autores,
      idioma: normalizarIdioma(doc.idioma),
      paginas: doc.paginas.length,
      paginasSemTexto: doc.paginas.length,
    }
  }

  const estruturado = estruturar(doc)
  const amostra = estruturado.blocos
    .slice(0, 200)
    .flatMap(b => b.partes.filter((p): p is string => typeof p === 'string'))
    .join(' ')
  const idioma = normalizarIdioma(doc.idioma) ?? detectarIdioma(amostra)
  const titulo = tituloQuePresta(doc.titulo) ?? estruturado.tituloSugerido ?? opcoes.tituloReserva
  const { capitulos, paginas } = paraXhtml(estruturado.capitulos)

  const epub = escreverEpub({
    identificador: opcoes.identificador,
    titulo,
    autores,
    idioma: idioma ?? 'und',
    capitulos,
    paginas,
  })

  return {
    temTexto: true,
    epub,
    titulo,
    autores,
    idioma,
    paginas: doc.paginas.length,
    paginasSemTexto: estruturado.paginasSemTexto.length,
  }
}
