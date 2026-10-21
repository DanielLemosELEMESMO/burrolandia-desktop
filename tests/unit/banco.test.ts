import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Banco, type NovoLivro } from '../../src/main/banco'
import type { Edicao, Locator, Obra } from '@nucleo/tipos'

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
    expect(livro).toMatchObject({ obraId: null, edicaoId: null, reconhecimento: 'pendente' })
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

  it('atualiza a capa de um livro', () => {
    const livro = banco.inserirLivro(novoLivro({ capa: null }))
    banco.atualizarLivro(livro.id, { capa: 'capa.jpg' })
    expect(banco.obterLivro(livro.id)?.capa).toBe('capa.jpg')
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

const obra: Obra = {
  id: 'OL1003040W',
  titulo: 'Dom Casmurro',
  autores: ['Machado de Assis'],
  primeiroAno: 1900,
  edicoes: 90,
  capaId: 647501,
  assuntos: ['Fiction', 'Brazilian fiction'],
  descricao: null,
}

const edicao: Edicao = {
  id: 'OL61241820M',
  obraId: 'OL1003040W',
  titulo: 'Dom Casmurro',
  editoras: ['Penguin-Companhia'],
  publicadaEm: '16/07/2016',
  ano: 2016,
  paginas: 400,
  idiomas: ['por'],
  isbn: ['9788582850350'],
  capaId: 15167286,
}

describe('Banco: catálogo (etapa 3)', () => {
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

  it('guarda a obra e a edição e liga o livro a elas', () => {
    const livro = banco.inserirLivro(novoLivro())
    banco.salvarObra(obra)
    banco.salvarEdicao(edicao)
    banco.ligarAoCatalogo(livro.id, { obraId: obra.id, edicaoId: edicao.id, reconhecimento: 'isbn' })

    expect(banco.obterLivro(livro.id)).toMatchObject({ obraId: obra.id, edicaoId: edicao.id, reconhecimento: 'isbn' })
    expect(banco.obterObra(obra.id)).toEqual(obra)
    expect(banco.obterEdicao(edicao.id)).toEqual(edicao)
  })

  it('atualizar a obra sem descrição não apaga a descrição que já tinha', () => {
    banco.salvarObra({ ...obra, descricao: 'Publicado pela primeira vez em 1899.' })
    banco.salvarObra({ ...obra, edicoes: 91 })
    expect(banco.obterObra(obra.id)).toMatchObject({ edicoes: 91, descricao: 'Publicado pela primeira vez em 1899.' })
  })

  it('lista os livros que ainda não foram procurados no catálogo', () => {
    const pendente = banco.inserirLivro(novoLivro())
    const achado = banco.inserirLivro(novoLivro())
    banco.salvarObra(obra)
    banco.ligarAoCatalogo(achado.id, { obraId: obra.id, edicaoId: null, reconhecimento: 'titulo' })
    expect(banco.livrosPendentes()).toEqual([pendente.id])
  })

  it('um banco da versão anterior ganha o catálogo, com os livros pendentes', () => {
    banco.fechar()
    const caminho = join(pasta, 'antigo.db')
    const antigo = new DatabaseSync(caminho)
    antigo.exec(`CREATE TABLE livros (
      id TEXT PRIMARY KEY, titulo TEXT NOT NULL, autores TEXT NOT NULL, idioma TEXT, formato_original TEXT NOT NULL,
      arquivo_original TEXT NOT NULL, arquivo_leitura TEXT, capa TEXT, hash_sha256 TEXT NOT NULL UNIQUE,
      tamanho_bytes INTEGER NOT NULL, identificadores TEXT NOT NULL, estado TEXT NOT NULL, posicao TEXT,
      progresso REAL NOT NULL DEFAULT 0, adicionado_em TEXT NOT NULL, aberto_em TEXT, atualizado_em TEXT NOT NULL);
    CREATE TABLE preferencias (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado_em TEXT NOT NULL);
    INSERT INTO livros VALUES ('00000000-0000-4000-8000-000000000001', 'Iracema', '["José de Alencar"]', 'pt-BR',
      'epub', 'original.epub', 'original.epub', NULL, 'abc', 10, '{"isbn":[],"outros":[]}', 'pronto', NULL, 0,
      '2026-10-01T00:00:00.000Z', NULL, '2026-10-01T00:00:00.000Z');
    PRAGMA user_version = 1;`)
    antigo.close()

    banco = new Banco(caminho)
    expect(banco.listarLivros()).toMatchObject([{ titulo: 'Iracema', obraId: null, edicaoId: null, reconhecimento: 'pendente' }])
    banco.salvarObra(obra)
    expect(banco.obterObra(obra.id)).toEqual(obra)
  })
})
