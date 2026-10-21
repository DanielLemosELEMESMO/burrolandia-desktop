// Lê os metadados de um EPUB (título, autores, idioma, identificadores e capa) sem abrir o livro
// inteiro: só descompacta o que precisa.

import { strFromU8, unzipSync } from 'fflate'
import { DOMParser, type Document, type Element } from '@xmldom/xmldom'
import { isbnValido } from '../catalogo/isbn'
import { extensaoDaImagem } from './comum'

export type CodigoErroEpub = 'arquivo-invalido' | 'drm'

export class ErroEpub extends Error {
  constructor(
    readonly codigo: CodigoErroEpub,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroEpub'
  }
}

export interface MetadadosEpub {
  titulo: string | null
  autores: string[]
  idioma: string | null
  identificadores: { isbn: string[]; outros: string[] }
  editora: string | null
  data: string | null
  capa: { bytes: Uint8Array; tipo: string; extensao: string } | null
}

// Ofuscação de fontes não é DRM: o texto continua legível.
const OFUSCACAO_DE_FONTES = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'])

function extrair(bytes: Uint8Array, nomes: (nome: string) => boolean): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes, { filter: arquivo => nomes(arquivo.name) })
  } catch {
    throw new ErroEpub('arquivo-invalido', 'O arquivo não é um EPUB válido.')
  }
}

function xml(bytes: Uint8Array): Document {
  const corrompido = () => new ErroEpub('arquivo-invalido', 'O EPUB tem um arquivo interno corrompido.')
  let falhou = false
  let doc: Document
  try {
    doc = new DOMParser({
      onError: nivel => {
        if (nivel === 'fatalError') falhou = true
      },
    }).parseFromString(strFromU8(bytes), 'application/xml')
  } catch {
    // O xmldom lança ParseError em alguns erros (por exemplo, prefixo de namespace não declarado).
    throw corrompido()
  }
  if (falhou || !doc.documentElement) throw corrompido()
  return doc
}

/** Elementos pelo nome local, ignorando namespaces (há muitos EPUBs desleixados com eles). */
const porNome = (raiz: Document | Element, nome: string): Element[] =>
  Array.from(raiz.getElementsByTagName('*')).filter(el => (el.localName ?? el.nodeName) === nome)

const texto = (el: Element | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() || null

/** Lê um atributo com ou sem prefixo de namespace (opf:role, role). */
const atributo = (el: Element, nome: string) => {
  for (const attr of Array.from(el.attributes)) {
    if ((attr.localName ?? attr.name) === nome) return attr.value
  }
  return null
}

function resolverCaminho(base: string, href: string) {
  const partes = base ? base.split('/') : []
  let decodificado: string
  try {
    decodificado = decodeURIComponent(href.split('#')[0])
  } catch {
    throw new ErroEpub('arquivo-invalido', 'O EPUB tem um endereço interno malformado.')
  }
  for (const parte of decodificado.split('/')) {
    if (parte === '..') partes.pop()
    else if (parte && parte !== '.') partes.push(parte)
  }
  return partes.join('/')
}

function separarIdentificadores(elementos: Element[]) {
  const isbn: string[] = []
  const outros: string[] = []
  for (const el of elementos) {
    const valor = texto(el)
    if (!valor) continue
    const digitos = valor.replace(/^(urn:)?isbn:/i, '').replace(/[\s-]/g, '').toUpperCase()
    if (isbnValido(digitos)) isbn.push(digitos)
    else outros.push(valor)
  }
  return { isbn, outros }
}

function papeisPorRefines(metadata: Element) {
  const papeis = new Map<string, string>()
  for (const meta of porNome(metadata, 'meta')) {
    const refines = atributo(meta, 'refines')
    if (refines && atributo(meta, 'property') === 'role') papeis.set(refines.replace(/^#/, ''), texto(meta) ?? '')
  }
  return papeis
}

function autores(metadata: Element) {
  const papeis = papeisPorRefines(metadata)
  const criadores = porNome(metadata, 'creator').map(el => ({
    nome: texto(el),
    papel: atributo(el, 'role') ?? papeis.get(atributo(el, 'id') ?? '') ?? null,
  }))
  const nomes = (lista: typeof criadores) => lista.map(c => c.nome).filter((n): n is string => !!n)
  const deAutoria = nomes(criadores.filter(c => !c.papel || c.papel === 'aut'))
  return deAutoria.length ? deAutoria : nomes(criadores.filter(c => c.papel !== 'trl'))
}

function titulo(metadata: Element) {
  const titulos = porNome(metadata, 'title')
  const tipos = new Map<string, string>()
  for (const meta of porNome(metadata, 'meta')) {
    const refines = atributo(meta, 'refines')
    if (refines && atributo(meta, 'property') === 'title-type') tipos.set(refines.replace(/^#/, ''), texto(meta) ?? '')
  }
  const principal = titulos.find(t => tipos.get(atributo(t, 'id') ?? '') === 'main')
  return texto(principal ?? titulos[0])
}

function itemDaCapa(opf: Document) {
  const itens = porNome(opf, 'item').filter(el => (atributo(el, 'media-type') ?? '').startsWith('image/'))
  const porPropriedade = itens.find(el => (atributo(el, 'properties') ?? '').split(/\s+/).includes('cover-image'))
  if (porPropriedade) return porPropriedade

  const metaCapa = porNome(opf, 'meta').find(el => atributo(el, 'name') === 'cover')
  const ref = metaCapa && atributo(metaCapa, 'content')
  if (ref) {
    const achado = itens.find(el => atributo(el, 'id') === ref || atributo(el, 'href') === ref)
    if (achado) return achado
  }
  return itens.find(el => /cover|capa/i.test(`${atributo(el, 'id')} ${atributo(el, 'href')}`))
}

function verificarDrm(arquivos: Record<string, Uint8Array>) {
  if (arquivos['META-INF/rights.xml']) {
    throw new ErroEpub('drm', 'Este EPUB está protegido por DRM da loja onde foi comprado.')
  }
  const encryption = arquivos['META-INF/encryption.xml']
  if (!encryption) return
  const algoritmos = porNome(xml(encryption), 'EncryptionMethod').map(el => atributo(el, 'Algorithm') ?? '')
  if (algoritmos.some(a => !OFUSCACAO_DE_FONTES.has(a))) {
    throw new ErroEpub('drm', 'Este EPUB está protegido por DRM da loja onde foi comprado.')
  }
}

export function lerEpub(bytes: Uint8Array): MetadadosEpub {
  const meta = extrair(bytes, nome => nome.startsWith('META-INF/'))
  const container = meta['META-INF/container.xml']
  if (!container) throw new ErroEpub('arquivo-invalido', 'O arquivo não é um EPUB válido.')
  verificarDrm(meta)

  const rootfile = porNome(xml(container), 'rootfile')[0]
  const caminhoOpf = rootfile && atributo(rootfile, 'full-path')
  if (!caminhoOpf) throw new ErroEpub('arquivo-invalido', 'O EPUB não indica onde estão os metadados.')
  const bytesOpf = extrair(bytes, nome => nome === caminhoOpf)[caminhoOpf]
  if (!bytesOpf) throw new ErroEpub('arquivo-invalido', 'O EPUB não tem o arquivo de metadados.')

  const opf = xml(bytesOpf)
  const metadata = porNome(opf, 'metadata')[0]
  if (!metadata) throw new ErroEpub('arquivo-invalido', 'O EPUB não tem metadados.')

  const pastaOpf = caminhoOpf.includes('/') ? caminhoOpf.slice(0, caminhoOpf.lastIndexOf('/')) : ''
  let capa: MetadadosEpub['capa'] = null
  const item = itemDaCapa(opf)
  const href = item && atributo(item, 'href')
  if (item && href) {
    const caminho = resolverCaminho(pastaOpf, href)
    const conteudo = extrair(bytes, nome => nome === caminho)[caminho]
    const tipo = atributo(item, 'media-type') ?? 'image/jpeg'
    if (conteudo?.length) capa = { bytes: conteudo, tipo, extensao: extensaoDaImagem(tipo) }
  }

  return {
    titulo: titulo(metadata),
    autores: autores(metadata),
    idioma: texto(porNome(metadata, 'language')[0]),
    identificadores: separarIdentificadores(porNome(metadata, 'identifier')),
    editora: texto(porNome(metadata, 'publisher')[0]),
    data: texto(porNome(metadata, 'date')[0]),
    capa,
  }
}
