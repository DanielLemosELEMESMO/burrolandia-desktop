// Uma nuvem de mentira, em memória, com as mesmas regras do banco do Supabase (regras.ts): contas,
// livros e arquivos. Cada aparelho conversa com ela por um Remoto próprio, com a sua sessão.
// Os testes também podem desligar a conexão e encerrar sessões.

import { randomUUID } from 'node:crypto'
import {
  guardarNaNuvem,
  mudancasDesde,
  removerNaNuvem,
  type Lapide,
  type LivroNaNuvem,
  type LivroParaGuardar,
} from '../../src/nucleo/nuvem/regras'
import {
  ErroDaConta,
  NaoEstaNaNuvem,
  SemConexaoComANuvem,
  SessaoTerminada,
  type Bucket,
  type Remoto,
} from '../../src/nucleo/nuvem/remoto'
import type { Conta, UsoDaNuvem } from '../../src/nucleo/tipos'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class NuvemEmMemoria {
  readonly contas = new Map<string, { conta: Conta; senha: string }>()
  readonly livros = new Map<string, LivroNaNuvem>()
  readonly arquivos = new Map<string, { bytes: Uint8Array; tipo: string }>()
  /** Sessões válidas: encerrar uma faz o aparelho dela ver SessaoTerminada. */
  readonly sessoes = new Set<string>()
  foraDoAr = false
  /** Pedidos feitos, para os testes conferirem ("guardar", "enviar capas/…"). */
  readonly pedidos: string[] = []
  #relogio = 0
  agora: () => Date = () => new Date()

  /** A hora do servidor: sempre crescente, no formato que os testes comparam como texto. */
  #carimbo() {
    const agora = Math.max(this.agora().getTime(), this.#relogio + 1)
    this.#relogio = agora
    return new Date(agora).toISOString()
  }

  remoto(): RemotoEmMemoria {
    return new RemotoEmMemoria(this)
  }

  /** Encerra todas as sessões de uma conta (como trocar a senha em outro lugar). */
  encerrarSessoes() {
    this.sessoes.clear()
  }

  livrosDe(contaId: string) {
    return [...this.livros.entries()].filter(([chave]) => chave.startsWith(`${contaId}/`)).map(([, l]) => l)
  }

  _verificar() {
    if (this.foraDoAr) throw new SemConexaoComANuvem()
  }

  _criarConta(email: string, senha: string): Conta {
    this._verificar()
    if (!EMAIL.test(email)) throw new ErroDaConta('email-invalido')
    if (senha.length < 8) throw new ErroDaConta('senha-fraca')
    if (this.contas.has(email.toLowerCase())) throw new ErroDaConta('conta-existe')
    const conta = { id: randomUUID(), email: email.toLowerCase() }
    this.contas.set(conta.email, { conta, senha })
    return conta
  }

  _entrar(email: string, senha: string): Conta {
    this._verificar()
    const registro = this.contas.get(email.toLowerCase())
    if (!registro || registro.senha !== senha) throw new ErroDaConta('senha-errada')
    return registro.conta
  }

  _guardar(contaId: string, itens: LivroParaGuardar[]) {
    this.pedidos.push('guardar')
    const agora = this.agora()
    for (const item of itens) {
      const chave = `${contaId}/${item.hash}`
      const depois = guardarNaNuvem(this.livros.get(chave), item, agora)
      if (depois) this.livros.set(chave, { ...depois, atualizadoEm: this.#carimbo() })
    }
    return itens.flatMap(i => this.livros.get(`${contaId}/${i.hash}`) ?? [])
  }

  _remover(contaId: string, lapides: Lapide[]) {
    this.pedidos.push('remover')
    const agora = this.agora()
    for (const lapide of lapides) {
      const chave = `${contaId}/${lapide.hash}`
      const depois = removerNaNuvem(this.livros.get(chave), lapide, agora)
      if (depois) this.livros.set(chave, { ...depois, atualizadoEm: this.#carimbo() })
    }
    return lapides.flatMap(l => this.livros.get(`${contaId}/${l.hash}`) ?? [])
  }

  _mudancas(contaId: string, desde: string | null, depoisDe: string | null, limite: number) {
    this.pedidos.push('mudancas')
    const daConta = [...this.livros.entries()].filter(([chave]) => chave.startsWith(`${contaId}/`)).map(([, l]) => l)
    return mudancasDesde(daConta, desde, depoisDe, limite)
  }
}

export class RemotoEmMemoria implements Remoto {
  #conta: Conta | null = null
  #sessao: string | null = null
  #aoTerminar: (() => void) | null = null

  constructor(private readonly nuvem: NuvemEmMemoria) {}

  /** O aparelho "lembra" a sessão de outro Remoto (como reabrir o app). */
  continuarDe(outro: RemotoEmMemoria) {
    this.#conta = outro.#conta
    this.#sessao = outro.#sessao
    return this
  }

  async conta() {
    return this.#conta
  }

  #comecar(conta: Conta) {
    this.#conta = conta
    this.#sessao = randomUUID()
    this.nuvem.sessoes.add(this.#sessao)
    return conta
  }

  async entrar(email: string, senha: string) {
    return this.#comecar(this.nuvem._entrar(email, senha))
  }

  async criarConta(email: string, senha: string) {
    return this.#comecar(this.nuvem._criarConta(email, senha))
  }

  async sair() {
    if (this.#sessao) this.nuvem.sessoes.delete(this.#sessao)
    this.#conta = null
    this.#sessao = null
  }

  aoTerminarSessao(quando: () => void) {
    this.#aoTerminar = quando
  }

  /** A conta da sessão, se ainda vale. */
  #daSessao(): string {
    this.nuvem._verificar()
    if (!this.#conta || !this.#sessao || !this.nuvem.sessoes.has(this.#sessao)) {
      const tinha = !!this.#conta
      this.#conta = null
      this.#sessao = null
      if (tinha) this.#aoTerminar?.()
      throw new SessaoTerminada()
    }
    return this.#conta.id
  }

  async guardar(livros: LivroParaGuardar[]) {
    return structuredClone(this.nuvem._guardar(this.#daSessao(), structuredClone(livros)))
  }

  async remover(lapides: Lapide[]) {
    return structuredClone(this.nuvem._remover(this.#daSessao(), lapides))
  }

  async mudancas(desde: string | null, depoisDe: string | null, limite: number) {
    return structuredClone(this.nuvem._mudancas(this.#daSessao(), desde, depoisDe, limite))
  }

  async uso(): Promise<UsoDaNuvem> {
    const id = this.#daSessao()
    const vivos = [...this.nuvem.livros.entries()].filter(([chave, l]) => chave.startsWith(`${id}/`) && !l.removidoEm)
    const bytes = [...this.nuvem.arquivos.entries()]
      .filter(([chave]) => chave.split('/')[1] === id)
      .reduce((soma, [, a]) => soma + a.bytes.length, 0)
    return { livros: vivos.length, arquivos: vivos.filter(([, l]) => l.arquivo).length, bytes }
  }

  async enviar(bucket: Bucket, caminho: string, bytes: Uint8Array, tipo: string) {
    const id = this.#daSessao()
    this.nuvem.pedidos.push(`enviar ${bucket}/${caminho}`)
    this.nuvem.arquivos.set(`${bucket}/${id}/${caminho}`, { bytes: new Uint8Array(bytes), tipo })
  }

  async baixar(bucket: Bucket, caminho: string) {
    const id = this.#daSessao()
    this.nuvem.pedidos.push(`baixar ${bucket}/${caminho}`)
    const arquivo = this.nuvem.arquivos.get(`${bucket}/${id}/${caminho}`)
    if (!arquivo) throw new NaoEstaNaNuvem(caminho)
    return new Uint8Array(arquivo.bytes)
  }

  async listar(bucket: Bucket, pasta: string) {
    const id = this.#daSessao()
    const prefixo = `${bucket}/${id}/${pasta.replace(/\/$/, '')}/`
    return [...this.nuvem.arquivos.keys()]
      .filter(chave => chave.startsWith(prefixo) && !chave.slice(prefixo.length).includes('/'))
      .map(chave => chave.slice(prefixo.length))
  }

  async apagar(bucket: Bucket, caminhos: string[]) {
    const id = this.#daSessao()
    this.nuvem.pedidos.push(`apagar ${bucket}/${caminhos.join(',')}`)
    for (const caminho of caminhos) this.nuvem.arquivos.delete(`${bucket}/${id}/${caminho}`)
  }
}
