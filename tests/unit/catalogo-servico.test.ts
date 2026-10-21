import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClienteOpenLibrary, type Buscar, type RespostaHttp } from '@nucleo/catalogo/cliente'
import { Banco, type NovoLivro } from '../../src/main/banco'
import { Biblioteca } from '../../src/main/biblioteca'
import { Catalogo } from '../../src/main/catalogo'
import { gravarLivrosDeTeste } from '../fixtures/livros'

const fixture = (nome: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/openlibrary', nome), 'utf8'))
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])

const resposta = (corpo: unknown, status = 200): RespostaHttp => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
  arrayBuffer: async () => (corpo instanceof Uint8Array ? corpo.slice().buffer : new ArrayBuffer(0)) as ArrayBuffer,
})

/** Um Open Library de mentira, com as respostas reais gravadas em tests/fixtures/openlibrary. */
function openLibraryFalso() {
  const pedidos: URL[] = []
  const buscar: Buscar = async endereco => {
    const url = new URL(endereco)
    pedidos.push(url)
    const q = url.searchParams.get('q') ?? ''
    if (url.pathname === '/search.json') {
      if (url.searchParams.get('isbn') === '9788508145607') return resposta(fixture('busca-isbn-9788508145607.json'))
      if (/casmurro|OL1003040W/i.test(q)) return resposta(fixture('busca-dom-casmurro.json'))
      if (/origem|OL515051W/i.test(q)) return resposta(fixture('busca-origem-das-especies.json'))
      return resposta({ numFound: 0, docs: [] })
    }
    if (url.pathname === '/works/OL1003040W.json') return resposta(fixture('obra-OL1003040W.json'))
    if (url.pathname === '/works/OL1003040W/editions.json') return resposta(fixture('edicoes-OL1003040W.json'))
    if (url.pathname.startsWith('/b/id/')) return resposta(JPEG)
    return resposta({}, 404)
  }
  return { cliente: new ClienteOpenLibrary(buscar, { openLibrary: 'https://ol.teste', capas: 'https://capas.teste' }, 0), pedidos }
}

describe('Catalogo', () => {
  let pasta: string
  let banco: Banco
  let biblioteca: Biblioteca
  let livros: ReturnType<typeof gravarLivrosDeTeste>
  let mudaram: string[]

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'burrolandia-catalogo-'))
    banco = new Banco(join(pasta, 'burrolandia.db'))
    biblioteca = new Biblioteca(pasta, banco)
    livros = gravarLivrosDeTeste(join(pasta, 'origem'))
    mudaram = []
  })

  afterEach(() => {
    banco.fechar()
    rmSync(pasta, { recursive: true, force: true })
  })

  const catalogo = (cliente: ClienteOpenLibrary | null = openLibraryFalso().cliente) =>
    new Catalogo(banco, biblioteca, cliente, id => mudaram.push(id))

  async function importar(caminho: string) {
    const resultado = await biblioteca.importar(caminho)
    if (resultado.tipo !== 'adicionado') throw new Error('não importou')
    return resultado.livro
  }

  /** Um livro inserido direto no banco, com a pasta criada (para receber capa). */
  function inserir(parcial: Partial<NovoLivro>) {
    const livro = banco.inserirLivro({
      id: crypto.randomUUID(),
      titulo: 'Sem título',
      autores: [],
      idioma: 'pt-BR',
      formatoOriginal: 'pdf',
      arquivoOriginal: 'original.pdf',
      arquivoLeitura: null,
      capa: null,
      hashSha256: crypto.randomUUID(),
      tamanhoBytes: 1,
      identificadores: { isbn: [], outros: [] },
      estado: 'pronto',
      adicionadoEm: new Date().toISOString(),
      ...parcial,
    })
    mkdirSync(join(pasta, 'livros', livro.id), { recursive: true })
    return livro
  }

  it('reconhece a obra pelo título e pelo autor, com a descrição; a edição fica para você escolher', async () => {
    const livro = await importar(livros.domCasmurro)
    const sobre = await catalogo().reconhecer(livro.id)
    expect(sobre?.livro).toMatchObject({ obraId: 'OL1003040W', edicaoId: null, reconhecimento: 'titulo' })
    expect(sobre?.obra).toMatchObject({ id: 'OL1003040W', titulo: 'Dom Casmurro', edicoes: 90 })
    expect(sobre?.obra?.descricao).toMatch(/^Dom Casmurro, publicado pela primeira vez em 1899/)
    expect(sobre?.edicao).toBeNull()
    expect(mudaram).toEqual([livro.id])
  })

  it('pelo ISBN, acha a edição exata (mesmo escrito como ISBN-10)', async () => {
    const livro = inserir({ titulo: 'Dom Casmurro', identificadores: { isbn: ['8508145608'], outros: [] } })
    const sobre = await catalogo().reconhecer(livro.id)
    expect(sobre?.livro.reconhecimento).toBe('isbn')
    expect(sobre?.edicao).toMatchObject({ id: 'OL56164313M', editoras: ['Ática'], ano: 2019 })
    expect(sobre?.obra?.id).toBe('OL39781935W')
  })

  it('o livro sem capa ganha a capa do catálogo; o que já tem capa fica com a sua', async () => {
    const semCapa = inserir({ titulo: 'Dom Casmurro', autores: ['Machado de Assis'] })
    const comCapa = await importar(livros.domCasmurro)
    const servico = catalogo()
    await servico.reconhecer(semCapa.id)
    await servico.reconhecer(comCapa.id)
    expect(banco.obterLivro(semCapa.id)?.capa).toBe('capa.jpg')
    expect(readFileSync(join(pasta, 'livros', semCapa.id, 'capa.jpg'))).toEqual(Buffer.from(JPEG))
    expect(banco.obterLivro(comCapa.id)?.capa).toBe(comCapa.capa)
  })

  it('sem conexão, o livro continua pendente para tentar de novo depois', async () => {
    const falhando = new ClienteOpenLibrary(async () => Promise.reject(new TypeError('fetch failed')), undefined, 0)
    const livro = await importar(livros.domCasmurro)
    const sobre = await catalogo(falhando).reconhecer(livro.id)
    expect(sobre?.livro.reconhecimento).toBe('pendente')
    expect(banco.livrosPendentes()).toEqual([livro.id])
  })

  it('procurou e não achou: fica registrado, e não procura de novo sozinho', async () => {
    const { cliente, pedidos } = openLibraryFalso()
    const livro = inserir({ titulo: 'Um Livro Que Ninguém Catalogou', autores: ['Fulano de Tal'] })
    const servico = catalogo(cliente)
    expect((await servico.reconhecer(livro.id))?.livro.reconhecimento).toBe('sem-resultado')
    const feitos = pedidos.length
    await servico.reconhecer(livro.id)
    expect(pedidos.length).toBe(feitos)
  })

  it('escolher a edição: lista primeiro as do idioma do livro e liga a escolhida', async () => {
    const livro = await importar(livros.domCasmurro)
    const servico = catalogo()
    await servico.reconhecer(livro.id)
    const edicoes = await servico.edicoes(livro.id)
    expect(edicoes?.[0].idiomas).toContain('por')
    const sobre = await servico.escolherEdicao(livro.id, 'OL61241820M')
    expect(sobre?.edicao).toMatchObject({ id: 'OL61241820M', editoras: ['Penguin-Companhia'], paginas: 400 })
    expect(sobre?.livro).toMatchObject({ obraId: 'OL1003040W', edicaoId: 'OL61241820M', reconhecimento: 'escolhido' })
  })

  it('procurar e escolher outra obra; ou dizer que não é nenhuma', async () => {
    const livro = await importar(livros.memorias)
    const servico = catalogo()
    const achadas = await servico.buscarObras('A Origem das Espécies Darwin')
    expect(achadas?.map(a => a.obra.id)).toContain('OL515051W')
    const escolhida = await servico.escolherObra(livro.id, 'OL515051W')
    expect(escolhida?.livro).toMatchObject({ obraId: 'OL515051W', edicaoId: null, reconhecimento: 'escolhido' })
    const nenhuma = servico.nenhuma(livro.id)
    expect(nenhuma?.livro).toMatchObject({ obraId: null, edicaoId: null, reconhecimento: 'recusado' })
    expect(nenhuma?.obra).toBeNull()
  })

  it('mostra a capa do catálogo antes de usar, baixando uma vez só', async () => {
    const { cliente, pedidos } = openLibraryFalso()
    const livro = await importar(livros.domCasmurro)
    const servico = catalogo(cliente)
    await servico.reconhecer(livro.id)
    expect(await servico.capaDoCatalogo(livro.id)).toEqual(JPEG)
    await servico.usarCapaDoCatalogo(livro.id)
    expect(pedidos.filter(p => p.pathname.startsWith('/b/id/'))).toHaveLength(1)
  })

  it('usar a capa do catálogo troca a capa do livro', async () => {
    const livro = await importar(livros.domCasmurro)
    const servico = catalogo()
    await servico.reconhecer(livro.id)
    const sobre = await servico.usarCapaDoCatalogo(livro.id)
    expect(sobre?.livro.capa).toBe('capa.jpg')
    expect(existsSync(join(pasta, 'livros', livro.id, 'capa.jpg'))).toBe(true)
  })

  it('reconhece os pendentes ao abrir o app, e para no primeiro sinal de sem conexão', async () => {
    let pedidos = 0
    const falhando = new ClienteOpenLibrary(
      async () => {
        pedidos++
        throw new TypeError('fetch failed')
      },
      undefined,
      0,
    )
    await importar(livros.domCasmurro)
    await importar(livros.memorias)
    await catalogo(falhando).reconhecerPendentes()
    expect(pedidos).toBe(1)

    const { cliente } = openLibraryFalso()
    await catalogo(cliente).reconhecerPendentes()
    expect(banco.livrosPendentes()).toEqual([])
  })

  it('a fila dos pendentes e um pedido da interface para o mesmo livro viram uma busca só', async () => {
    const { cliente, pedidos } = openLibraryFalso()
    const livro = await importar(livros.domCasmurro)
    const servico = catalogo(cliente)
    await Promise.all([servico.reconhecerPendentes(), servico.reconhecer(livro.id)])
    expect(pedidos.filter(p => p.pathname === '/search.json')).toHaveLength(1)
  })

  it('dois pedidos para o mesmo livro ao mesmo tempo viram um só', async () => {
    const { cliente, pedidos } = openLibraryFalso()
    const livro = await importar(livros.domCasmurro)
    const servico = catalogo(cliente)
    await Promise.all([servico.reconhecer(livro.id), servico.reconhecer(livro.id)])
    expect(pedidos.filter(p => p.pathname === '/search.json')).toHaveLength(1)
  })

  it('sem o catálogo (sem internet), tudo responde sem quebrar', async () => {
    const livro = await importar(livros.domCasmurro)
    const servico = catalogo(null)
    expect((await servico.reconhecer(livro.id))?.livro.reconhecimento).toBe('pendente')
    expect(await servico.buscarObras('Dom Casmurro')).toBeNull()
    // Sem obra ligada, não há edições para listar.
    expect(await servico.edicoes(livro.id)).toEqual([])
  })
})
