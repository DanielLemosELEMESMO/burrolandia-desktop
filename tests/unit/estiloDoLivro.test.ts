import { describe, expect, it } from 'vitest'
import { PREFERENCIAS_PADRAO } from '@nucleo/tipos'
import { atributosDoLayout, estiloDoLivro } from '../../src/renderer/src/leitor/estiloDoLivro'

const fontes = {
  literata: { normal: 'app://burrolandia/assets/literata.woff2', italico: 'app://burrolandia/assets/literata-i.woff2' },
  atkinson: { normal: 'app://burrolandia/assets/atkinson.woff2', italico: 'app://burrolandia/assets/atkinson-i.woff2' },
}

describe('estiloDoLivro', () => {
  it('pinta a página e o texto com as cores do tema', () => {
    const css = estiloDoLivro({ ...PREFERENCIAS_PADRAO, tema: 'noite' }, 'noite', fontes)
    expect(css).toContain('#141816') // página da Noite
    expect(css).toContain('#dfe3dd') // tinta da Noite
    expect(css).toContain('color-scheme: dark')
  })

  it('aplica a letra escolhida, com a fonte local', () => {
    const css = estiloDoLivro({ ...PREFERENCIAS_PADRAO, letra: 'atkinson' }, 'papel', fontes)
    expect(css).toContain(`url("${fontes.atkinson.normal}")`)
    expect(css).toMatch(/font-family: 'Atkinson Hyperlegible Next Variable'.*!important/)
  })

  it('mantém a letra do livro quando a escolha é "original"', () => {
    const css = estiloDoLivro({ ...PREFERENCIAS_PADRAO, letra: 'original' }, 'papel', fontes)
    expect(css).not.toMatch(/font-family: [^;]*!important/)
  })

  it('aplica tamanho, espaçamento e alinhamento', () => {
    const css = estiloDoLivro(
      { ...PREFERENCIAS_PADRAO, tamanho: 23, espacamento: 'amplo', alinhamento: 'justificado' },
      'papel',
      fontes,
    )
    expect(css).toContain('font-size: 23px !important')
    expect(css).toContain('line-height: 1.8 !important')
    expect(css).toContain('text-align: justify')
  })
})

describe('atributosDoLayout', () => {
  it('traduz as preferências para os atributos do paginador', () => {
    expect(atributosDoLayout({ ...PREFERENCIAS_PADRAO, largura: 'larga', colunas: 'uma', fluxo: 'rolagem' }, false)).toEqual({
      flow: 'scrolled',
      'max-inline-size': '820px',
      'max-column-count': '1',
      gap: '6%',
      margin: '56px',
      animated: true,
    })
  })

  it('desliga a animação de página para quem prefere movimento reduzido', () => {
    expect(atributosDoLayout(PREFERENCIAS_PADRAO, true).animated).toBe(false)
  })
})
