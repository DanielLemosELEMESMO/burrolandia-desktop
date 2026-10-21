// O que a sincronização pede à nuvem. No app, o Supabase (src/main/nuvem/supabase.ts); nos testes,
// uma nuvem de mentira com as mesmas regras (regras.ts).

import type { CodigoDaConta, Conta, UsoDaNuvem } from '../tipos'
import type { Lapide, LivroNaNuvem, LivroParaGuardar } from './regras'

export type Bucket = 'capas' | 'arquivos'

/** A conta recusou: senha errada, e-mail já usado, senha fraca… */
export class ErroDaConta extends Error {
  constructor(readonly codigo: CodigoDaConta) {
    super(codigo)
    this.name = 'ErroDaConta'
  }
}

/** Sem conexão com a nuvem agora: tenta de novo depois. */
export class SemConexaoComANuvem extends Error {
  constructor(motivo?: string) {
    super(motivo ?? 'Sem conexão com a nuvem')
    this.name = 'SemConexaoComANuvem'
  }
}

/** A sessão acabou (saiu de todos os aparelhos, senha trocada…): é preciso entrar de novo. */
export class SessaoTerminada extends Error {
  constructor() {
    super('A sessão terminou')
    this.name = 'SessaoTerminada'
  }
}

/** O arquivo pedido não está na nuvem. */
export class NaoEstaNaNuvem extends Error {
  constructor(caminho: string) {
    super(`Não está na nuvem: ${caminho}`)
    this.name = 'NaoEstaNaNuvem'
  }
}

export interface Remoto {
  /** A conta da sessão guardada neste aparelho, ou null. Não precisa de conexão. */
  conta(): Promise<Conta | null>
  entrar(email: string, senha: string): Promise<Conta>
  criarConta(email: string, senha: string): Promise<Conta>
  /** Sai neste aparelho (a sessão daqui deixa de valer). Sem conexão, esquece a sessão mesmo assim. */
  sair(): Promise<void>
  /** Avisa quando a sessão termina sozinha (a renovação foi recusada). */
  aoTerminarSessao(quando: () => void): void
  /** Desiste dos pedidos em andamento (saindo da conta ou trocando de conta): eles falham sem conexão. */
  cancelar(): void

  /** Guarda os livros pelas regras de conflito; devolve como cada um ficou na nuvem. */
  guardar(livros: LivroParaGuardar[]): Promise<LivroNaNuvem[]>
  /** Põe as lápides; devolve como cada livro ficou. */
  remover(lapides: Lapide[]): Promise<LivroNaNuvem[]>
  /** O que mudou depois de (desde, depoisDe), em ordem. */
  mudancas(desde: string | null, depoisDe: string | null, limite: number): Promise<LivroNaNuvem[]>
  uso(): Promise<UsoDaNuvem>

  /** Caminhos dentro da pasta da conta: "<hash>/<capa>" em capas, "<hash>.<formato>" em arquivos. */
  enviar(bucket: Bucket, caminho: string, bytes: Uint8Array, tipo: string): Promise<void>
  /** NaoEstaNaNuvem se não houver. */
  baixar(bucket: Bucket, caminho: string): Promise<Uint8Array>
  /** Os nomes dos arquivos numa pasta. */
  listar(bucket: Bucket, pasta: string): Promise<string[]>
  apagar(bucket: Bucket, caminhos: string[]): Promise<void>
}
