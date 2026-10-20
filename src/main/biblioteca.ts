// A biblioteca no disco: cada livro numa pasta `livros/<id>/`, com o arquivo original, o arquivo de
// leitura e a capa. O banco guarda o resto.

import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { ErroEpub, lerEpub } from '@nucleo/epub/ler'
import { converterPdfEmEpub, type OpcoesDeConversao, type ResultadoConversao } from '@nucleo/pdf/converter'
import type {
  AndamentoImportacao,
  CodigoErroImportacao,
  Identificadores,
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
  ['webp', b => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50],
]
const TAMANHO_MAXIMO_DA_CAPA = 5 * 1024 * 1024

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
      throw new ErroDeImportacao(nome === 'PasswordException' ? 'protegido-por-senha' : 'arquivo-invalido')
    }
    return {
      titulo: resultado.titulo,
      autores: resultado.autores,
      idioma: resultado.idioma,
      identificadores: { isbn: [], outros: [] },
      arquivoOriginal: 'original.pdf',
      arquivoLeitura: resultado.epub ? 'leitura.epub' : null,
      capa: null,
      arquivos: [
        { nome: 'original.pdf', bytes },
        ...(resultado.epub ? [{ nome: 'leitura.epub', bytes: resultado.epub }] : []),
      ],
    }
  }

  /** Guarda a capa (gerada pela interface a partir da primeira página do PDF). */
  async salvarCapa(id: string, bytes: Uint8Array): Promise<Livro | null> {
    const livro = ID_VALIDO.test(id) ? this.banco.obterLivro(id) : null
    const tipo = TIPOS_DE_CAPA.find(([, eh]) => eh(bytes))?.[0]
    if (!livro || !tipo || bytes.length > TAMANHO_MAXIMO_DA_CAPA) return null
    const nome = `capa.${tipo}`
    await writeFile(join(this.#pastaLivros, id, nome), bytes)
    this.banco.atualizarLivro(id, { capa: nome })
    return this.banco.obterLivro(id)
  }

  async remover(id: string) {
    if (!ID_VALIDO.test(id)) return
    this.banco.removerLivro(id)
    await rm(join(this.#pastaLivros, id), { recursive: true, force: true })
  }
}
