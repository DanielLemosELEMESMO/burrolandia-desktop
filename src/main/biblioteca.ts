// A biblioteca no disco: cada livro numa pasta `livros/<id>/`, com o arquivo original, o arquivo de
// leitura e a capa. O banco guarda o resto.

import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { ErroEpub, lerEpub } from '@nucleo/epub/ler'
import type { AndamentoImportacao, CodigoErroImportacao, Livro, Locator, ResultadoImportacao } from '@nucleo/tipos'
import type { Banco } from './banco'

export const MENSAGENS_DE_ERRO: Record<CodigoErroImportacao, string> = {
  'formato-nao-suportado': 'Este app lê arquivos EPUB e PDF, e este arquivo é de outro tipo.',
  'arquivo-invalido': 'Não consegui abrir este arquivo. Ele pode estar incompleto ou corrompido.',
  drm: 'Este livro está protegido pela loja onde foi comprado (DRM) e só abre no app dela.',
  'arquivo-inacessivel': 'Não encontrei o arquivo. Ele pode ter sido movido ou apagado.',
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

export class Biblioteca {
  readonly #pastaLivros: string

  constructor(
    pastaDados: string,
    private readonly banco: Banco,
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

    if (!ehZip(bytes) && !ehPdf(bytes)) return erro('formato-nao-suportado')
    // O PDF chega na etapa 2.
    if (ehPdf(bytes)) return erro('formato-nao-suportado')

    const hashSha256 = createHash('sha256').update(bytes).digest('hex')
    const existente = this.banco.obterPorHash(hashSha256)
    if (existente) return { tipo: 'repetido', livro: existente }

    let metadados
    try {
      metadados = lerEpub(bytes)
    } catch (e) {
      if (e instanceof ErroEpub) return erro(e.codigo)
      throw e
    }

    aoAndamento?.({ etapa: 'guardando' })
    const id = randomUUID()
    const pastaDoLivro = join(this.#pastaLivros, id)
    try {
      await mkdir(pastaDoLivro, { recursive: true })
      await writeFile(join(pastaDoLivro, 'original.epub'), bytes)
      let capa: string | null = null
      if (metadados.capa) {
        capa = `capa.${metadados.capa.extensao}`
        await writeFile(join(pastaDoLivro, capa), metadados.capa.bytes)
      }
      const livro = this.banco.inserirLivro({
        id,
        titulo: metadados.titulo ?? tituloDoNomeDoArquivo(caminho),
        autores: metadados.autores,
        idioma: metadados.idioma,
        formatoOriginal: 'epub',
        arquivoOriginal: 'original.epub',
        arquivoLeitura: 'original.epub',
        capa,
        hashSha256,
        tamanhoBytes: bytes.length,
        identificadores: metadados.identificadores,
        estado: 'pronto',
        adicionadoEm: new Date().toISOString(),
      })
      return { tipo: 'adicionado', livro }
    } catch (e) {
      await rm(pastaDoLivro, { recursive: true, force: true })
      throw e
    }
  }

  async remover(id: string) {
    if (!ID_VALIDO.test(id)) return
    this.banco.removerLivro(id)
    await rm(join(this.#pastaLivros, id), { recursive: true, force: true })
  }
}
