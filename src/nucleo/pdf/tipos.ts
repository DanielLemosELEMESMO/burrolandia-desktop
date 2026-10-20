// O PDF como o conversor enxerga: só texto com posição, sem depender do pdf.js.
// Coordenadas em pontos, com a origem embaixo à esquerda (como no PDF): y maior = mais alto na página.

export interface ItemPdf {
  texto: string
  x: number
  y: number
  largura: number
  /** Altura da letra, em pontos (na prática, o tamanho da fonte). */
  altura: number
}

export interface PaginaPdf {
  /** 1, 2, 3… */
  numero: number
  /** Como a página se chama no livro (pode ser "iv", "12"…). */
  rotulo: string
  largura: number
  altura: number
  itens: ItemPdf[]
}

/** Uma entrada do sumário do PDF (os "marcadores"). */
export interface MarcadorPdf {
  titulo: string
  pagina: number
  nivel: number
}

export interface DocumentoPdf {
  paginas: PaginaPdf[]
  marcadores: MarcadorPdf[]
  titulo?: string
  autor?: string
  idioma?: string
}
