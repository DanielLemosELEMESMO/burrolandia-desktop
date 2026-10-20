// O protocolo app://burrolandia/ serve a interface (em produção) e os arquivos dos livros.
// Assim os iframes do leitor (blob:) ficam na mesma origem da interface e as fontes locais
// carregam dentro do livro.

import { readFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import type { Biblioteca } from './biblioteca'

export const ESQUEMA = 'app'
export const ORIGEM = `${ESQUEMA}://burrolandia`

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
}

// Scripts só do próprio app: isso também bloqueia scripts embutidos em EPUBs, porque os
// iframes do livro (blob:) herdam esta política.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "media-src 'self' blob:",
  "frame-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const tipoDe = (caminho: string) => TIPOS[extname(caminho).toLowerCase()] ?? 'application/octet-stream'

const naoEncontrado = () => new Response('Não encontrado', { status: 404 })

export function registrarEsquema() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ESQUEMA,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ])
}

export function tratarProtocolo(biblioteca: Biblioteca, pastaInterface: string) {
  const raizInterface = resolve(pastaInterface)

  protocol.handle(ESQUEMA, async requisicao => {
    const url = new URL(requisicao.url)
    if (url.host !== 'burrolandia') return naoEncontrado()
    const partes = decodeURIComponent(url.pathname).split('/').filter(Boolean)

    if (partes[0] === 'livros') {
      if (partes.length !== 3) return naoEncontrado()
      const caminho = biblioteca.caminhoDoArquivo(partes[1], partes[2])
      if (!caminho) return naoEncontrado()
      const resposta = await net.fetch(pathToFileURL(caminho).toString())
      const cabecalhos: Record<string, string> = { 'content-type': tipoDe(caminho), 'cache-control': 'no-cache' }
      // Em desenvolvimento a interface vem do servidor do Vite, em outra origem.
      if (process.env.ELECTRON_RENDERER_URL) cabecalhos['access-control-allow-origin'] = new URL(process.env.ELECTRON_RENDERER_URL).origin
      return new Response(resposta.body, { headers: cabecalhos })
    }

    const caminho = resolve(raizInterface, partes.length ? partes.join(sep) : 'index.html')
    if (caminho !== raizInterface && !caminho.startsWith(raizInterface + sep)) return naoEncontrado()
    try {
      const conteudo = await readFile(caminho)
      const tipo = tipoDe(caminho)
      const cabecalhos: Record<string, string> = { 'content-type': tipo }
      if (tipo.startsWith('text/html')) cabecalhos['content-security-policy'] = CSP
      return new Response(conteudo, { headers: cabecalhos })
    } catch {
      return naoEncontrado()
    }
  })
}

/** Em desenvolvimento, o servidor do Vite; em produção, os arquivos de out/renderer pelo protocolo. */
export const urlDaInterface = () => process.env.ELECTRON_RENDERER_URL ?? `${ORIGEM}/index.html`

export const caminhoDaInterface = (dirname: string) => join(dirname, '../renderer')
