// A nuvem de verdade: o Supabase do projeto, com a chave publicável (feita para ir no app; quem protege
// os dados é a RLS do banco). A sessão fica no armazenamento que o app passar (no app, o banco local
// cifrado pelo sistema) e a rede é a que o app passar (no app, a do Chromium, que respeita o proxy).

import {
  createClient,
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type PostgrestError,
  type SupabaseClient,
} from '@supabase/supabase-js'
import type { Lapide, LivroNaNuvem, LivroParaGuardar } from '@nucleo/nuvem/regras'
import {
  ErroDaConta,
  NaoEstaNaNuvem,
  SemConexaoComANuvem,
  SessaoTerminada,
  type Bucket,
  type Remoto,
} from '@nucleo/nuvem/remoto'
import type { CodigoDaConta, Conta, UsoDaNuvem } from '@nucleo/tipos'

/** O projeto Burrolândia no Supabase. A chave publicável pode ir no app; a secreta, nunca. */
export const PROJETO_DA_NUVEM = {
  url: 'https://mslaevgpqkisxigqbqjz.supabase.co',
  chave: 'sb_publishable_eZSYbe3QTczHZ5uxaOzj2g_vUT2Xvvb',
}

/** Os tempos limite (nos testes, menores). */
export interface TemposDaNuvem {
  /** Quanto esperar um pedido comum. */
  pedido?: number
  /** Quanto esperar um arquivo subir ou descer. */
  arquivo?: number
  /** Saindo da conta sem conexão, quanto esperar a nuvem saber da saída. */
  avisoDaSaida?: number
}

export interface ArmazenamentoDaSessao {
  getItem(chave: string): string | null | Promise<string | null>
  setItem(chave: string, valor: string): void | Promise<void>
  removeItem(chave: string): void | Promise<void>
}

const CHAVE_DA_SESSAO = 'burrolandia-sessao'

/** Quanto esperar a nuvem: um pedido comum, e um arquivo (um livro de 50 MB numa rede lenta). */
const TEMPO_DO_PEDIDO = 30_000
const TEMPO_DO_ARQUIVO = 10 * 60_000
/** Saindo da conta sem conexão, não espera a nuvem saber da saída mais que isso. */
const TEMPO_PARA_AVISAR_A_SAIDA = 3_000

const espera = (ms: number) => new Promise<void>(pronto => setTimeout(pronto, ms).unref?.())

/** Subir ou baixar um arquivo do Storage (a lista de uma pasta é um pedido comum). */
const levaArquivo = (endereco: string, metodo = 'GET') =>
  /\/storage\/v1\/object\/(?!list\/)/.test(endereco) && ['GET', 'POST', 'PUT'].includes(metodo.toUpperCase())

/** Uma linha da tabela livros, como o PostgREST devolve. */
interface Linha {
  hash_sha256: string
  titulo: string
  autores: string[]
  idioma: string | null
  formato_original: LivroNaNuvem['formato']
  tamanho_bytes: number
  identificadores: LivroNaNuvem['identificadores']
  obra_id: string | null
  edicao_id: string | null
  reconhecimento: LivroNaNuvem['reconhecimento']
  obra: LivroNaNuvem['obra']
  edicao: LivroNaNuvem['edicao']
  metadados_em: string
  capa: string | null
  capa_em: string | null
  arquivo: string | null
  posicao: LivroNaNuvem['posicao']
  progresso: number
  posicao_em: string | null
  adicionado_em: string
  aberto_em: string | null
  removido_em: string | null
  atualizado_em: string
}

const deLinha = (l: Linha): LivroNaNuvem => ({
  hash: l.hash_sha256,
  titulo: l.titulo,
  autores: l.autores,
  idioma: l.idioma,
  formato: l.formato_original,
  tamanhoBytes: Number(l.tamanho_bytes),
  identificadores: l.identificadores,
  obraId: l.obra_id,
  edicaoId: l.edicao_id,
  reconhecimento: l.reconhecimento,
  obra: l.obra,
  edicao: l.edicao,
  metadadosEm: l.metadados_em,
  capa: l.capa,
  capaEm: l.capa_em,
  arquivo: l.arquivo,
  posicao: l.posicao,
  progresso: l.progresso,
  posicaoEm: l.posicao_em,
  adicionadoEm: l.adicionado_em,
  abertoEm: l.aberto_em,
  removidoEm: l.removido_em,
  atualizadoEm: l.atualizado_em,
})

const paraLinha = (l: LivroParaGuardar) => ({
  hash_sha256: l.hash,
  titulo: l.titulo,
  autores: l.autores,
  idioma: l.idioma,
  formato_original: l.formato,
  tamanho_bytes: l.tamanhoBytes,
  identificadores: l.identificadores,
  obra_id: l.obraId,
  edicao_id: l.edicaoId,
  reconhecimento: l.reconhecimento,
  obra: l.obra,
  edicao: l.edicao,
  metadados_em: l.metadadosEm,
  capa: l.capa,
  capa_em: l.capaEm,
  arquivo: l.arquivo,
  posicao: l.posicao,
  progresso: l.progresso,
  posicao_em: l.posicaoEm,
  adicionado_em: l.adicionadoEm,
  aberto_em: l.abertoEm,
  novo: l.novo,
})

/** O código de erro do Auth do Supabase para o que a tela da conta explica. */
function codigoDaConta(erro: unknown): CodigoDaConta {
  if (isAuthRetryableFetchError(erro)) return 'sem-conexao'
  if (isAuthWeakPasswordError(erro)) return 'senha-fraca'
  if (!isAuthApiError(erro)) return 'falhou'
  switch (erro.code) {
    case 'invalid_credentials':
    case 'email_not_confirmed':
      return 'senha-errada'
    case 'user_already_exists':
    case 'email_exists':
      return 'conta-existe'
    case 'weak_password':
      return 'senha-fraca'
    case 'email_address_invalid':
    case 'validation_failed':
      return 'email-invalido'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'muitas-tentativas'
    default:
      return erro.status === 429 ? 'muitas-tentativas' : 'falhou'
  }
}

const contaDe = (usuario: { id: string; email?: string } | null | undefined): Conta | null =>
  usuario?.id ? { id: usuario.id, email: usuario.email ?? '' } : null

export class RemotoSupabase implements Remoto {
  readonly #cliente: SupabaseClient
  readonly #armazenamento: ArmazenamentoDaSessao
  #aoTerminar: (() => void) | null = null
  #saindo = false
  /** Cancela os pedidos em andamento (cancelar() troca por um novo). */
  #controle = new AbortController()
  readonly #tempos: Required<TemposDaNuvem>

  constructor(
    projeto: { url: string; chave: string },
    armazenamento: ArmazenamentoDaSessao,
    buscar: typeof fetch = fetch,
    tempos: TemposDaNuvem = {},
  ) {
    this.#armazenamento = armazenamento
    this.#tempos = { pedido: TEMPO_DO_PEDIDO, arquivo: TEMPO_DO_ARQUIVO, avisoDaSaida: TEMPO_PARA_AVISAR_A_SAIDA, ...tempos }
    // Todo pedido tem um tempo limite (uma rede parada não deixa "Sincronizando…" para sempre) e
    // pode ser cancelado. Os dois viram "sem conexão".
    const comLimites: typeof fetch = (url, init) => {
      const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
      const limite = levaArquivo(endereco, init?.method) ? this.#tempos.arquivo : this.#tempos.pedido
      const sinais = [this.#controle.signal, AbortSignal.timeout(limite), ...(init?.signal ? [init.signal] : [])]
      return buscar(url, { ...init, signal: AbortSignal.any(sinais) })
    }
    this.#cliente = createClient(projeto.url, projeto.chave, {
      auth: {
        storage: armazenamento,
        storageKey: CHAVE_DA_SESSAO,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: { fetch: comLimites },
    })
    this.#cliente.auth.onAuthStateChange(evento => {
      // A renovação foi recusada (sessão encerrada em outro lugar): o app mostra "entre de novo".
      if (evento === 'SIGNED_OUT' && !this.#saindo) this.#aoTerminar?.()
    })
  }

  /** Lê a conta direto da sessão guardada: funciona sem conexão. */
  async conta(): Promise<Conta | null> {
    return contaDe((await this.#sessaoGuardada())?.user)
  }

  /** A sessão como o supabase-js guarda (sem conexão, sem renovar). */
  async #sessaoGuardada() {
    try {
      const guardada = await this.#armazenamento.getItem(CHAVE_DA_SESSAO)
      return guardada
        ? (JSON.parse(guardada) as { access_token?: string; expires_at?: number; user?: { id: string; email?: string } })
        : null
    } catch {
      return null
    }
  }

  async entrar(email: string, senha: string): Promise<Conta> {
    const { data, error } = await this.#cliente.auth.signInWithPassword({ email, password: senha })
    if (error) throw new ErroDaConta(codigoDaConta(error))
    const conta = contaDe(data.user)
    if (!conta) throw new ErroDaConta('falhou')
    return conta
  }

  async criarConta(email: string, senha: string): Promise<Conta> {
    const { data, error } = await this.#cliente.auth.signUp({ email, password: senha })
    if (error) throw new ErroDaConta(codigoDaConta(error))
    // Com a confirmação por e-mail desligada, a conta nova já vem com sessão. Sem sessão, o e-mail já
    // tinha conta (o Supabase não conta isso a quem tenta, para não revelar quem tem conta).
    if (!data.session) throw new ErroDaConta('conta-existe')
    const conta = contaDe(data.user)
    if (!conta) throw new ErroDaConta('falhou')
    return conta
  }

  async sair() {
    this.#saindo = true
    try {
      // Só esta sessão: os outros aparelhos continuam dentro. A nuvem fica sabendo direto pelo token,
      // sem renovar a sessão nem deixar nada andando depois: com o token vencido (sem conexão, não
      // renova), ou sem resposta logo, a saída não espera.
      const sessao = await this.#sessaoGuardada()
      if (sessao?.access_token && (sessao.expires_at ?? 0) * 1000 > Date.now() + 10_000) {
        const avisar = this.#cliente.auth.admin
          .signOut(sessao.access_token, 'local')
          .then(({ error }) => error && console.warn('Não deu para avisar a nuvem da saída', error.message))
          .catch(erro => console.warn('Não deu para avisar a nuvem da saída', erro))
        const avisou = await Promise.race([avisar.then(() => true), espera(this.#tempos.avisoDaSaida).then(() => false)])
        if (!avisou) this.cancelar()
      }
    } finally {
      // A sessão daqui é esquecida mesmo sem resposta da nuvem: senão, o app entraria sozinho na conta
      // na próxima abertura.
      await this.#armazenamento.removeItem(CHAVE_DA_SESSAO)
      this.#saindo = false
    }
  }

  aoTerminarSessao(quando: () => void) {
    this.#aoTerminar = quando
  }

  cancelar() {
    this.#controle.abort()
    this.#controle = new AbortController()
  }

  /** A sessão vale? Renova se precisar. Sem conexão: SemConexao; recusada: SessaoTerminada. */
  async #garantirSessao() {
    const { data, error } = await this.#cliente.auth.getSession()
    if (error && isAuthRetryableFetchError(error)) throw new SemConexaoComANuvem(error.message)
    if (!data.session) throw new SessaoTerminada()
    return data.session.user.id
  }

  /**
   * Faz o pedido; se a sessão for recusada, renova uma vez e tenta de novo (com o relógio daqui
   * atrasado, o token vence lá antes de o app renovar). Recusada de novo, terminou mesmo.
   */
  async #comSessao<T>(pedido: (usuario: string) => Promise<T>): Promise<T> {
    try {
      return await pedido(await this.#garantirSessao())
    } catch (erro) {
      if (!(erro instanceof SessaoTerminada)) throw erro
      const { data, error } = await this.#cliente.auth.refreshSession()
      if (error && isAuthRetryableFetchError(error)) throw new SemConexaoComANuvem(error.message)
      if (!data.session) throw erro
      return pedido(data.session.user.id)
    }
  }

  #erroDoBanco(erro: PostgrestError, status: number): Error {
    if (erro.code === '42501' || erro.code === 'PGRST301' || status === 401) return new SessaoTerminada()
    // Sem rede, servidor fora, pedidos demais, função que ainda não existe (no meio de uma
    // atualização do banco): passa, e tenta de novo daqui a pouco.
    if (status === 0 || status === 429 || status >= 500 || erro.code === 'PGRST202') {
      return new SemConexaoComANuvem(`${status}: ${erro.message}`)
    }
    return new Error(`A nuvem recusou (${erro.code}): ${erro.message}`)
  }

  #rpc<T>(funcao: string, argumentos: Record<string, unknown>): Promise<T> {
    return this.#comSessao(async () => {
      const { data, error, status } = await this.#cliente.rpc(funcao, argumentos)
      if (error) throw this.#erroDoBanco(error, status)
      return data as T
    })
  }

  async guardar(livros: LivroParaGuardar[]) {
    if (!livros.length) return []
    return (await this.#rpc<Linha[]>('guardar_livros', { itens: livros.map(paraLinha) })).map(deLinha)
  }

  async remover(lapides: Lapide[]) {
    if (!lapides.length) return []
    const itens = lapides.map(l => ({ hash_sha256: l.hash, removido_em: l.removidoEm }))
    return (await this.#rpc<Linha[]>('remover_livros', { itens })).map(deLinha)
  }

  async mudancas(desde: string | null, depoisDe: string | null, limite: number) {
    return (await this.#rpc<Linha[]>('livros_desde', { desde, depois_de: depoisDe, limite })).map(deLinha)
  }

  async uso(): Promise<UsoDaNuvem> {
    const uso = await this.#rpc<Partial<UsoDaNuvem>>('uso_da_nuvem', {})
    return {
      livros: Number(uso.livros ?? 0),
      arquivos: Number(uso.arquivos ?? 0),
      bytes: Number(uso.bytes ?? 0),
      // Um banco sem o limite (antes da revisão) não limita.
      limite: uso.limite === undefined ? Number.POSITIVE_INFINITY : Number(uso.limite),
    }
  }

  /**
   * Erros do Storage: rede fora, sessão recusada, arquivo que não existe. O Storage responde 400 com o
   * código de verdade no corpo (statusCode); um 403 é sessão recusada só se for o token (a RLS
   * recusando um caminho também é 403, e não tem nada a ver com a sessão).
   */
  #erroDoArmazenamento(erro: { name?: string; message: string; status?: number; statusCode?: string }, caminho: string) {
    const codigo = Number(erro.statusCode ?? erro.status ?? 0)
    if (erro.name === 'StorageUnknownError' || !codigo) return new SemConexaoComANuvem(erro.message)
    if (codigo === 404 || /not.?found/i.test(erro.message)) return new NaoEstaNaNuvem(caminho)
    if (codigo === 401 || (codigo === 403 && /jwt|token|signature|expired/i.test(erro.message))) return new SessaoTerminada()
    if (codigo === 429 || codigo >= 500) return new SemConexaoComANuvem(`${codigo}: ${erro.message}`)
    return new Error(`A nuvem recusou o arquivo ${caminho} (${codigo}): ${erro.message}`)
  }

  enviar(bucket: Bucket, caminho: string, bytes: Uint8Array, tipo: string) {
    return this.#comSessao(async id => {
      const { error } = await this.#cliente.storage
        .from(bucket)
        .upload(`${id}/${caminho}`, bytes, { contentType: tipo, upsert: true, cacheControl: '31536000' })
      if (error) throw this.#erroDoArmazenamento(error, caminho)
    })
  }

  baixar(bucket: Bucket, caminho: string) {
    return this.#comSessao(async id => {
      const { data, error } = await this.#cliente.storage.from(bucket).download(`${id}/${caminho}`)
      if (error) throw this.#erroDoArmazenamento(error, caminho)
      return new Uint8Array(await data.arrayBuffer())
    })
  }

  listar(bucket: Bucket, pasta: string) {
    return this.#comSessao(async id => {
      const { data, error } = await this.#cliente.storage.from(bucket).list(`${id}/${pasta.replace(/\/$/, '')}`, { limit: 1000 })
      if (error) throw this.#erroDoArmazenamento(error, pasta)
      // Subpastas aparecem sem id; só os arquivos interessam.
      return data.filter(item => item.id).map(item => item.name)
    })
  }

  async apagar(bucket: Bucket, caminhos: string[]) {
    if (!caminhos.length) return
    await this.#comSessao(async id => {
      const { error } = await this.#cliente.storage.from(bucket).remove(caminhos.map(c => `${id}/${c}`))
      if (error) throw this.#erroDoArmazenamento(error, caminhos.join(', '))
    })
  }

  /** Para os testes: desliga a renovação automática (senão o processo não termina). */
  async parar() {
    await this.#cliente.auth.stopAutoRefresh()
  }
}
