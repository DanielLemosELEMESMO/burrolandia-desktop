import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ClienteOpenLibrary, SemConexao, type Buscar, type RespostaHttp } from '@nucleo/catalogo/cliente'

const fixture = (nome: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/openlibrary', nome), 'utf8'))

const resposta = (corpo: unknown, status = 200): RespostaHttp => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
  arrayBuffer: async () => (corpo instanceof Uint8Array ? corpo.buffer : new ArrayBuffer(0)) as ArrayBuffer,
})

/** Um Open Library de mentira: responde pelo caminho e anota o que foi pedido. */
function catalogoFalso(responder: (url: URL) => RespostaHttp | Promise<RespostaHttp>) {
  const pedidos: { url: URL; headers: Record<string, string> }[] = []
  const buscar: Buscar = async (endereco, init) => {
    const url = new URL(endereco)
    pedidos.push({ url, headers: init.headers })
    return responder(url)
  }
  return { buscar, pedidos }
}

const enderecos = { openLibrary: 'https://ol.teste', capas: 'https://capas.teste' }

describe('ClienteOpenLibrary', () => {
  it('pelo ISBN, devolve a obra com a edição exata, e se identifica no pedido', async () => {
    const { buscar, pedidos } = catalogoFalso(() => resposta(fixture('busca-isbn-9788508145607.json')))
    const achada = await new ClienteOpenLibrary(buscar, enderecos, 0).porIsbn('9788508145607')
    expect(achada?.edicao?.id).toBe('OL56164313M')
    expect(pedidos[0].url.pathname).toBe('/search.json')
    expect(pedidos[0].url.searchParams.get('isbn')).toBe('9788508145607')
    expect(pedidos[0].headers['User-Agent']).toMatch(/^Burrolandia\//)
  })

  it('ISBN que o catálogo não conhece não é erro: só não achou', async () => {
    const { buscar } = catalogoFalso(() => resposta({ numFound: 0, docs: [] }))
    expect(await new ClienteOpenLibrary(buscar, enderecos, 0).porIsbn('9786580309318')).toBeNull()
  })

  it('faz uma requisição por vez', async () => {
    let emAndamento = 0
    let maximo = 0
    const { buscar } = catalogoFalso(async () => {
      maximo = Math.max(maximo, ++emAndamento)
      await new Promise(r => setTimeout(r, 5))
      emAndamento--
      return resposta(fixture('busca-dom-casmurro.json'))
    })
    const cliente = new ClienteOpenLibrary(buscar, enderecos, 0)
    await Promise.all([cliente.porTexto('Dom Casmurro'), cliente.porTexto('Iracema'), cliente.porTexto('Helena')])
    expect(maximo).toBe(1)
  })

  it('sem rede, resposta 5xx ou excesso de pedidos viram "sem conexão"; 404 é "não existe"', async () => {
    const semRede = new ClienteOpenLibrary(async () => Promise.reject(new TypeError('fetch failed')), enderecos, 0)
    await expect(semRede.porTexto('Dom Casmurro')).rejects.toBeInstanceOf(SemConexao)
    const fora = new ClienteOpenLibrary(catalogoFalso(() => resposta({}, 503)).buscar, enderecos, 0)
    await expect(fora.porTexto('Dom Casmurro')).rejects.toBeInstanceOf(SemConexao)
    const apressado = new ClienteOpenLibrary(catalogoFalso(() => resposta({}, 429)).buscar, enderecos, 0)
    await expect(apressado.porTexto('Dom Casmurro')).rejects.toBeInstanceOf(SemConexao)
    const inexistente = new ClienteOpenLibrary(catalogoFalso(() => resposta({}, 404)).buscar, enderecos, 0)
    expect(await inexistente.edicao('OL1M')).toBeNull()
  })

  it('um erro não trava a fila: o pedido seguinte segue normalmente', async () => {
    let primeiro = true
    const { buscar } = catalogoFalso(() => {
      if (primeiro) {
        primeiro = false
        throw new TypeError('fetch failed')
      }
      return resposta(fixture('busca-dom-casmurro.json'))
    })
    const cliente = new ClienteOpenLibrary(buscar, enderecos, 0)
    await expect(cliente.porTexto('x')).rejects.toBeInstanceOf(SemConexao)
    expect((await cliente.porTexto('Dom Casmurro'))[0].obra.id).toBe('OL1003040W')
  })

  it('percorre as páginas de edições da obra até acabarem', async () => {
    const pagina = fixture('edicoes-OL1003040W.json') as { entries: Record<string, unknown>[] }
    const cheia = { entries: Array.from({ length: 100 }, (_, i) => ({ ...pagina.entries[0], key: `/books/OL${i + 1}M` })) }
    const { buscar, pedidos } = catalogoFalso(url => resposta(url.searchParams.get('offset') === '0' ? cheia : pagina))
    const edicoes = await new ClienteOpenLibrary(buscar, enderecos, 0).edicoes('OL1003040W')
    expect(edicoes).toHaveLength(112)
    expect(pedidos.map(p => p.url.searchParams.get('offset'))).toEqual(['0', '100'])
  })

  it('baixa a capa pelo id, e capa que não existe volta null', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const { buscar, pedidos } = catalogoFalso(url => (url.pathname.includes('15167286') ? resposta(jpeg) : resposta({}, 404)))
    const cliente = new ClienteOpenLibrary(buscar, enderecos, 0)
    expect(await cliente.capa(15167286)).toEqual(jpeg)
    expect(pedidos[0].url.href).toBe('https://capas.teste/b/id/15167286-L.jpg?default=false')
    expect(await cliente.capa(1)).toBeNull()
  })

  it('busca uma obra pelo id, com os nomes dos autores', async () => {
    const { buscar, pedidos } = catalogoFalso(() => resposta(fixture('busca-dom-casmurro.json')))
    const obra = await new ClienteOpenLibrary(buscar, enderecos, 0).obra('OL1003040W')
    expect(obra?.obra).toMatchObject({ id: 'OL1003040W', autores: ['Machado de Assis'] })
    expect(pedidos[0].url.searchParams.get('q')).toBe('key:/works/OL1003040W')
  })
})
