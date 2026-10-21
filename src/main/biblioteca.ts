// A biblioteca no disco: cada livro numa pasta `livros/<id>/`, com o arquivo original, o arquivo de
// leitura e a capa. O banco guarda o resto.

import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { ErroEpub, imagensDoEpub, lerEpub } from '@nucleo/epub/ler'
import { HORA_FRACA, type LivroNaNuvem } from '@nucleo/nuvem/regras'
import { converterPdfEmEpub, type OpcoesDeConversao, type ResultadoConversao } from '@nucleo/pdf/converter'
import type {
  AndamentoImportacao,
  CodigoErroImportacao,
  Identificadores,
  ImagemDoLivro,
  Livro,
  Locator,
  ResultadoImportacao,
} from '@nucleo/tipos'
import type { Banco } from './banco'

/** Converte PDF em EPUB. No app, roda num worker; nos testes, direto. */
export type ConversorDePdf = (bytes: Uint8Array, opcoes: OpcoesDeConversao) => Promise<ResultadoConversao>

export const MENSAGENS_DE_ERRO: Record<CodigoErroImportacao, string> = {
  'formato-nao-suportado': 'Este app lê arquivos EPUB e PDF, e este arquivo é de outro tipo.',
  'arquivo-invalido': 'Não consegui abrir este arquivo. Ele pode estar incompleto ou corrompido.',
  drm: 'Este livro está protegido pela loja onde foi comprado (DRM) e só abre no app dela.',
  'arquivo-inacessivel': 'Não encontrei o arquivo. Ele pode ter sido movido ou apagado.',
  'protegido-por-senha': 'Este PDF está protegido por senha. Abra-o no programa onde ele foi criado, salve sem senha e tente de novo.',
  'conversao-interrompida':
    'A adaptação deste PDF não terminou: ele pode ser grande ou complexo demais para esta versão. Tente de novo; se continuar, me conte qual arquivo foi.',
}

const erro = (codigo: CodigoErroImportacao): ResultadoImportacao => ({
  tipo: 'erro',
  codigo,
  mensagem: MENSAGENS_DE_ERRO[codigo],
})

export function tituloDoNomeDoArquivo(caminho: string) {
  return basename(caminho.replace(/\\/g, '/'))
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ehZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
const ehPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d

const ID_VALIDO = /^[0-9a-f-]{36}$/i

const TIPOS_DE_CAPA: [string, (b: Uint8Array) => boolean][] = [
  ['jpg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['png', b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ['webp', b => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50],
]
const TAMANHO_MAXIMO_DA_CAPA = 5 * 1024 * 1024
// As capas que o app gravou: as da importação ("capa.jpg") e as trocadas ("capa-<hash>.jpg").
const ARQUIVO_DE_CAPA = /^capa(?:-[0-9a-f]{12})?\.(?:jpg|png|webp|gif|svg|img)$/

const comHash = (bytes: Uint8Array, tipo: string) => `capa-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${tipo}`

/**
 * O nome do arquivo de uma capa, ou null se não é imagem (ou é grande demais). O nome muda junto
 * com a imagem: trocar a capa troca o endereço, e a tela não fica mostrando a antiga.
 */
export function nomeDaCapa(bytes: Uint8Array): string | null {
  const tipo = TIPOS_DE_CAPA.find(([, eh]) => eh(bytes))?.[0]
  if (!tipo || bytes.length > TAMANHO_MAXIMO_DA_CAPA) return null
  return comHash(bytes, tipo)
}

const ehGif = (b: Uint8Array) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38
const ehSvg = (b: Uint8Array) =>
  /^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(
    new TextDecoder().decode(b.subarray(0, 2048)),
  )

/**
 * O nome da capa na nuvem: o mesmo de nomeDaCapa, e também para as capas GIF e SVG que vêm dentro de
 * EPUBs. Quem baixa confere que o nome bate com a imagem.
 */
export function nomeDaCapaNaNuvem(bytes: Uint8Array): string | null {
  const tipo = TIPOS_DE_CAPA.find(([, eh]) => eh(bytes))?.[0] ?? (ehGif(bytes) ? 'gif' : ehSvg(bytes) ? 'svg' : null)
  if (!tipo || bytes.length > TAMANHO_MAXIMO_DA_CAPA) return null
  return comHash(bytes, tipo)
}

/** O que cada formato entrega para virar um livro da biblioteca. */
interface Preparado {
  titulo: string | null
  autores: string[]
  idioma: string | null
  identificadores: Identificadores
  arquivoOriginal: string
  arquivoLeitura: string | null
  capa: string | null
  arquivos: { nome: string; bytes: Uint8Array }[]
}

class ErroDeImportacao extends Error {
  constructor(readonly codigo: CodigoErroImportacao) {
    super(codigo)
  }
}

export class Biblioteca {
  readonly #pastaLivros: string

  constructor(
    pastaDados: string,
    private readonly banco: Banco,
    private readonly converterPdf: ConversorDePdf = converterPdfEmEpub,
  ) {
    this.#pastaLivros = resolve(pastaDados, 'livros')
  }

  listar(): Livro[] {
    return this.banco.listarLivros()
  }

  obter(id: string): Livro | null {
    return this.banco.obterLivro(id)
  }

  marcarAberto(id: string) {
    this.banco.marcarAberto(id)
  }

  salvarPosicao(id: string, posicao: Locator) {
    this.banco.salvarPosicao(id, posicao)
  }

  /** As imagens de dentro do livro que podem virar capa (só EPUB: o PDF é desenhado pela interface). */
  async imagensDoLivro(id: string): Promise<ImagemDoLivro[]> {
    const livro = this.obter(id)
    const caminho = livro?.formatoOriginal === 'epub' ? this.caminhoDoArquivo(id, livro.arquivoOriginal) : null
    if (!caminho) return []
    try {
      return imagensDoEpub(new Uint8Array(await readFile(caminho)))
    } catch (erro) {
      console.warn('Não deu para ler as imagens do EPUB', erro)
      return []
    }
  }

  /** Caminho de um arquivo do livro, ou null se não existir ou se tentar sair da pasta do livro. */
  caminhoDoArquivo(id: string, arquivo: string): string | null {
    if (!ID_VALIDO.test(id)) return null
    const pastaDoLivro = join(this.#pastaLivros, id)
    const caminho = resolve(pastaDoLivro, arquivo)
    if (!caminho.startsWith(pastaDoLivro + sep) || !existsSync(caminho)) return null
    return caminho
  }

  async importar(caminho: string, aoAndamento?: (a: AndamentoImportacao) => void): Promise<ResultadoImportacao> {
    aoAndamento?.({ etapa: 'lendo' })
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await readFile(caminho))
    } catch {
      return erro('arquivo-inacessivel')
    }

    const formato = ehZip(bytes) ? 'epub' : ehPdf(bytes) ? 'pdf' : null
    if (!formato) return erro('formato-nao-suportado')

    const hashSha256 = createHash('sha256').update(bytes).digest('hex')
    const existente = this.banco.obterPorHash(hashSha256)
    // Já estava na biblioteca, vindo da nuvem (o arquivo não desceu, ou é grande demais para subir):
    // o arquivo daqui completa o livro, e ele passa a ser deste computador.
    if (existente?.estado === 'na-nuvem') {
      const pronto = await this.completarDaNuvem(existente.id, bytes, aoAndamento, { daqui: true })
      return 'erro' in pronto ? erro(pronto.erro) : { tipo: 'adicionado', livro: pronto.livro }
    }
    if (existente) return { tipo: 'repetido', livro: existente }

    const id = randomUUID()
    let preparado: Preparado
    try {
      preparado =
        formato === 'epub'
          ? this.#prepararEpub(bytes)
          : await this.#prepararPdf(bytes, id, tituloDoNomeDoArquivo(caminho), aoAndamento)
    } catch (e) {
      if (e instanceof ErroEpub || e instanceof ErroDeImportacao) return erro(e.codigo)
      throw e
    }

    aoAndamento?.({ etapa: 'guardando' })
    const pastaDoLivro = join(this.#pastaLivros, id)
    try {
      await mkdir(pastaDoLivro, { recursive: true })
      for (const arquivo of preparado.arquivos) await writeFile(join(pastaDoLivro, arquivo.nome), arquivo.bytes)
      const livro = this.banco.inserirLivro({
        id,
        titulo: preparado.titulo ?? tituloDoNomeDoArquivo(caminho),
        autores: preparado.autores,
        idioma: preparado.idioma,
        formatoOriginal: formato,
        arquivoOriginal: preparado.arquivoOriginal,
        arquivoLeitura: preparado.arquivoLeitura,
        capa: preparado.capa,
        hashSha256,
        tamanhoBytes: bytes.length,
        identificadores: preparado.identificadores,
        estado: 'pronto',
        adicionadoEm: new Date().toISOString(),
      })
      return { tipo: 'adicionado', livro }
    } catch (e) {
      await rm(pastaDoLivro, { recursive: true, force: true })
      throw e
    }
  }

  #prepararEpub(bytes: Uint8Array): Preparado {
    const metadados = lerEpub(bytes)
    const capa = metadados.capa ? `capa.${metadados.capa.extensao}` : null
    return {
      titulo: metadados.titulo,
      autores: metadados.autores,
      idioma: metadados.idioma,
      identificadores: metadados.identificadores,
      arquivoOriginal: 'original.epub',
      arquivoLeitura: 'original.epub',
      capa,
      arquivos: [
        { nome: 'original.epub', bytes },
        ...(capa && metadados.capa ? [{ nome: capa, bytes: metadados.capa.bytes }] : []),
      ],
    }
  }

  async #prepararPdf(
    bytes: Uint8Array,
    id: string,
    tituloReserva: string,
    aoAndamento?: (a: AndamentoImportacao) => void,
  ): Promise<Preparado> {
    let resultado: ResultadoConversao
    try {
      resultado = await this.converterPdf(bytes, {
        identificador: `urn:uuid:${id}`,
        tituloReserva,
        aoAndamento: (atual, total) => aoAndamento?.({ etapa: 'adaptando', atual, total }),
      })
    } catch (e) {
      const nome = (e as { name?: string } | null)?.name
      throw new ErroDeImportacao(
        nome === 'PasswordException'
          ? 'protegido-por-senha'
          : nome === 'ConversaoInterrompida'
            ? 'conversao-interrompida'
            : 'arquivo-invalido',
      )
    }
    return {
      titulo: resultado.titulo,
      autores: resultado.autores,
      idioma: resultado.idioma,
      identificadores: { isbn: resultado.isbn, outros: [] },
      arquivoOriginal: 'original.pdf',
      arquivoLeitura: resultado.epub ? 'leitura.epub' : null,
      capa: null,
      arquivos: [
        { nome: 'original.pdf', bytes },
        ...(resultado.epub ? [{ nome: 'leitura.epub', bytes: resultado.epub }] : []),
      ],
    }
  }

  /**
   * Guarda a capa: a gerada da primeira página do PDF ou a do catálogo para um livro sem capa (o app
   * sozinho: hora fraca), ou a que você escolheu (escolhida: vale sobre as dos outros aparelhos).
   */
  async salvarCapa(id: string, bytes: Uint8Array, { escolhida = false } = {}): Promise<Livro | null> {
    const livro = ID_VALIDO.test(id) ? this.banco.obterLivro(id) : null
    const nome = nomeDaCapa(bytes)
    if (!livro || !nome) return null
    if (livro.capa === nome) return livro
    await writeFile(join(this.#pastaLivros, id, nome), bytes)
    this.banco.atualizarLivro(id, { capa: nome }, { hora: escolhida ? undefined : HORA_FRACA })
    // A anterior sai do disco depois que o banco já aponta para a nova.
    if (livro.capa && ARQUIVO_DE_CAPA.test(livro.capa)) {
      await rm(join(this.#pastaLivros, id, livro.capa), { force: true }).catch(() => {})
    }
    return this.banco.obterLivro(id)
  }

  /** Remove o livro (daNuvem: removido em outro aparelho; não volta como lápide). */
  async remover(id: string, { daNuvem = false } = {}) {
    if (!ID_VALIDO.test(id)) return
    this.banco.removerLivro(id, { daNuvem })
    // No Windows, um antivírus pode segurar o arquivo por um instante. Se ainda assim falhar,
    // a pasta fica órfã e sai na próxima abertura do app (limparPastasOrfas).
    await rm(join(this.#pastaLivros, id), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      erro => console.warn('Pasta do livro não pôde ser apagada agora', erro),
    )
  }

  // A nuvem (parte 2).

  async #ler(id: string, arquivo: string | null): Promise<Uint8Array | null> {
    const caminho = arquivo ? this.caminhoDoArquivo(id, arquivo) : null
    if (!caminho) return null
    try {
      return new Uint8Array(await readFile(caminho))
    } catch {
      return null
    }
  }

  /** A capa do livro (a de agora, ou a deste nome), para subir para a nuvem. */
  lerCapa(id: string, nome = this.obter(id)?.capa ?? null): Promise<Uint8Array | null> {
    return this.#ler(id, nome)
  }

  /** O arquivo original do livro, para subir para a nuvem. */
  lerOriginal(id: string): Promise<Uint8Array | null> {
    const livro = this.obter(id)
    return this.#ler(id, livro?.estado === 'pronto' ? livro.arquivoOriginal : null)
  }

  /**
   * A capa `capaQueSubiu` subiu para a nuvem com o nome do conteúdo; a daqui passa a ter o mesmo nome.
   * Se a capa foi trocada durante o envio, nada muda (a nova sobe na próxima vez). Devolve se marcou.
   */
  async marcarCapaNaNuvem(id: string, capaQueSubiu: string, nome: string, bytes: Uint8Array): Promise<boolean> {
    const livro = ID_VALIDO.test(id) ? this.banco.obterLivro(id) : null
    if (livro?.capa !== capaQueSubiu) return false
    if (capaQueSubiu !== nome) await writeFile(join(this.#pastaLivros, id, nome), bytes)
    if (!this.banco.marcarCapaNaNuvem(id, capaQueSubiu, nome)) {
      await this.#apagarCapaSemUso(id, nome)
      return false
    }
    if (capaQueSubiu !== nome) await this.#apagarCapaSemUso(id, capaQueSubiu)
    return true
  }

  /**
   * Uma capa que veio da nuvem: só entra se a imagem for a que o nome diz e se ainda for mais nova que
   * a daqui (uma capa escolhida aqui durante o download fica).
   */
  async guardarCapaDaNuvem(id: string, nome: string, bytes: Uint8Array, capaEm: string | null): Promise<boolean> {
    const livro = ID_VALIDO.test(id) ? this.banco.obterLivro(id) : null
    if (!livro || nomeDaCapaNaNuvem(bytes) !== nome) return false
    const pasta = join(this.#pastaLivros, id)
    await mkdir(pasta, { recursive: true })
    await writeFile(join(pasta, nome), bytes)
    const anterior = this.banco.obterLivro(id)?.capa ?? null
    if (!this.banco.guardarCapaDaNuvem(id, nome, capaEm)) {
      await this.#apagarCapaSemUso(id, nome)
      return false
    }
    if (anterior && anterior !== nome) await this.#apagarCapaSemUso(id, anterior)
    return true
  }

  /** Apaga o arquivo de uma capa da pasta do livro, se ela não é (ou não voltou a ser) a capa dele. */
  async #apagarCapaSemUso(id: string, nome: string) {
    if (!ARQUIVO_DE_CAPA.test(nome) || this.banco.obterLivro(id)?.capa === nome) return
    await rm(join(this.#pastaLivros, id, nome), { force: true }).catch(() => {})
  }

  /** Um livro de outro aparelho: o livro no banco, com o arquivo ainda na nuvem, e a pasta (para a capa). */
  async criarDaNuvem(livro: LivroNaNuvem): Promise<Livro> {
    const id = randomUUID()
    // Primeiro o banco: saindo da conta no meio, o livro sai junto com os outros que vieram da nuvem.
    const novo = this.banco.inserirDaNuvem(id, livro)
    await mkdir(join(this.#pastaLivros, id), { recursive: true })
    return novo
  }

  /**
   * O arquivo de um livro da nuvem chegou: confere o hash, prepara como na importação (o PDF ganha o
   * texto adaptado) e o livro fica pronto. O que o livro já tem (título, obra, posição) fica.
   */
  async completarDaNuvem(
    id: string,
    bytes: Uint8Array,
    aoAndamento?: (a: AndamentoImportacao) => void,
    { daqui = false } = {},
  ): Promise<{ livro: Livro } | { erro: CodigoErroImportacao }> {
    const livro = ID_VALIDO.test(id) ? this.banco.obterLivro(id) : null
    if (!livro) return { erro: 'arquivo-inacessivel' }
    if (livro.estado !== 'na-nuvem') return { livro }
    if (createHash('sha256').update(bytes).digest('hex') !== livro.hashSha256) return { erro: 'arquivo-invalido' }
    let preparado: Preparado
    try {
      preparado =
        livro.formatoOriginal === 'epub'
          ? this.#prepararEpub(bytes)
          : await this.#prepararPdf(bytes, id, livro.titulo, aoAndamento)
    } catch (e) {
      if (e instanceof ErroEpub || e instanceof ErroDeImportacao) return { erro: e.codigo }
      throw e
    }
    aoAndamento?.({ etapa: 'guardando' })
    const pastaDoLivro = join(this.#pastaLivros, id)
    await mkdir(pastaDoLivro, { recursive: true })
    // A capa do arquivo só entra se o livro ainda não tem uma (a da nuvem vale mais).
    const usarCapa = !livro.capa && preparado.capa
    for (const arquivo of preparado.arquivos) {
      if (arquivo.nome === preparado.capa && !usarCapa) continue
      await writeFile(join(pastaDoLivro, arquivo.nome), arquivo.bytes)
    }
    this.banco.completarDaNuvem(id, { arquivoOriginal: preparado.arquivoOriginal, arquivoLeitura: preparado.arquivoLeitura }, { daqui })
    // Removido em outro aparelho enquanto era preparado: a pasta recriada sai também.
    if (!this.banco.obterLivro(id)) {
      await rm(pastaDoLivro, { recursive: true, force: true }).catch(() => {})
      return { erro: 'arquivo-inacessivel' }
    }
    if (usarCapa) this.banco.atualizarLivro(id, { capa: preparado.capa }, { hora: HORA_FRACA })
    return { livro: this.banco.obterLivro(id)! }
  }

  /** Apaga pastas de livros que não estão no banco (importação interrompida, remoção que falhou). */
  async limparPastasOrfas() {
    const pastas = await readdir(this.#pastaLivros, { withFileTypes: true }).catch(() => [])
    for (const pasta of pastas) {
      if (!pasta.isDirectory() || !ID_VALIDO.test(pasta.name) || this.banco.obterLivro(pasta.name)) continue
      await rm(join(this.#pastaLivros, pasta.name), { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
    }
  }
}
