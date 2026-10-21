// O cliente do Open Library: uma requisição por vez, com folga entre elas (como o catálogo pede a
// quem não é navegador), tempo-limite, e a diferença entre "não achou" e "sem conexão".
// Quem chama passa a função de rede: no app, a do Electron; nos testes, uma de mentira.

import type { Edicao, ObraEncontrada } from '../tipos'
import { CAMPOS_DA_BUSCA, lerBusca, lerEdicao, lerEdicoes, lerObra, tamanhoDaPagina } from './openlibrary'

export interface RespostaHttp {
  ok: boolean
  status: number
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}

export type Buscar = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<RespostaHttp>

/** Rede fora, catálogo fora do ar ou pedindo calma: vale tentar de novo mais tarde. */
export class SemConexao extends Error {
  override name = 'SemConexao'
}

export interface Enderecos {
  openLibrary: string
  capas: string
}

export const ENDERECOS_DO_OPEN_LIBRARY: Enderecos = {
  openLibrary: 'https://openlibrary.org',
  capas: 'https://covers.openlibrary.org',
}

const AGENTE = 'Burrolandia/0.1 (leitor pessoal de EPUB e PDF)'
const TEMPO_LIMITE = 15_000
const POR_PAGINA = 100
const MAXIMO_DE_EDICOES = 300

const espera = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class ClienteOpenLibrary {
  #fila: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly buscar: Buscar,
    private readonly enderecos: Enderecos = ENDERECOS_DO_OPEN_LIBRARY,
    private readonly folga = 300,
  ) {}

  /** Uma requisição por vez; um erro não trava as próximas. */
  #naFila<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = this.#fila.then(tarefa)
    this.#fila = resultado.catch(() => undefined).then(() => espera(this.folga))
    return resultado
  }

  /** A resposta, ou null quando o endereço não existe (404). */
  #pedir(url: string): Promise<RespostaHttp | null> {
    return this.#naFila(async () => {
      let resposta: RespostaHttp
      try {
        resposta = await this.buscar(url, {
          headers: { Accept: 'application/json', 'User-Agent': AGENTE },
          signal: AbortSignal.timeout(TEMPO_LIMITE),
        })
      } catch (erro) {
        throw new SemConexao(`Sem conexão com o Open Library (${(erro as Error)?.message ?? erro})`)
      }
      if (resposta.status === 404) return null
      if (!resposta.ok) throw new SemConexao(`O Open Library respondeu ${resposta.status}`)
      return resposta
    })
  }

  async #json(caminho: string): Promise<unknown> {
    const resposta = await this.#pedir(this.enderecos.openLibrary + caminho)
    if (!resposta) return null
    try {
      return await resposta.json()
    } catch {
      throw new SemConexao('O Open Library mandou uma resposta que não deu para ler')
    }
  }

  #busca(parametros: Record<string, string>) {
    return this.#json(`/search.json?${new URLSearchParams({ ...parametros, fields: CAMPOS_DA_BUSCA })}`)
  }

  /** A obra com a edição exata daquele ISBN, ou null se o catálogo não conhece o ISBN. */
  async porIsbn(isbn: string): Promise<ObraEncontrada | null> {
    return lerBusca(await this.#busca({ isbn, limit: '1' }))[0] ?? null
  }

  /** Busca livre (título e autor, no idioma que for): as obras com a edição que bateu. */
  async porTexto(consulta: string, limite = 10): Promise<ObraEncontrada[]> {
    return lerBusca(await this.#busca({ q: consulta, limit: String(limite) }))
  }

  /** Uma obra pelo id, com os nomes dos autores (que o registro da obra não traz). */
  async obra(obraId: string): Promise<ObraEncontrada | null> {
    const achadas = lerBusca(await this.#busca({ q: `key:/works/${obraId}`, limit: '1' }))
    return achadas.find(a => a.obra.id === obraId) ?? null
  }

  /** A descrição e os assuntos de uma obra. */
  async detalhesDaObra(obraId: string) {
    const resposta = await this.#json(`/works/${obraId}.json`)
    return resposta ? lerObra(resposta) : null
  }

  /** As edições de uma obra, página por página, até acabarem (ou até 300). */
  async edicoes(obraId: string): Promise<Edicao[]> {
    const todas: Edicao[] = []
    for (let offset = 0; offset < MAXIMO_DE_EDICOES; offset += POR_PAGINA) {
      const resposta = await this.#json(`/works/${obraId}/editions.json?limit=${POR_PAGINA}&offset=${offset}`)
      todas.push(...lerEdicoes(resposta, obraId))
      if (tamanhoDaPagina(resposta) < POR_PAGINA) break
    }
    return todas
  }

  async edicao(edicaoId: string): Promise<Edicao | null> {
    return lerEdicao(await this.#json(`/books/${edicaoId}.json`))
  }

  /** A capa grande (a imagem), ou null se o catálogo não tem essa capa. */
  async capa(capaId: number): Promise<Uint8Array | null> {
    const resposta = await this.#pedir(`${this.enderecos.capas}/b/id/${capaId}-L.jpg?default=false`)
    return resposta ? new Uint8Array(await resposta.arrayBuffer()) : null
  }
}
