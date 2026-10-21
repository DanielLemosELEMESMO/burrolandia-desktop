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

const ehMatriz = (valor: unknown): valor is Matriz =>
  Array.isArray(valor) && valor.length === 6 && valor.every(n => typeof n === 'number' && Number.isFinite(n))

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
    else if (operacao === ops.transform && ehMatriz(args)) atual = compor(atual, args)
    else if (operacao === ops.paintFormXObjectBegin) {
      pilha.push(atual)
      if (ehMatriz(args[0])) atual = compor(atual, args[0])
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
const MAXIMO_DE_PARTES = 64

/**
 * A caixa da capa dentro da página: a maior imagem (juntando as partes de uma imagem cortada em
 * faixas), se ela for grande, em pé e não for a página inteira. Senão, null: a página toda serve.
 */
export function capaNaPagina(caixas: Caixa[], pagina: Caixa): Caixa | null {
  // Pedacinhos (menos de 0,5% da página) não fazem capa; e uns poucos bastam para juntar as faixas.
  const grupos = caixas
    .flatMap(c => recortar(c, pagina) ?? [])
    .filter(c => area(c) >= area(pagina) * 0.005)
    .sort((a, b) => area(b) - area(a))
    .slice(0, MAXIMO_DE_PARTES)
  // Junta até não haver mais nada encostado (a ordem das faixas não importa).
  for (let juntou = true; juntou; ) {
    juntou = false
    for (let i = 0; i < grupos.length && !juntou; i++) {
      for (let j = i + 1; j < grupos.length && !juntou; j++) {
        if (!encostam(grupos[i], grupos[j])) continue
        grupos[i] = uniao(grupos[i], grupos[j])
        grupos.splice(j, 1)
        juntou = true
      }
    }
  }
  const maior = grupos.sort((a, b) => area(b) - area(a))[0]
  if (!maior) return null
  const fracao = area(maior) / area(pagina)
  const proporcao = maior.altura / maior.largura
  if (fracao < AREA_MINIMA || fracao > AREA_MAXIMA) return null
  if (proporcao < PROPORCAO_MINIMA || proporcao > PROPORCAO_MAXIMA) return null
  return maior
}
