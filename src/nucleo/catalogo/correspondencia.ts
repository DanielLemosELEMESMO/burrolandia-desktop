// Qual obra do catálogo é este livro? Compara o título e o autor; aceita uma tradução pela edição que
// bateu na busca ("A Origem das Espécies" é On the Origin of Species) e, entre obras repetidas do
// catálogo, fica com a que tem mais edições. Na dúvida não escolhe: ligar o livro à obra errada é
// pior do que deixar a pessoa procurar.

import type { Edicao, ObraEncontrada } from '../tipos'

export interface Alvo {
  titulo: string
  autores: string[]
}

const LIMITE_DO_TITULO = 0.85
const LIMITE_DO_AUTOR = 0.6
// Pelo ISBN a edição já é a exata; o título só precisa mostrar que não é outro livro (um citado).
const LIMITE_DO_TITULO_PELO_ISBN = 0.5
const TAMANHO_DA_BUSCA = 200

const semAcento = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Artigo no começo ("A Origem…") ou invertido no fim, como nos catálogos ("Origem das Espécies, A").
const ARTIGO_NO_COMECO = /^(?:o|a|os|as|um|uma|the|an?|el|la|los|las|le|les|il|lo)\s+/i
const ARTIGO_NO_FIM = /,\s*(?:o|a|os|as|the|an?|el|la|le|les)$/i
const semArtigo = (texto: string) => texto.trim().replace(ARTIGO_NO_FIM, '').replace(ARTIGO_NO_COMECO, '')

// Entre parênteses ou colchetes vem a série ("Em Chamas (Jogos Vorazes Livro 2)"), que fica de fora;
// só o número de um volume solto ("Diário de um Banana (Vol. 2)") continua valendo.
const ENTRE_PARENTESES = /[([]([^)\]]*)[)\]]/g
const VOLUME = /^(?:v|vol(?:ume)?|livro|tomo|parte|part|book|n[º°o]?|#)\.?\s*(\d+)$/

// O subtítulo vem depois de dois-pontos, ponto e vírgula ou travessão.
const ANTES_DO_SUBTITULO = /\s*[:;]\s*|\s+[-–—]\s+/

// Subtítulo que só diz o gênero, a série ou a edição não distingue a obra: "Dom Casmurro: romance",
// "Iracema: lenda do Ceará", "Frankenstein: ou o Prometeu moderno", "As Crônicas de Gelo e Fogo", "2ª edição".
const SUBTITULOS_GENERICOS = [
  /^(?:romances?|novelas?|contos?|poemas?|poesias?|cronicas?|ensaios?|teatro|pecas?|lendas?|narrativas?)\b/,
  /^(?:novel|stories|poems|essays)\b/,
  /^(?:ou|or)\s/,
  /^(?:\d+\S*\s+)?(?:edicao|edition|texto integral|obra completa|versao|volume unico|traducao|adaptacao)\b/,
  /^(?:unabridged|annotated)\b/,
]

/** O título em partes, ainda como texto: o principal e o subtítulo que distingue a obra (ou null). */
function partesDoTitulo(titulo: string) {
  const volume: string[] = []
  const semParenteses = titulo.replace(ENTRE_PARENTESES, (_, dentro: string) => {
    const numero = semAcento(dentro.trim()).match(VOLUME)?.[1]
    if (numero) volume.push(numero)
    return ' '
  })
  const [principal = '', ...resto] = semParenteses.split(ANTES_DO_SUBTITULO)
  const subtitulo = semArtigo(resto.join(' '))
  const generico = !subtitulo || SUBTITULOS_GENERICOS.some(regra => regra.test(semAcento(subtitulo)))
  return { principal: semArtigo(principal), subtitulo: generico ? null : subtitulo, volume }
}

const palavras = (texto: string) =>
  semAcento(texto)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

interface Titulo {
  principal: string[]
  subtitulo: string[] | null
  /** Os números de volume que vieram entre parênteses. */
  volume: string[]
}

function titulo(texto: string): Titulo {
  const { principal, subtitulo, volume } = partesDoTitulo(texto)
  return { principal: palavras(principal), subtitulo: subtitulo ? palavras(subtitulo) : null, volume }
}

const inteiro = (t: Titulo) => [...t.principal, ...(t.subtitulo ?? [])]

/** Semelhança de Dice entre dois conjuntos de palavras: 1 quando são iguais, 0 quando nada bate. */
function semelhanca(a: string[], b: string[]): number {
  const [conjuntoA, conjuntoB] = [new Set(a), new Set(b)]
  if (!conjuntoA.size || !conjuntoB.size) return 0
  const comuns = [...conjuntoA].filter(p => conjuntoB.has(p)).length
  return (2 * comuns) / (conjuntoA.size + conjuntoB.size)
}

/** Os números têm que ser os mesmos dos dois lados: "Diário de um Banana 2" não é o volume 1. */
function mesmosNumeros(a: string[], volumeA: string[], b: string[], volumeB: string[]) {
  const numeros = (partes: string[], volume: string[]) =>
    new Set([...partes.flatMap(p => p.match(/\d+/g) ?? []), ...volume].map(n => String(Number(n))))
  const [na, nb] = [numeros(a, volumeA), numeros(b, volumeB)]
  return na.size === nb.size && [...na].every(n => nb.has(n))
}

/**
 * Quanto o título do livro bate com um título do catálogo. Com um subtítulo que distingue a obra
 * ("O Senhor dos Anéis: As Duas Torres"), o título principal sozinho não basta (seria qualquer volume
 * da série), a não ser em `soPrincipal`, para conferir o ISBN.
 */
function semelhancaDeTitulo(livro: Titulo, outro: Titulo, { soPrincipal = false } = {}): number {
  const comparar = (a: string[], b: string[]) =>
    mesmosNumeros(a, livro.volume, b, outro.volume) ? semelhanca(a, b) : 0
  return Math.max(
    comparar(inteiro(livro), inteiro(outro)),
    // Sem subtítulo que distinga, basta o principal: "Grande Sertão" é "Grande sertão: veredas".
    !livro.subtitulo || soPrincipal ? comparar(livro.principal, outro.principal) : 0,
    // "Série: volume": "Jogos Vorazes: Em Chamas" é a edição "Em Chamas".
    livro.subtitulo ? comparar(livro.subtitulo, outro.principal) : 0,
  )
}

// O "autor" que programas de escritório e de PDF deixam nos metadados não é autor.
const AUTORES_FALSOS = [
  /^(?:admin(?:istrator|istrador)?|(?:windows )?user|usuario(?: do windows)?|owner|proprietario|cliente|pc)$/,
  /^(?:autor|author|unknown|(?:autor )?desconhecido|anonimo|anonymous)$/,
  /^(?:hp(?: inc\.?)?|lenovo|dell|acer|asus|positivo|samsung|microsoft.*|office.*)$/,
  // Um e-mail, ou um nome de usuário com números ("aluno2024").
  /^\S*@\S*$/,
  /^\S*\d\S*$/,
]

/** Os autores que valem para buscar e comparar. */
export const autoresValidos = (autores: string[]) =>
  autores.map(a => a.trim()).filter(a => a.length > 1 && !AUTORES_FALSOS.some(regra => regra.test(semAcento(a))))

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

/** Os títulos de uma obra achada: o da obra e o da edição que bateu na busca (talvez uma tradução). */
const titulosDaAchada = ({ obra, edicao }: ObraEncontrada) =>
  [obra.titulo, ...(edicao ? [edicao.titulo] : [])].map(titulo)

const notaDoAutor = (autores: string[], { obra }: ObraEncontrada) =>
  Math.max(0, ...autores.flatMap(a => obra.autores.map(b => semelhancaDeAutor(a, b))))

/** A obra que corresponde ao livro, ou null se nenhuma bate com segurança. */
export function escolherObra(alvo: Alvo, encontradas: ObraEncontrada[]): ObraEncontrada | null {
  const autores = autoresValidos(alvo.autores)
  // Sem autor, um título sozinho ("Relatório", "Introdução") bate com qualquer coisa.
  if (!autores.length) return null
  const livro = titulo(alvo.titulo)
  const aceitas = encontradas.flatMap(encontrada => {
    // Registro de obra sem nenhuma edição é sobra do catálogo: não há edição para escolher.
    if (encontrada.obra.edicoes < 1) return []
    const titulos = titulosDaAchada(encontrada)
    const notaDoTitulo = Math.max(...titulos.map(t => semelhancaDeTitulo(livro, t)))
    const nota = notaDoAutor(autores, encontrada)
    if (notaDoTitulo < LIMITE_DO_TITULO || nota < LIMITE_DO_AUTOR) return []
    // Entre as que batem, a de título inteiro igual: "O Senhor dos Anéis" é a obra toda, não um volume.
    const tituloInteiro = Math.max(...titulos.map(t => semelhanca(inteiro(livro), inteiro(t))))
    return [{ encontrada, nota: notaDoTitulo * 0.6 + nota * 0.4, tituloInteiro }]
  })
  aceitas.sort(
    (x, y) => y.nota - x.nota || y.tituloInteiro - x.tituloInteiro || y.encontrada.obra.edicoes - x.encontrada.obra.edicoes,
  )
  return aceitas[0]?.encontrada ?? null
}

/** O ISBN achado é deste livro? Um PDF também traz os ISBNs dos livros que cita. */
export function isbnConfere(alvo: Alvo, achada: ObraEncontrada): boolean {
  const livro = titulo(alvo.titulo)
  const notaDoTitulo = Math.max(
    ...titulosDaAchada(achada).map(t => semelhancaDeTitulo(livro, t, { soPrincipal: true })),
  )
  return (
    notaDoTitulo >= LIMITE_DO_TITULO_PELO_ISBN || notaDoAutor(autoresValidos(alvo.autores), achada) >= LIMITE_DO_AUTOR
  )
}

const juntar = (...partes: (string | null | undefined)[]) => partes.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

/**
 * As buscas para reconhecer o livro sozinho, da mais exata à mais larga: o título inteiro, o
 * subtítulo (que numa série é o volume) e o título principal, sempre com o autor. Sem autor,
 * nenhuma: o título sozinho não basta e pode ser só o nome do arquivo.
 */
export function consultasDeTexto(alvo: Alvo): string[] {
  const autor = autoresValidos(alvo.autores)[0]
  const { principal, subtitulo } = partesDoTitulo(alvo.titulo)
  if (!autor || !principal) return []
  const consultas = subtitulo
    ? [juntar(principal, subtitulo, autor), juntar(subtitulo, autor), juntar(principal, autor)]
    : [juntar(principal, autor)]
  return [...new Set(consultas)]
}

/** O texto da busca à mão: o título principal e o primeiro autor que vale. */
export function consultaDeTexto(alvo: Alvo): string {
  const consulta = juntar(partesDoTitulo(alvo.titulo).principal, autoresValidos(alvo.autores)[0])
  if (consulta.length <= TAMANHO_DA_BUSCA) return consulta
  const corte = consulta.lastIndexOf(' ', TAMANHO_DA_BUSCA)
  return consulta.slice(0, corte > 0 ? corte : TAMANHO_DA_BUSCA)
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
