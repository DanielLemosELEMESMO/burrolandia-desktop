import { describe, expect, it } from 'vitest'
import { paginaDoLocator } from '@nucleo/tipos'

describe('paginaDoLocator', () => {
  it('lê a página do PDF nos fragmentos page=N e pagina-N', () => {
    expect(paginaDoLocator({ locations: { fragments: ['page=12'] } })).toBe(12)
    expect(paginaDoLocator({ locations: { fragments: ['outra', 'pagina-3'] } })).toBe(3)
  })

  it('devolve null sem fragmento de página', () => {
    expect(paginaDoLocator({ locations: { cfi: 'epubcfi(/6/2)' } })).toBeNull()
    expect(paginaDoLocator(null)).toBeNull()
  })
})
