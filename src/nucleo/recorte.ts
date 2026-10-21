// O retângulo do recorte da capa, em frações da imagem (0 a 1, com o y de cima para baixo): mover,
// puxar uma alça, andar pelo teclado e virar pixels. Sem DOM: a tela usa, os testes conferem.

export interface Retangulo {
  x: number
  y: number
  largura: number
  altura: number
}

/** As alças: os lados (norte, sul, leste, oeste) e os cantos. */
export type Alca = 'n' | 's' | 'l' | 'o' | 'ne' | 'no' | 'se' | 'so'

export const INTEIRO: Retangulo = { x: 0, y: 0, largura: 1, altura: 1 }

/** O menor recorte: 5% da imagem em cada lado. */
const MINIMO = 0.05
/** Um toque de seta anda 1% da imagem. */
const PASSO = 0.01

/** Dentro da imagem e nunca menor que o mínimo. */
export function limitar(r: Retangulo, minimo = MINIMO): Retangulo {
  const largura = Math.min(1, Math.max(minimo, r.largura))
  const altura = Math.min(1, Math.max(minimo, r.altura))
  return {
    x: Math.min(1 - largura, Math.max(0, r.x)),
    y: Math.min(1 - altura, Math.max(0, r.y)),
    largura,
    altura,
  }
}

/** Leva o retângulo inteiro; para na borda da imagem. */
export const mover = (r: Retangulo, dx: number, dy: number) => limitar({ ...r, x: r.x + dx, y: r.y + dy })

// Que bordas cada alça leva (nordeste, sudeste, noroeste, sudoeste).
const OESTE: Alca[] = ['o', 'no', 'so']
const LESTE: Alca[] = ['l', 'ne', 'se']
const NORTE: Alca[] = ['n', 'ne', 'no']
const SUL: Alca[] = ['s', 'se', 'so']

/** Puxa uma alça: só as bordas dela andam, até a borda da imagem ou até o tamanho mínimo. */
export function puxar(r: Retangulo, alca: Alca, dx: number, dy: number): Retangulo {
  let [esquerda, topo, direita, base] = [r.x, r.y, r.x + r.largura, r.y + r.altura]
  if (OESTE.includes(alca)) esquerda = Math.min(Math.max(0, esquerda + dx), direita - MINIMO)
  if (LESTE.includes(alca)) direita = Math.max(Math.min(1, direita + dx), esquerda + MINIMO)
  if (NORTE.includes(alca)) topo = Math.min(Math.max(0, topo + dy), base - MINIMO)
  if (SUL.includes(alca)) base = Math.max(Math.min(1, base + dy), topo + MINIMO)
  return limitar({ x: esquerda, y: topo, largura: direita - esquerda, altura: base - topo })
}

const DIRECOES: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Setas movem o recorte; com Shift, mudam o tamanho pelo canto de baixo à direita. null: outra tecla. */
export function pelaTecla(r: Retangulo, tecla: string, comShift: boolean): Retangulo | null {
  const direcao = DIRECOES[tecla]
  if (!direcao) return null
  const [dx, dy] = [direcao[0] * PASSO, direcao[1] * PASSO]
  return comShift ? puxar(r, 'se', dx, dy) : mover(r, dx, dy)
}

/** O recorte em pixels inteiros de uma imagem de largura × altura. */
export function emPixels(r: Retangulo, largura: number, altura: number) {
  const x = Math.min(largura - 1, Math.max(0, Math.round(r.x * largura)))
  const y = Math.min(altura - 1, Math.max(0, Math.round(r.y * altura)))
  return {
    x,
    y,
    largura: Math.max(1, Math.min(largura - x, Math.round(r.largura * largura))),
    altura: Math.max(1, Math.min(altura - y, Math.round(r.altura * altura))),
  }
}
