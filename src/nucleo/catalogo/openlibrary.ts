// O Open Library por dentro: os campos pedidos à busca e a tradução das respostas para Obra e
// Edição. As respostas vêm de fora: cada campo é conferido antes de usar, e o que não serve é pulado.

import type { Edicao, Obra, ObraEncontrada } from '../tipos'
import { paraIsbn13 } from './isbn'

/** Campos pedidos à busca: a obra e a edição que bateu com a consulta. */
export const CAMPOS_DA_BUSCA = [
  'key',
  'title',
  'author_name',
  'first_publish_year',
  'edition_count',
  'cover_i',
  'subject',
  'editions',
  'editions.key',
  'editions.title',
  'editions.subtitle',
  'editions.publisher',
  'editions.publish_date',
  'editions.language',
  'editions.isbn',
  'editions.cover_i',
  'editions.number_of_pages_median',
].join(',')

const MAXIMO_DE_ASSUNTOS = 12
const LIMITE_DA_DESCRICAO = 1500

type Registro = Record<string, unknown>

const registro = (valor: unknown): Registro | null =>
  valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Registro) : null
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : [])
// Alguns registros trazem caracteres de controle dos catálogos de biblioteca ("\x98O \x9csenhor dos anéis").
const texto = (valor: unknown): string | null => {
  const limpo = typeof valor === 'string' ? valor.replace(/\p{Cc}/gu, '').trim() : ''
  return limpo || null
}
const textos = (valor: unknown): string[] => lista(valor).flatMap(v => texto(v) ?? [])
const inteiro = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : null
// O Open Library usa -1 para "sem capa".
const capa = (valor: unknown): number | null => (inteiro(valor) ? (valor as number) : null)

const simples = (valor: string) => valor.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * O Open Library guarda o subtítulo da edição à parte; aqui ele volta para o título ("Sapiens: uma
 * breve história da humanidade"). Se o título já tem subtítulo, o campo à parte costuma ser só a
 * série ("O Senhor dos Anéis - Parte 1") e fica de fora.
 */
function comSubtitulo(titulo: unknown, subtitulo: unknown): string | null {
  const [principal, resto] = [texto(titulo), texto(subtitulo)]
  if (!principal || !resto) return principal
  const jaTemSubtitulo = /[:;]|\s[-–—]\s/.test(principal)
  return jaTemSubtitulo || simples(principal).includes(simples(resto)) ? principal : `${principal}: ${resto}`
}

const idDaObra = (chave: unknown) => texto(chave)?.match(/^\/works\/(OL\d+W)$/)?.[1] ?? null
const idDaEdicao = (chave: unknown) => texto(chave)?.match(/^\/books\/(OL\d+M)$/)?.[1] ?? null

/** O ano numa data escrita de qualquer jeito: "2013", "16/07/2016", "3 dezembro 2019". */
export const anoDe = (data: string | null) => Number(data?.match(/\b(1[4-9]\d\d|20\d\d)\b/)?.[1]) || null

const isbns = (...listas: unknown[]) => [...new Set(listas.flatMap(textos).flatMap(i => paraIsbn13(i) ?? []))]

function edicaoDaBusca(valor: unknown, obraId: string): Edicao | null {
  const e = registro(valor)
  const id = idDaEdicao(e?.key)
  const titulo = comSubtitulo(e?.title, e?.subtitle)
  if (!e || !id || !titulo) return null
  const publicadaEm = textos(e.publish_date)[0] ?? null
  return {
    id,
    obraId,
    titulo,
    editoras: textos(e.publisher),
    publicadaEm,
    ano: anoDe(publicadaEm),
    paginas: inteiro(e.number_of_pages_median),
    idiomas: textos(e.language),
    isbn: isbns(e.isbn),
    capaId: capa(e.cover_i),
  }
}

function obraDaBusca(valor: unknown): ObraEncontrada | null {
  const doc = registro(valor)
  const id = idDaObra(doc?.key)
  const titulo = texto(doc?.title)
  if (!doc || !id || !titulo) return null
  const obra: Obra = {
    id,
    titulo,
    autores: textos(doc.author_name),
    primeiroAno: inteiro(doc.first_publish_year),
    edicoes: inteiro(doc.edition_count) ?? 0,
    capaId: capa(doc.cover_i),
    assuntos: textos(doc.subject).slice(0, MAXIMO_DE_ASSUNTOS),
    descricao: null,
  }
  return { obra, edicao: edicaoDaBusca(lista(registro(doc.editions)?.docs)[0], id) }
}

/** As obras de uma resposta de /search.json, cada uma com a edição que a fez aparecer. */
export function lerBusca(resposta: unknown): ObraEncontrada[] {
  return lista(registro(resposta)?.docs).flatMap(doc => obraDaBusca(doc) ?? [])
}

/** Uma edição de /books/OL…M.json (ou da lista de edições de uma obra). */
export function lerEdicao(valor: unknown, obraIdPadrao?: string): Edicao | null {
  const e = registro(valor)
  const id = idDaEdicao(e?.key)
  const titulo = comSubtitulo(e?.title, e?.subtitle)
  const obraId = idDaObra(registro(lista(e?.works)[0])?.key) ?? obraIdPadrao ?? null
  if (!e || !id || !titulo || !obraId) return null
  const publicadaEm = texto(e.publish_date)
  return {
    id,
    obraId,
    titulo,
    editoras: textos(e.publishers),
    publicadaEm,
    ano: anoDe(publicadaEm),
    paginas: inteiro(e.number_of_pages),
    idiomas: lista(e.languages).flatMap(l => texto(registro(l)?.key)?.replace(/^\/languages\//, '') ?? []),
    isbn: isbns(e.isbn_13, e.isbn_10),
    capaId: lista(e.covers).map(capa).find(c => c !== null) ?? null,
  }
}

/** As edições de /works/OL…W/editions.json. */
export function lerEdicoes(resposta: unknown, obraId: string): Edicao[] {
  return lista(registro(resposta)?.entries).flatMap(e => lerEdicao(e, obraId) ?? [])
}

/** Quantas entradas vieram nesta página da lista de edições (para saber se há mais). */
export const tamanhoDaPagina = (resposta: unknown) => lista(registro(resposta)?.entries).length

/** A descrição (em texto simples) e os assuntos de /works/OL…W.json. Sem descrição, texto vazio. */
export function lerObra(resposta: unknown): { descricao: string; assuntos: string[] } {
  const obra = registro(resposta)
  const descricao = texto(obra?.description) ?? texto(registro(obra?.description)?.value) ?? ''
  return { descricao: textoSimples(descricao), assuntos: textos(obra?.subjects).slice(0, MAXIMO_DE_ASSUNTOS) }
}

/** Tira a marcação das descrições do Open Library (negrito, links, o rodapé "Also contained in"). */
export function textoSimples(descricao: string): string {
  const semRodape = descricao.split(/\r?\n\s*-{3,}\s*\r?\n/)[0]
  const limpo = semRodape
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[\d+\]/g, '$1')
    .replace(/^\s*\[\d+\]:\s*\S.*$/gm, '')
    .replace(/(\*\*|__|\*)(?=\S)([^*]+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
  if (limpo.length <= LIMITE_DA_DESCRICAO) return limpo
  const corte = limpo.lastIndexOf(' ', LIMITE_DA_DESCRICAO)
  return `${limpo.slice(0, corte > 0 ? corte : LIMITE_DA_DESCRICAO)}…`
}
