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

export interface ArmazenamentoDaSessao {
  getItem(chave: string): string | null | Promise<string | null>
  setItem(chave: string, valor: string): void | Promise<void>
  removeItem(chave: string): void | Promise<void>
}

const CHAVE_DA_SESSAO = 'burrolandia-sessao'

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

  constructor(
    projeto: { url: string; chave: string },
    armazenamento: ArmazenamentoDaSessao,
    buscar: typeof fetch = fetch,
  ) {
    this.#armazenamento = armazenamento
    this.#cliente = createClient(projeto.url, projeto.chave, {
      auth: {
        storage: armazenamento,
        storageKey: CHAVE_DA_SESSAO,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: { fetch: buscar },
    })
    this.#cliente.auth.onAuthStateChange(evento => {
      // A renovação foi recusada (sessão encerrada em outro lugar): o app mostra "entre de novo".
      if (evento === 'SIGNED_OUT' && !this.#saindo) this.#aoTerminar?.()
    })
  }

  /** Lê a conta direto da sessão guardada: funciona sem conexão. */
  async conta(): Promise<Conta | null> {
    try {
      const guardada = await this.#armazenamento.getItem(CHAVE_DA_SESSAO)
      return guardada ? contaDe((JSON.parse(guardada) as { user?: { id: string; email?: string } }).user) : null
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
      // Só esta sessão: os outros aparelhos continuam dentro.
      const { error } = await this.#cliente.auth.signOut({ scope: 'local' })
      if (error) console.warn('Não deu para avisar a nuvem da saída; a sessão daqui foi esquecida', error.message)
    } finally {
      this.#saindo = false
    }
  }

  aoTerminarSessao(quando: () => void) {
    this.#aoTerminar = quando
  }

  /** A sessão vale? Renova se precisar. Sem conexão: SemConexao; recusada: SessaoTerminada. */
  async #garantirSessao() {
    const { data, error } = await this.#cliente.auth.getSession()
    if (error && isAuthRetryableFetchError(error)) throw new SemConexaoComANuvem(error.message)
    if (!data.session) throw new SessaoTerminada()
    return data.session.user.id
  }

  #erroDoBanco(erro: PostgrestError, status: number): Error {
    if (status === 0) return new SemConexaoComANuvem(erro.message)
    if (erro.code === '42501' || erro.code === 'PGRST301' || status === 401) return new SessaoTerminada()
    if (status >= 500) return new SemConexaoComANuvem(`${status}: ${erro.message}`)
    return new Error(`A nuvem recusou (${erro.code}): ${erro.message}`)
  }

  async #rpc<T>(funcao: string, argumentos: Record<string, unknown>): Promise<T> {
    await this.#garantirSessao()
    const { data, error, status } = await this.#cliente.rpc(funcao, argumentos)
    if (error) throw this.#erroDoBanco(error, status)
    return data as T
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
    const uso = await this.#rpc<UsoDaNuvem>('uso_da_nuvem', {})
    return { livros: Number(uso.livros), arquivos: Number(uso.arquivos), bytes: Number(uso.bytes) }
  }

  /** Erros do Storage: rede fora, sessão recusada, arquivo que não existe. */
  #erroDoArmazenamento(erro: { name?: string; message: string; status?: number; statusCode?: string }, caminho: string) {
    const status = Number(erro.status ?? erro.statusCode ?? 0)
    if (erro.name === 'StorageUnknownError' || !status) return new SemConexaoComANuvem(erro.message)
    if (status === 404 || erro.statusCode === '404' || /not.?found/i.test(erro.message)) return new NaoEstaNaNuvem(caminho)
    if (status === 401 || status === 403) return new SessaoTerminada()
    if (status >= 500) return new SemConexaoComANuvem(`${status}: ${erro.message}`)
    return new Error(`A nuvem recusou o arquivo ${caminho} (${status}): ${erro.message}`)
  }

  async enviar(bucket: Bucket, caminho: string, bytes: Uint8Array, tipo: string) {
    const id = await this.#garantirSessao()
    const { error } = await this.#cliente.storage
      .from(bucket)
      .upload(`${id}/${caminho}`, bytes, { contentType: tipo, upsert: true, cacheControl: '31536000' })
    if (error) throw this.#erroDoArmazenamento(error, caminho)
  }

  async baixar(bucket: Bucket, caminho: string) {
    const id = await this.#garantirSessao()
    const { data, error } = await this.#cliente.storage.from(bucket).download(`${id}/${caminho}`)
    if (error) throw this.#erroDoArmazenamento(error, caminho)
    return new Uint8Array(await data.arrayBuffer())
  }

  async listar(bucket: Bucket, pasta: string) {
    const id = await this.#garantirSessao()
    const { data, error } = await this.#cliente.storage.from(bucket).list(`${id}/${pasta.replace(/\/$/, '')}`, { limit: 1000 })
    if (error) throw this.#erroDoArmazenamento(error, pasta)
    // Subpastas aparecem sem id; só os arquivos interessam.
    return data.filter(item => item.id).map(item => item.name)
  }

  async apagar(bucket: Bucket, caminhos: string[]) {
    if (!caminhos.length) return
    const id = await this.#garantirSessao()
    const { error } = await this.#cliente.storage.from(bucket).remove(caminhos.map(c => `${id}/${c}`))
    if (error) throw this.#erroDoArmazenamento(error, caminhos.join(', '))
  }

  /** Para os testes: desliga a renovação automática (senão o processo não termina). */
  async parar() {
    await this.#cliente.auth.stopAutoRefresh()
  }
}
