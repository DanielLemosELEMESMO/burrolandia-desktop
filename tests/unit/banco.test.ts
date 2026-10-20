import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Banco, type NovoLivro } from '../../src/main/banco'
import type { Locator } from '@nucleo/tipos'

const novoLivro = (parcial: Partial<NovoLivro> = {}): NovoLivro => ({
  id: crypto.randomUUID(),
  titulo: 'Dom Casmurro',
  autores: ['Machado de Assis'],
  idioma: 'pt-BR',
  formatoOriginal: 'epub',
  arquivoOriginal: 'original.epub',
  arquivoLeitura: 'original.epub',
  capa: 'capa.jpg',
  hashSha256: crypto.randomUUID().replace(/-/g, ''),
  tamanhoBytes: 1234,
  identificadores: { isbn: ['8535902775'], outros: [] },
  estado: 'pronto',
  adicionadoEm: '2026-10-20T10:00:00.000Z',
  ...parcial,
})

const posicao: Locator = {
  href: 'OEBPS/capitulo-002.xhtml',
  type: 'application/xhtml+xml',
  title: 'Do livro',
  locations: { progression: 0.25, totalProgression: 0.4, cfi: 'epubcfi(/6/6!/4/2/1:0)' },
  text: { highlight: 'Agora que expliquei o título' },
}

describe('Banco', () => {
  let pasta: string
  let banco: Banco

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'burrolandia-banco-'))
    banco = new Banco(join(pasta, 'burrolandia.db'))
  })

  afterEach(() => {
    banco.fechar()
    rmSync(pasta, { recursive: true, force: true })
  })

  it('guarda um livro novo sem posição e com progresso zero', () => {
    const novo = novoLivro()
    const livro = banco.inserirLivro(novo)
    expect(livro).toMatchObject({ ...novo, posicao: null, progresso: 0, abertoEm: null })
    expect(banco.obterLivro(novo.id)).toEqual(livro)
  })

  it('acha um livro pelo hash do arquivo', () => {
    const livro = banco.inserirLivro(novoLivro({ hashSha256: 'abc123' }))
    expect(banco.obterPorHash('abc123')?.id).toBe(livro.id)
    expect(banco.obterPorHash('outro')).toBeNull()
  })

  it('não aceita o mesmo arquivo duas vezes', () => {
    banco.inserirLivro(novoLivro({ hashSha256: 'repetido' }))
    expect(() => banco.inserirLivro(novoLivro({ hashSha256: 'repetido' }))).toThrow()
  })

  it('lista primeiro os abertos mais recentemente, depois os novos', () => {
    const antigo = banco.inserirLivro(novoLivro({ titulo: 'Antigo', adicionadoEm: '2026-10-01T00:00:00.000Z' }))
    const novo = banco.inserirLivro(novoLivro({ titulo: 'Novo', adicionadoEm: '2026-10-19T00:00:00.000Z' }))
    const lido = banco.inserirLivro(novoLivro({ titulo: 'Lido', adicionadoEm: '2026-09-01T00:00:00.000Z' }))
    banco.marcarAberto(lido.id, new Date('2026-10-20T08:00:00.000Z'))
    banco.marcarAberto(antigo.id, new Date('2026-10-20T09:00:00.000Z'))
    expect(banco.listarLivros().map(l => l.titulo)).toEqual(['Antigo', 'Lido', 'Novo'])
    expect(novo.abertoEm).toBeNull()
  })

  it('salva a posição e o progresso, e eles sobrevivem a reabrir o banco', () => {
    const livro = banco.inserirLivro(novoLivro())
    banco.salvarPosicao(livro.id, posicao)
    banco.fechar()
    banco = new Banco(join(pasta, 'burrolandia.db'))
    const salvo = banco.obterLivro(livro.id)
    expect(salvo?.posicao).toEqual(posicao)
    expect(salvo?.progresso).toBe(0.4)
  })

  it('remove um livro', () => {
    const livro = banco.inserirLivro(novoLivro())
    banco.removerLivro(livro.id)
    expect(banco.obterLivro(livro.id)).toBeNull()
    expect(banco.listarLivros()).toEqual([])
  })

  it('guarda e lê preferências em JSON', () => {
    expect(banco.lerPreferencia('leitura')).toBeUndefined()
    banco.salvarPreferencia('leitura', { tema: 'noite', tamanho: 21 })
    banco.salvarPreferencia('leitura', { tema: 'sepia', tamanho: 22 })
    expect(banco.lerPreferencia('leitura')).toEqual({ tema: 'sepia', tamanho: 22 })
  })
})
