// Um Open Library de mentira, num servidor HTTP local, com as respostas reais gravadas em
// tests/fixtures/openlibrary. O app aponta para ele por BURROLANDIA_CATALOGO.

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

const pasta = join(__dirname, '../fixtures/openlibrary')
const arquivo = (nome: string) => readFileSync(join(pasta, nome))

function responder(url: URL): { status: number; tipo: string; corpo: Buffer | string } {
  const json = (nome: string) => ({ status: 200, tipo: 'application/json', corpo: arquivo(nome) })
  const q = url.searchParams.get('q') ?? ''
  if (url.pathname === '/search.json') {
    if (url.searchParams.get('isbn') === '9788508145607') return json('busca-isbn-9788508145607.json')
    if (/casmurro|OL1003040W/i.test(q)) return json('busca-dom-casmurro.json')
    if (/origem|OL515051W/i.test(q)) return json('busca-origem-das-especies.json')
    return { status: 200, tipo: 'application/json', corpo: '{"numFound":0,"docs":[]}' }
  }
  if (url.pathname === '/works/OL1003040W.json') return json('obra-OL1003040W.json')
  if (url.pathname === '/works/OL1003040W/editions.json') return json('edicoes-OL1003040W.json')
  if (url.pathname.startsWith('/b/id/')) return { status: 200, tipo: 'image/jpeg', corpo: arquivo('capa.jpg') }
  return { status: 404, tipo: 'application/json', corpo: '{}' }
}

export async function abrirCatalogoFalso() {
  const pedidos: string[] = []
  /** Para os testes mexerem: o catálogo fora do ar (503) e a demora das buscas, em ms. */
  const estado = { foraDoAr: false, demoraDaBusca: 0 }
  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    pedidos.push(url.pathname + url.search)
    if (url.pathname === '/search.json' && estado.demoraDaBusca) {
      await new Promise(pronto => setTimeout(pronto, estado.demoraDaBusca))
    }
    const { status, tipo, corpo } = estado.foraDoAr
      ? { status: 503, tipo: 'text/plain', corpo: 'fora do ar' }
      : responder(url)
    res.writeHead(status, { 'Content-Type': tipo })
    res.end(corpo)
  })
  await new Promise<void>(pronto => servidor.listen(0, '127.0.0.1', pronto))
  const { port } = servidor.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    pedidos,
    estado,
    fechar: () => new Promise<void>(fechado => servidor.close(() => fechado())),
  }
}
