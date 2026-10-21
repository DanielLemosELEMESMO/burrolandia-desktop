import { describe, expect, it } from 'vitest'
import { decidir, type LivroNoAparelho } from '@nucleo/nuvem/aparelho'
import type { LivroNaNuvem } from '@nucleo/nuvem/regras'

const remoto = (campos: Partial<LivroNaNuvem> = {}): LivroNaNuvem => ({
  hash: 'a'.repeat(64),
  titulo: 'Dom Casmurro',
  autores: ['Machado de Assis'],
  idioma: 'pt-BR',
  formato: 'epub',
  tamanhoBytes: 1000,
  identificadores: { isbn: [], outros: [] },
  obraId: null,
  edicaoId: null,
  reconhecimento: 'pendente',
  obra: null,
  edicao: null,
  metadadosEm: '2026-10-01T10:00:00.000Z',
  capa: null,
  capaEm: null,
  arquivo: null,
  posicao: null,
  progresso: 0,
  posicaoEm: null,
  adicionadoEm: '2026-10-01T09:00:00.000Z',
  abertoEm: null,
  removidoEm: null,
  atualizadoEm: '2026-10-01T10:00:00.000000+00:00',
  ...campos,
})

const local = (campos: Partial<LivroNoAparelho> = {}): LivroNoAparelho => ({
  metadadosEm: '2026-10-01T10:00:00.000Z',
  capa: null,
  capaEm: null,
  capaNaNuvem: null,
  arquivoNaNuvem: null,
  posicaoEm: null,
  abertoEm: null,
  versaoEnviada: 1,
  ...campos,
})

const posicao = { href: 'c.xhtml', type: 'application/xhtml+xml', locations: { cfi: '/6/4' } }

describe('decidir: um livro que veio da nuvem neste aparelho', () => {
  it('livro novo: entra; lápide de um livro que não existe aqui: nada', () => {
    expect(decidir(null, remoto(), false)).toEqual({ tipo: 'criar' })
    expect(decidir(null, remoto({ removidoEm: '2026-10-02T00:00:00Z' }), false)).toEqual({ tipo: 'ignorar' })
  })

  it('removido em outro aparelho: sai daqui só se já estava sincronizado', () => {
    const lapide = remoto({ removidoEm: '2026-10-02T00:00:00Z' })
    expect(decidir(local({ versaoEnviada: 3 }), lapide, false)).toEqual({ tipo: 'remover' })
    // Um aparelho que acabou de entrar com o mesmo livro: ele vai para a conta como novo.
    expect(decidir(local({ versaoEnviada: 0 }), lapide, false)).toEqual({ tipo: 'ignorar' })
  })

  it('removido aqui e ainda não enviado: a remoção vai, a nuvem decide', () => {
    expect(decidir(local(), remoto({ posicao, posicaoEm: '2026-10-05T00:00:00Z' }), true)).toEqual({ tipo: 'ignorar' })
  })

  it('a posição mais recente vence; a mais antiga não volta', () => {
    const daqui = local({ posicaoEm: '2026-10-03T00:00:00Z' })
    expect(decidir(daqui, remoto({ posicao, posicaoEm: '2026-10-04T00:00:00Z' }), false)).toMatchObject({ posicao: true })
    expect(decidir(daqui, remoto({ posicao, posicaoEm: '2026-10-02T00:00:00Z' }), false)).toEqual({ tipo: 'ignorar' })
  })

  it('título e obra: vale a mudança mais recente', () => {
    expect(decidir(local(), remoto({ metadadosEm: '2026-10-02T00:00:00Z' }), false)).toMatchObject({ metadados: true })
    expect(decidir(local({ metadadosEm: '2026-10-03T00:00:00Z' }), remoto({ metadadosEm: '2026-10-02T00:00:00Z' }), false)).toEqual({ tipo: 'ignorar' })
  })

  it('capa: outra e mais nova, baixa; a mesma daqui, só marca que está na nuvem', () => {
    const nova = remoto({ capa: 'capa-bbbbbbbbbbbb.jpg', capaEm: '2026-10-02T00:00:00Z' })
    expect(decidir(local({ capa: 'capa-aaaaaaaaaaaa.jpg', capaEm: '2026-10-01T00:00:00Z' }), nova, false)).toMatchObject({ capa: 'baixar' })
    expect(decidir(local({ capa: 'capa-bbbbbbbbbbbb.jpg', capaEm: '2026-10-01T00:00:00Z' }), nova, false)).toMatchObject({ capa: 'marcar' })
    // A capa daqui é mais nova (ainda vai subir): a da nuvem não volta.
    expect(decidir(local({ capa: 'capa-cccccccccccc.jpg', capaEm: '2026-10-03T00:00:00Z' }), nova, false)).toEqual({ tipo: 'ignorar' })
  })

  it('o arquivo já está na nuvem: este aparelho não precisa enviar (e, se já sabia, nada muda)', () => {
    const arquivo = `${'a'.repeat(64)}.epub`
    expect(decidir(local(), remoto({ arquivo }), false)).toMatchObject({ tipo: 'atualizar', arquivo: true })
    expect(decidir(local({ arquivoNaNuvem: arquivo }), remoto({ arquivo }), false)).toEqual({ tipo: 'ignorar' })
  })

  it('o eco do que este aparelho acabou de mandar não muda nada', () => {
    const daqui = local({ capa: 'capa-aaaaaaaaaaaa.jpg', capaEm: '2026-10-01T00:00:00Z', capaNaNuvem: 'capa-aaaaaaaaaaaa.jpg', posicaoEm: '2026-10-01T00:00:00Z' })
    const eco = remoto({ capa: 'capa-aaaaaaaaaaaa.jpg', capaEm: '2026-10-01T00:00:00+00:00', posicao, posicaoEm: '2026-10-01T00:00:00+00:00' })
    expect(decidir(daqui, eco, false)).toEqual({ tipo: 'ignorar' })
  })
})
