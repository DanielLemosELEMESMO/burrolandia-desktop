import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Banco, type NovoLivro } from '../../src/main/banco'
import type { LivroNaNuvem } from '@nucleo/nuvem/regras'
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

  it('lista os livros que ainda não foram procurados no catálogo, dos mais novos aos mais velhos', () => {
    const velho = banco.inserirLivro(novoLivro({ adicionadoEm: '2026-10-01T00:00:00.000Z' }))
    const novo = banco.inserirLivro(novoLivro({ adicionadoEm: '2026-10-19T00:00:00.000Z' }))
    const achado = banco.inserirLivro(novoLivro())
    banco.salvarObra(obra)
    banco.ligarAoCatalogo(achado.id, { obraId: obra.id, edicaoId: null, reconhecimento: 'titulo' })
    expect(banco.livrosPendentes()).toEqual([novo.id, velho.id])
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

describe('Banco: nuvem (parte 2)', () => {
  let pasta: string
  let banco: Banco

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'burrolandia-banco-nuvem-'))
    banco = new Banco(join(pasta, 'burrolandia.db'))
  })

  afterEach(() => {
    banco.fechar()
    rmSync(pasta, { recursive: true, force: true })
  })

  const daNuvem = (hash: string): LivroNaNuvem => ({
    hash,
    titulo: 'Iracema',
    autores: ['José de Alencar'],
    idioma: 'pt-BR',
    formato: 'epub',
    tamanhoBytes: 5000,
    identificadores: { isbn: [], outros: [] },
    obraId: 'OL1W',
    edicaoId: null,
    reconhecimento: 'titulo',
    obra: null,
    edicao: null,
    metadadosEm: '2026-10-10T10:00:00.000Z',
    capa: null,
    capaEm: null,
    arquivo: `${hash}.epub`,
    posicao,
    progresso: 0.4,
    posicaoEm: '2026-10-10T11:00:00.000Z',
    adicionadoEm: '2026-10-09T10:00:00.000Z',
    abertoEm: '2026-10-10T11:00:00.000Z',
    removidoEm: null,
    atualizadoEm: '2026-10-10T11:00:00.000001+00:00',
  })

  it('cada mudança daqui fica pendente até subir; a que vem depois de ler continua pendente', () => {
    let avisos = 0
    banco.quandoMudar(() => avisos++)
    const livro = banco.inserirLivro(novoLivro())
    expect(banco.pendentesDeEnvio(10).map(l => l.id)).toEqual([livro.id])
    const lido = banco.paraSincronia(livro.id)!
    expect(lido).toMatchObject({ versao: 1, versaoEnviada: 0, capaEm: expect.any(String), posicaoEm: null })
    banco.salvarPosicao(livro.id, posicao)
    banco.marcarEnviado(livro.id, lido.versao)
    expect(banco.pendentesDeEnvio(10)).toHaveLength(1)
    banco.marcarEnviado(livro.id, banco.paraSincronia(livro.id)!.versao)
    expect(banco.pendentesDeEnvio(10)).toEqual([])
    expect(banco.contarPendentes()).toBe(0)
    banco.marcarAberto(livro.id)
    banco.atualizarLivro(livro.id, { titulo: 'Dom Casmurro (outra edição)' })
    banco.ligarAoCatalogo(livro.id, { obraId: 'OL1003040W', edicaoId: null, reconhecimento: 'titulo' })
    expect(banco.contarPendentes()).toBe(1)
    expect(banco.paraSincronia(livro.id)!.posicaoEm).toEqual(expect.any(String))
    expect(avisos).toBe(5)
  })

  it('remover um livro que já estava na nuvem deixa a lápide; um que nunca subiu, não', () => {
    const subiu = banco.inserirLivro(novoLivro({ hashSha256: 'a'.repeat(64) }))
    banco.marcarEnviado(subiu.id, 1)
    const nunca = banco.inserirLivro(novoLivro({ hashSha256: 'b'.repeat(64) }))
    banco.removerLivro(subiu.id)
    banco.removerLivro(nunca.id)
    expect(banco.lapides().map(l => l.hash)).toEqual(['a'.repeat(64)])
    expect(banco.temLapide('a'.repeat(64))).toBe(true)
    banco.esquecerLapides(['a'.repeat(64)])
    expect(banco.lapides()).toEqual([])
  })

  it('remover porque veio da nuvem não deixa lápide', () => {
    const livro = banco.inserirLivro(novoLivro())
    banco.marcarEnviado(livro.id, 1)
    banco.removerLivro(livro.id, { daNuvem: true })
    expect(banco.lapides()).toEqual([])
  })

  it('um livro de outro aparelho entra "na nuvem", sem nada pendente', () => {
    const hash = 'c'.repeat(64)
    const livro = banco.inserirDaNuvem(crypto.randomUUID(), daNuvem(hash))
    expect(livro).toMatchObject({ estado: 'na-nuvem', titulo: 'Iracema', progresso: 0.4, posicao, capa: null, arquivoLeitura: null })
    expect(banco.porHashParaSincronia(hash)).toMatchObject({ versaoEnviada: 1, arquivoNaNuvem: `${hash}.epub` })
    expect(banco.contarPendentes()).toBe(0)
    banco.completarDaNuvem(livro.id, { arquivoOriginal: 'original.epub', arquivoLeitura: 'original.epub' })
    expect(banco.obterLivro(livro.id)).toMatchObject({ estado: 'pronto', arquivoLeitura: 'original.epub' })
    expect(banco.contarPendentes()).toBe(0)
  })

  it('o que vem da nuvem muda só o que foi decidido, sem voltar para a fila', () => {
    const livro = banco.inserirLivro(novoLivro({ hashSha256: 'd'.repeat(64) }))
    banco.marcarEnviado(livro.id, 1)
    const remoto = daNuvem('d'.repeat(64))
    const decisao = { tipo: 'atualizar' as const, metadados: false, posicao: true, aberto: true, capa: null, arquivo: true }
    expect(banco.aplicarDaNuvem(livro.id, remoto, decisao)).toBe(true)
    expect(banco.obterLivro(livro.id)).toMatchObject({ titulo: 'Dom Casmurro', posicao, progresso: 0.4, abertoEm: remoto.abertoEm })
    expect(banco.paraSincronia(livro.id)).toMatchObject({ arquivoNaNuvem: `${'d'.repeat(64)}.epub`, versao: 1, versaoEnviada: 1 })
  })

  it('sair da conta tira os livros que só estavam na nuvem e deixa os daqui como nunca enviados', () => {
    const daqui = banco.inserirLivro(novoLivro())
    banco.marcarEnviado(daqui.id, 1)
    banco.marcarCapaNaNuvem(daqui.id, 'capa-aaaaaaaaaaaa.jpg')
    const nuvem = banco.inserirDaNuvem(crypto.randomUUID(), daNuvem('e'.repeat(64)))
    banco.removerLivro(banco.inserirLivro(novoLivro({ hashSha256: 'f'.repeat(64) })).id)
    expect(banco.esquecerNuvem()).toEqual([nuvem.id])
    expect(banco.listarLivros().map(l => l.id)).toEqual([daqui.id])
    expect(banco.paraSincronia(daqui.id)).toMatchObject({ versaoEnviada: 0, capaNaNuvem: null, arquivoNaNuvem: null })
    expect(banco.lapides()).toEqual([])
  })

  it('um banco da etapa 3 ganha as horas de cada mudança, e tudo fica para subir', () => {
    banco.fechar()
    const caminho = join(pasta, 'etapa3.db')
    const antigo = new DatabaseSync(caminho)
    antigo.exec(`CREATE TABLE livros (
      id TEXT PRIMARY KEY, titulo TEXT NOT NULL, autores TEXT NOT NULL, idioma TEXT, formato_original TEXT NOT NULL,
      arquivo_original TEXT NOT NULL, arquivo_leitura TEXT, capa TEXT, hash_sha256 TEXT NOT NULL UNIQUE,
      tamanho_bytes INTEGER NOT NULL, identificadores TEXT NOT NULL, estado TEXT NOT NULL, posicao TEXT,
      progresso REAL NOT NULL DEFAULT 0, adicionado_em TEXT NOT NULL, aberto_em TEXT, atualizado_em TEXT NOT NULL,
      obra_id TEXT, edicao_id TEXT, reconhecimento TEXT NOT NULL DEFAULT 'pendente');
    CREATE TABLE preferencias (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, atualizado_em TEXT NOT NULL);
    CREATE TABLE obras (id TEXT PRIMARY KEY, titulo TEXT NOT NULL, autores TEXT NOT NULL, primeiro_ano INTEGER,
      edicoes INTEGER NOT NULL DEFAULT 0, capa_id INTEGER, assuntos TEXT NOT NULL, descricao TEXT, atualizado_em TEXT NOT NULL);
    CREATE TABLE edicoes (id TEXT PRIMARY KEY, obra_id TEXT NOT NULL, titulo TEXT NOT NULL, editoras TEXT NOT NULL,
      publicada_em TEXT, ano INTEGER, paginas INTEGER, idiomas TEXT NOT NULL, isbn TEXT NOT NULL, capa_id INTEGER,
      atualizado_em TEXT NOT NULL);
    INSERT INTO livros VALUES ('00000000-0000-4000-8000-000000000001', 'Iracema', '["José de Alencar"]', 'pt-BR',
      'epub', 'original.epub', 'original.epub', 'capa.jpg', 'abc', 10, '{"isbn":[],"outros":[]}', 'pronto',
      '{"href":"a.xhtml","type":"application/xhtml+xml","locations":{}}', 0.1, '2026-10-01T00:00:00.000Z', NULL,
      '2026-10-05T00:00:00.000Z', NULL, NULL, 'pendente');
    PRAGMA user_version = 2;`)
    antigo.close()

    banco = new Banco(caminho)
    expect(banco.paraSincronia('00000000-0000-4000-8000-000000000001')).toMatchObject({
      metadadosEm: '2026-10-05T00:00:00.000Z',
      capaEm: '2026-10-05T00:00:00.000Z',
      posicaoEm: '2026-10-05T00:00:00.000Z',
      versao: 1,
      versaoEnviada: 0,
    })
    expect(banco.contarPendentes()).toBe(1)
  })
})
