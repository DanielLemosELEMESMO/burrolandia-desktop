import { describe, expect, it } from 'vitest'
import { PREFERENCIAS_PADRAO } from '@nucleo/tipos'
import { validarLocator, validarPreferencias } from '@nucleo/validacao'

describe('validarPreferencias', () => {
  it('aceita valores conhecidos', () => {
    expect(validarPreferencias({ tema: 'noite', fluxo: 'rolagem', tamanho: 22 })).toEqual({
      tema: 'noite',
      fluxo: 'rolagem',
      tamanho: 22,
    })
  })

  it('descarta chaves e valores desconhecidos', () => {
    expect(validarPreferencias({ tema: 'neon', letra: 'comic-sans', outra: 1 })).toEqual({})
  })

  it('limita o tamanho da letra', () => {
    expect(validarPreferencias({ tamanho: 4 })).toEqual({ tamanho: 14 })
    expect(validarPreferencias({ tamanho: 90 })).toEqual({ tamanho: 32 })
    expect(validarPreferencias({ tamanho: 'grande' })).toEqual({})
  })

  it('ignora o que não é objeto', () => {
    expect(validarPreferencias(null)).toEqual({})
    expect(validarPreferencias('noite')).toEqual({})
  })

  it('aceita o padrão inteiro', () => {
    expect(validarPreferencias(PREFERENCIAS_PADRAO)).toEqual(PREFERENCIAS_PADRAO)
  })
})

describe('validarLocator', () => {
  const valido = {
    href: 'OEBPS/capitulo-001.xhtml',
    type: 'application/xhtml+xml',
    title: 'I. Do título',
    locations: { progression: 0.5, totalProgression: 0.1, cfi: 'epubcfi(/6/4!/4/2/1:0)', position: 3 },
    text: { highlight: 'Uma noite destas' },
  }

  it('aceita um Locator bem formado', () => {
    expect(validarLocator(valido)).toEqual(valido)
  })

  it('recusa sem href ou sem locations', () => {
    expect(validarLocator({ ...valido, href: 3 })).toBeNull()
    expect(validarLocator({ href: 'a', type: 'b' })).toBeNull()
    expect(validarLocator(undefined)).toBeNull()
  })

  it('descarta campos estranhos e números fora de 0 a 1', () => {
    expect(
      validarLocator({ ...valido, extra: 'x', locations: { progression: 7, totalProgression: 0.2, cfi: 5 } }),
    ).toEqual({ ...valido, locations: { totalProgression: 0.2 } })
  })

  it('aceita fragmentos, como a página de um PDF', () => {
    expect(validarLocator({ ...valido, locations: { fragments: ['page=12', 7, 'pagina-12'] } })?.locations).toEqual({
      fragments: ['page=12', 'pagina-12'],
    })
  })

  it('corta textos longos demais', () => {
    const longo = 'a'.repeat(5000)
    expect(validarLocator({ ...valido, text: { highlight: longo } })?.text?.highlight).toHaveLength(500)
  })
})
