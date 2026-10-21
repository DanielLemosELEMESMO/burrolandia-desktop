// Onde estão as imagens numa página de PDF, a partir da lista de operações de desenho do pdf.js.
// Serve para achar a capa dentro da primeira página: muitos PDFs trazem a capa como uma imagem no
// meio de uma página branca (às vezes com uma linha de texto em cima), e a capa do livro deve ser
// só a imagem.

/** Um retângulo no espaço da página do PDF (pontos, origem embaixo à esquerda). */
export interface Caixa {
  x: number
  y: number
  largura: number
  altura: number
}

/** Os códigos das operações que interessam, como em `OPS` do pdfjs-dist. */
export interface CodigosDeOperacao {
  save: number
  restore: number
  transform: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
  paintImageXObject: number
  paintInlineImageXObject: number
}

type Matriz = [number, number, number, number, number, number]

const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0]

/** m1 × m2: aplica m2 primeiro, depois m1 (como o Util.transform do pdf.js). */
const compor = (m1: Matriz, m2: Matriz): Matriz => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
]

/** Uma matriz de 6 números; o pdf.js 6 manda a dos formulários como Float32Array. */
function comoMatriz(valor: unknown): Matriz | null {
  const lista = Array.isArray(valor) ? valor : ArrayBuffer.isView(valor) ? Array.from(valor as Float32Array) : null
  return lista?.length === 6 && lista.every(n => typeof n === 'number' && Number.isFinite(n)) ? (lista as Matriz) : null
}

/** As caixas das imagens pintadas na página. Uma imagem ocupa o quadrado 1×1 da transformação atual. */
export function caixasDasImagens(operacoes: ArrayLike<number>, argumentos: ArrayLike<unknown>, ops: CodigosDeOperacao): Caixa[] {
  let atual = IDENTIDADE
  const pilha: Matriz[] = []
  const caixas: Caixa[] = []
  for (let i = 0; i < operacoes.length; i++) {
    const operacao = operacoes[i]
    const args = Array.isArray(argumentos[i]) ? (argumentos[i] as unknown[]) : []
    if (operacao === ops.save) pilha.push(atual)
    else if (operacao === ops.restore) atual = pilha.pop() ?? atual
    else if (operacao === ops.transform && comoMatriz(args)) atual = compor(atual, comoMatriz(args)!)
    else if (operacao === ops.paintFormXObjectBegin) {
      pilha.push(atual)
      const matriz = comoMatriz(args[0])
      if (matriz) atual = compor(atual, matriz)
    } else if (operacao === ops.paintFormXObjectEnd) atual = pilha.pop() ?? atual
    else if (operacao === ops.paintImageXObject || operacao === ops.paintInlineImageXObject) {
      const cantos = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => [x * atual[0] + y * atual[2] + atual[4], x * atual[1] + y * atual[3] + atual[5]])
      const xs = cantos.map(c => c[0])
      const ys = cantos.map(c => c[1])
      const [x, y] = [Math.min(...xs), Math.min(...ys)]
      caixas.push({ x, y, largura: Math.max(...xs) - x, altura: Math.max(...ys) - y })
    }
  }
  return caixas
}

const area = (c: Caixa) => c.largura * c.altura

const uniao = (a: Caixa, b: Caixa): Caixa => {
  const [x, y] = [Math.min(a.x, b.x), Math.min(a.y, b.y)]
  return {
    x,
    y,
    largura: Math.max(a.x + a.largura, b.x + b.largura) - x,
    altura: Math.max(a.y + a.altura, b.y + b.altura) - y,
  }
}

/** Encostadas ou sobrepostas (com uma folga de 2 pontos): partes da mesma imagem. */
const encostam = (a: Caixa, b: Caixa, folga = 2) =>
  a.x <= b.x + b.largura + folga &&
  b.x <= a.x + a.largura + folga &&
  a.y <= b.y + b.altura + folga &&
  b.y <= a.y + a.altura + folga

function recortar(caixa: Caixa, limite: Caixa): Caixa | null {
  const x = Math.max(caixa.x, limite.x)
  const y = Math.max(caixa.y, limite.y)
  const largura = Math.min(caixa.x + caixa.largura, limite.x + limite.largura) - x
  const altura = Math.min(caixa.y + caixa.altura, limite.y + limite.altura) - y
  return largura > 0 && altura > 0 ? { x, y, largura, altura } : null
}

// A capa ocupa boa parte da página, mas não toda (aí a página já é a capa), e é em pé.
const AREA_MINIMA = 0.25
const AREA_MAXIMA = 0.92
const PROPORCAO_MINIMA = 0.8
const PROPORCAO_MAXIMA = 2.2
/** Uma página com mais imagens que isso (cada letra uma imagem, por exemplo) só olha as maiores. */
const MAXIMO_DE_IMAGENS = 3000

/** Junta as caixas encostadas, até não haver mais nada encostado (a ordem não importa). */
function juntarEncostadas(caixas: Caixa[]): Caixa[] {
  // Primeiro, de uma vez, as que se tocam direto (as faixas de uma imagem cortada)…
  const chefe = caixas.map((_, i) => i)
  const raiz = (i: number): number => (chefe[i] === i ? i : (chefe[i] = raiz(chefe[i])))
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) if (encostam(caixas[i], caixas[j])) chefe[raiz(j)] = raiz(i)
  }
  const grupos = new Map<number, Caixa>()
  caixas.forEach((caixa, i) => {
    const grupo = grupos.get(raiz(i))
    grupos.set(raiz(i), grupo ? uniao(grupo, caixa) : caixa)
  })
  // …depois os grupos que passaram a se tocar (são poucos).
  const juntos = [...grupos.values()]
  for (let juntou = true; juntou; ) {
    juntou = false
    for (let i = 0; i < juntos.length && !juntou; i++) {
      for (let j = i + 1; j < juntos.length && !juntou; j++) {
        if (!encostam(juntos[i], juntos[j])) continue
        juntos[i] = uniao(juntos[i], juntos[j])
        juntos.splice(j, 1)
        juntou = true
      }
    }
  }
  return juntos
}

/**
 * A caixa da capa dentro da página: a maior imagem (juntando as partes de uma imagem cortada em
 * faixas, quantas forem), se ela for grande, em pé e não for a página inteira. Senão, null: a
 * página toda serve. Funciona no espaço da página do PDF ou no da tela, desde que os dois batam.
 */
export function capaNaPagina(caixas: Caixa[], pagina: Caixa): Caixa | null {
  const dentro = caixas
    .flatMap(c => recortar(c, pagina) ?? [])
    .sort((a, b) => area(b) - area(a))
    .slice(0, MAXIMO_DE_IMAGENS)
  const maior = juntarEncostadas(dentro).sort((a, b) => area(b) - area(a))[0]
  if (!maior) return null
  const fracao = area(maior) / area(pagina)
  const proporcao = maior.altura / maior.largura
  if (fracao < AREA_MINIMA || fracao > AREA_MAXIMA) return null
  if (proporcao < PROPORCAO_MINIMA || proporcao > PROPORCAO_MAXIMA) return null
  return maior
}

/** A janela de visão do pdf.js: a matriz da página para a tela (cuida da rotação e da origem). */
export interface Visao {
  transform: ArrayLike<number>
  width: number
  height: number
}

/** A caixa na tela (y para baixo) que cobre a caixa da página. */
function naTela(caixa: Caixa, [a, b, c, d, e, f]: ArrayLike<number> & number[]): Caixa {
  const cantos = [
    [caixa.x, caixa.y],
    [caixa.x + caixa.largura, caixa.y],
    [caixa.x, caixa.y + caixa.altura],
    [caixa.x + caixa.largura, caixa.y + caixa.altura],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f])
  const xs = cantos.map(p => p[0])
  const ys = cantos.map(p => p[1])
  const [x, y] = [Math.min(...xs), Math.min(...ys)]
  return { x, y, largura: Math.max(...xs) - x, altura: Math.max(...ys) - y }
}

/**
 * A capa como aparece na tela, em frações da página mostrada (0 a 1, y de cima para baixo), ou
 * null. "Em pé" é na tela: numa página girada, a capa em pé está deitada no arquivo.
 */
export function capaNaVisao(caixas: Caixa[], visao: Visao) {
  const matriz = Array.from(visao.transform)
  const capa = capaNaPagina(
    caixas.map(c => naTela(c, matriz)),
    { x: 0, y: 0, largura: visao.width, altura: visao.height },
  )
  if (!capa) return null
  return { x: capa.x / visao.width, y: capa.y / visao.height, largura: capa.largura / visao.width, altura: capa.altura / visao.height }
}

/** Pixels RGBA, como o getImageData do canvas devolve. */
export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Tinta: um pixel que não é branco nem quase branco. */
const ehTinta = (data: Uint8ClampedArray, i: number) => data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200
/** Uma ou duas linhas de texto (o aviso de OCR de muitos PDFs digitalizados) cabem nesta fração da altura. */
const MARGEM_COM_TINTA = 0.06
/** A borda da imagem desenhada sai serrilhada: esta folga em volta da capa não conta. */
const FOLGA = 3

/**
 * Fora da capa, a página está em branco? Conta as linhas de pixels com tinta fora dela (pontinhos
 * soltos não contam); até uma ou duas linhas de texto, sim. Título, autor ou uma coluna de texto em
 * volta da imagem querem dizer que a página inteira é a capa, e não se recorta.
 */
export function margensEmBranco({ data, width, height }: Pixels, capa: { x: number; y: number; largura: number; altura: number }) {
  const esquerda = Math.max(0, Math.floor(capa.x * width) - FOLGA)
  const direita = Math.min(width, Math.ceil((capa.x + capa.largura) * width) + FOLGA)
  const topo = Math.max(0, Math.floor(capa.y * height) - FOLGA)
  const base = Math.min(height, Math.ceil((capa.y + capa.altura) * height) + FOLGA)
  const minimoPorLinha = Math.max(3, Math.round(width * 0.003))
  let comTinta = 0
  for (let y = 0; y < height; y++) {
    const aoLado = y >= topo && y < base
    let tinta = 0
    for (let x = 0; x < width && tinta < minimoPorLinha; x++) {
      if (aoLado && x >= esquerda && x < direita) {
        x = direita - 1
        continue
      }
      if (ehTinta(data, (y * width + x) * 4)) tinta++
    }
    if (tinta >= minimoPorLinha) comTinta++
  }
  return comTinta <= height * MARGEM_COM_TINTA
}
