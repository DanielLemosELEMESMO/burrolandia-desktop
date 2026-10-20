// O CSS que entra dentro do livro (nos iframes do foliate) e os atributos do paginador.
// Sem DOM: dá para testar no Node.

import { MARCA, TEMAS } from '@nucleo/cores'
import type { Preferencias, TemaEfetivo } from '@nucleo/tipos'

export interface FontesLocais {
  literata: { normal: string; italico: string }
  atkinson: { normal: string; italico: string }
}

// A página do livro em cada tema: Creme Leitura com Grafite Focado; links em ameixa (em lilás na
// Noite: o ouro fica para os detalhes, não para o texto); a seleção no Lilás Pensativo, misturado à
// página para o texto continuar legível (contraste ≥ 6,5:1).
const CORES: Record<TemaEfetivo, { pagina: string; tinta: string; acento: string; selecao: string; esquema: string }> = {
  papel: { ...TEMAS.papel, acento: MARCA.ameixa, selecao: '#dbccdb', esquema: 'light' },
  sepia: { ...TEMAS.sepia, acento: MARCA.ameixa, selecao: '#d7c7cb', esquema: 'light' },
  noite: { ...TEMAS.noite, acento: MARCA.lilas, selecao: '#53455e', esquema: 'dark' },
}

const ALTURA_DA_LINHA = { compacto: 1.35, confortavel: 1.55, amplo: 1.8 }
const LARGURA = { estreita: 560, media: 660, larga: 820 }

const FAMILIAS = {
  literata: "'Literata Variable', Georgia, serif",
  atkinson: "'Atkinson Hyperlegible Next Variable', 'Segoe UI', sans-serif",
}

const faceDaFonte = (familia: string, fonte: { normal: string; italico: string }) => `
@font-face { font-family: '${familia}'; src: url("${fonte.normal}") format('woff2'); font-weight: 200 900; font-style: normal; font-display: block; }
@font-face { font-family: '${familia}'; src: url("${fonte.italico}") format('woff2'); font-weight: 200 900; font-style: italic; font-display: block; }`

export function estiloDoLivro(p: Preferencias, tema: TemaEfetivo, fontes: FontesLocais): string {
  const cor = CORES[tema]
  const altura = ALTURA_DA_LINHA[p.espacamento]
  const letra =
    p.letra === 'original'
      ? ''
      : `
body { font-family: ${FAMILIAS[p.letra]} !important; }
body *:not(code, pre, kbd, samp, tt, code *, pre *) { font-family: inherit !important; }`

  return `
${faceDaFonte('Literata Variable', fontes.literata)}
${faceDaFonte('Atkinson Hyperlegible Next Variable', fontes.atkinson)}
html {
  color-scheme: ${cor.esquema};
  font-size: ${p.tamanho}px !important;
}
html, body {
  background: ${cor.pagina} !important;
  color: ${cor.tinta} !important;
}
body { font-size: 1rem !important; }
body *:not(a, img, svg, svg *, video) {
  color: inherit !important;
  background-color: transparent !important;
}
${letra}
p, li, blockquote, dd, dt, td {
  line-height: ${altura} !important;
}
p, li, blockquote, dd {
  text-align: ${p.alinhamento === 'justificado' ? 'justify' : 'start'};
  hyphens: ${p.alinhamento === 'justificado' ? 'auto' : 'manual'};
  widows: 2;
  orphans: 2;
}
[align="center"] { text-align: center; }
[align="right"] { text-align: right; }
a { color: ${cor.acento} !important; }
img, svg, video { max-width: 100%; height: auto; }
${tema === 'noite' ? 'img { filter: brightness(0.88); }' : ''}
::selection { background: ${cor.selecao}; }
pre { white-space: pre-wrap !important; }
`
}

export function atributosDoLayout(p: Preferencias, movimentoReduzido: boolean) {
  return {
    flow: p.fluxo === 'rolagem' ? 'scrolled' : 'paginated',
    'max-inline-size': `${LARGURA[p.largura]}px`,
    'max-column-count': p.colunas === 'duas' ? '2' : '1',
    gap: '6%',
    // Nas páginas, as faixas de cima e de baixo (com o dock) cabem na margem e nunca cobrem o texto.
    // Na rolagem, a área do livro já começa abaixo da faixa de cima e acaba acima da de baixo (leitor.css).
    margin: p.fluxo === 'rolagem' ? '24px' : '72px',
    animated: !movimentoReduzido,
  }
}
