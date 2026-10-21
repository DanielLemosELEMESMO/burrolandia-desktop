// Qual obra do catálogo é este livro? Compara o título e o autor; aceita uma tradução pela edição que
// bateu na busca ("A Origem das Espécies" é On the Origin of Species) e, entre obras repetidas do
// catálogo, fica com a que tem mais edições.

import type { Edicao, ObraEncontrada } from '../tipos'

export interface Alvo {
  titulo: string
  autores: string[]
}

const LIMITE_DO_TITULO = 0.85
const LIMITE_DO_AUTOR = 0.6

const semAcento = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// O título principal: sem subtítulo ("Dom Casmurro: romance") nem complemento entre parênteses.
const tituloPrincipal = (titulo: string) => titulo.split(/\s*[:;([]|\s+[-–—]\s+/)[0].trim()

// Artigo no começo ("A Origem…") ou invertido no fim, como nos catálogos ("Origem das Espécies, A").
const ARTIGO_NO_COMECO = /^(?:o|a|os|as|um|uma|the|an?|el|la|los|las|le|les|il|lo)\s+/
const ARTIGO_NO_FIM = /,\s*(?:o|a|os|as|the|an?|el|la|le|les)$/

function palavrasDoTitulo(titulo: string): string[] {
  const principal = semAcento(tituloPrincipal(titulo)).replace(ARTIGO_NO_FIM, '')
  return principal
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(ARTIGO_NO_COMECO, '')
    .split(/\s+/)
    .filter(Boolean)
}

/** Semelhança de Dice entre dois conjuntos de palavras: 1 quando são iguais, 0 quando nada bate. */
function semelhanca(a: string[], b: string[]): number {
  const [conjuntoA, conjuntoB] = [new Set(a), new Set(b)]
  if (!conjuntoA.size || !conjuntoB.size) return 0
  const comuns = [...conjuntoA].filter(p => conjuntoB.has(p)).length
  return (2 * comuns) / (conjuntoA.size + conjuntoB.size)
}

// O "autor" que programas de escritório e de PDF deixam nos metadados não é autor.
const AUTOR_FALSO = /^(?:admin(?:istrator|istrador)?|user|usuario|unknown|desconhecido|autor|author|owner|microsoft.*|.*@.*)$/

/** Os autores que valem para buscar e comparar. */
export const autoresValidos = (autores: string[]) =>
  autores.map(a => a.trim()).filter(a => a.length > 1 && !AUTOR_FALSO.test(semAcento(a)))

const palavrasDoNome = (nome: string) =>
  semAcento(nome)
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(p => p.length > 1)

function semelhancaDeAutor(nome: string, outro: string): number {
  const [a, b] = [palavrasDoNome(nome), palavrasDoNome(outro)]
  if (!a.length || !b.length) return 0
  if (a.join(' ') === b.join(' ')) return 1
  const mesmoSobrenome = a[a.length - 1] === b[b.length - 1]
  if (mesmoSobrenome && a[0] === b[0]) return 0.95
  return Math.max(mesmoSobrenome ? 0.8 : 0, semelhanca(a, b))
}

/** A obra que corresponde ao livro, ou null se nenhuma bate com segurança. */
export function escolherObra(alvo: Alvo, encontradas: ObraEncontrada[]): ObraEncontrada | null {
  const titulo = palavrasDoTitulo(alvo.titulo)
  const autores = autoresValidos(alvo.autores)
  const aceitas = encontradas.flatMap(encontrada => {
    const notaDoTitulo = Math.max(
      semelhanca(titulo, palavrasDoTitulo(encontrada.obra.titulo)),
      encontrada.edicao ? semelhanca(titulo, palavrasDoTitulo(encontrada.edicao.titulo)) : 0,
    )
    const notaDoAutor = autores.length
      ? Math.max(0, ...autores.flatMap(a => encontrada.obra.autores.map(b => semelhancaDeAutor(a, b))))
      : 1
    if (notaDoTitulo < LIMITE_DO_TITULO || notaDoAutor < LIMITE_DO_AUTOR) return []
    return [{ encontrada, nota: notaDoTitulo * 0.6 + notaDoAutor * 0.4 }]
  })
  aceitas.sort((x, y) => y.nota - x.nota || y.encontrada.obra.edicoes - x.encontrada.obra.edicoes)
  return aceitas[0]?.encontrada ?? null
}

/** O texto da busca: o título principal e o primeiro autor que vale. */
export function consultaDeTexto(alvo: Alvo): string {
  return [tituloPrincipal(alvo.titulo), autoresValidos(alvo.autores)[0]].filter(Boolean).join(' ')
}

// Do idioma do livro (BCP 47, como "pt-BR") para o código do Open Library (MARC, como "por").
const IDIOMAS: Record<string, string> = {
  pt: 'por',
  en: 'eng',
  es: 'spa',
  fr: 'fre',
  de: 'ger',
  it: 'ita',
  la: 'lat',
  nl: 'dut',
  ru: 'rus',
  ja: 'jpn',
  zh: 'chi',
}

export const idiomaDoCatalogo = (idioma: string | null) => IDIOMAS[idioma?.toLowerCase().split('-')[0] ?? ''] ?? null

/** Para escolher a edição: primeiro as do idioma do livro, depois as com ISBN, das mais novas às mais velhas. */
export function ordenarEdicoes(edicoes: Edicao[], idiomaDoLivro: string | null): Edicao[] {
  const idioma = idiomaDoCatalogo(idiomaDoLivro)
  const peso = (e: Edicao) => (idioma && e.idiomas.includes(idioma) ? 2 : 0) + (e.isbn.length ? 1 : 0)
  return [...edicoes].sort((a, b) => peso(b) - peso(a) || (b.ano ?? 0) - (a.ano ?? 0))
}
