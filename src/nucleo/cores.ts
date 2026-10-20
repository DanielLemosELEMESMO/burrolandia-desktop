// As cores da marca (docs/marca) para o código que não lê CSS: o fundo da janela no processo
// principal, o CSS de dentro do livro e os desenhos em SVG. As mesmas estão em estilos/tokens.css,
// e um teste confere que as duas listas batem.

export const MARCA = {
  ameixa: '#2f0e2f',
  creme: '#f6ebdd',
  ouro: '#d4af7c',
  lilas: '#b9a7d9',
  grafite: '#1f1f24',
} as const

/** A página e o texto de cada tema de leitura ("papel" aparece na tela como Creme). */
export const TEMAS = {
  papel: { pagina: MARCA.creme, tinta: MARCA.grafite },
  sepia: { pagina: '#ebdcc2', tinta: '#3a2a1c' },
  noite: { pagina: '#1c101c', tinta: '#e8dccb' },
} as const
