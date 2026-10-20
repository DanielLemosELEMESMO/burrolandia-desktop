// O banco local (SQLite embutido no Node/Electron). As tabelas seguem o formato que terão no
// Supabase na parte 2: ids UUID, datas ISO e atualizado_em em toda linha.

import { DatabaseSync } from 'node:sqlite'
import type { Identificadores, Livro, Locator } from '@nucleo/tipos'

export type NovoLivro = Omit<Livro, 'posicao' | 'progresso' | 'abertoEm' | 'atualizadoEm'>

type Linha = Record<string, string | number | null>

const MIGRACOES = [
  `CREATE TABLE livros (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    autores TEXT NOT NULL,
    idioma TEXT,
    formato_original TEXT NOT NULL,
    arquivo_original TEXT NOT NULL,
    arquivo_leitura TEXT,
    capa TEXT,
    hash_sha256 TEXT NOT NULL UNIQUE,
    tamanho_bytes INTEGER NOT NULL,
    identificadores TEXT NOT NULL,
    estado TEXT NOT NULL,
    posicao TEXT,
    progresso REAL NOT NULL DEFAULT 0,
    adicionado_em TEXT NOT NULL,
    aberto_em TEXT,
    atualizado_em TEXT NOT NULL
  );
  CREATE TABLE preferencias (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );`,
]

const paraLivro = (l: Linha): Livro => ({
  id: l.id as string,
  titulo: l.titulo as string,
  autores: JSON.parse(l.autores as string) as string[],
  idioma: l.idioma as string | null,
  formatoOriginal: l.formato_original as Livro['formatoOriginal'],
  arquivoOriginal: l.arquivo_original as string,
  arquivoLeitura: l.arquivo_leitura as string | null,
  capa: l.capa as string | null,
  hashSha256: l.hash_sha256 as string,
  tamanhoBytes: l.tamanho_bytes as number,
  identificadores: JSON.parse(l.identificadores as string) as Identificadores,
  estado: l.estado as Livro['estado'],
  posicao: l.posicao ? (JSON.parse(l.posicao as string) as Locator) : null,
  progresso: l.progresso as number,
  adicionadoEm: l.adicionado_em as string,
  abertoEm: l.aberto_em as string | null,
  atualizadoEm: l.atualizado_em as string,
})

export class Banco {
  #db: DatabaseSync

  constructor(caminho: string) {
    this.#db = new DatabaseSync(caminho)
    this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
    this.#migrar()
  }

  #migrar() {
    const { user_version: versao } = this.#db.prepare('PRAGMA user_version').get() as { user_version: number }
    for (let i = versao; i < MIGRACOES.length; i++) {
      this.#db.exec('BEGIN')
      this.#db.exec(MIGRACOES[i])
      this.#db.exec(`PRAGMA user_version = ${i + 1}`)
      this.#db.exec('COMMIT')
    }
  }

  inserirLivro(novo: NovoLivro): Livro {
    this.#db
      .prepare(
        `INSERT INTO livros (id, titulo, autores, idioma, formato_original, arquivo_original, arquivo_leitura,
          capa, hash_sha256, tamanho_bytes, identificadores, estado, adicionado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        novo.id,
        novo.titulo,
        JSON.stringify(novo.autores),
        novo.idioma,
        novo.formatoOriginal,
        novo.arquivoOriginal,
        novo.arquivoLeitura,
        novo.capa,
        novo.hashSha256,
        novo.tamanhoBytes,
        JSON.stringify(novo.identificadores),
        novo.estado,
        novo.adicionadoEm,
        new Date().toISOString(),
      )
    return this.obterLivro(novo.id)!
  }

  obterLivro(id: string): Livro | null {
    const linha = this.#db.prepare('SELECT * FROM livros WHERE id = ?').get(id) as Linha | undefined
    return linha ? paraLivro(linha) : null
  }

  obterPorHash(hash: string): Livro | null {
    const linha = this.#db.prepare('SELECT * FROM livros WHERE hash_sha256 = ?').get(hash) as Linha | undefined
    return linha ? paraLivro(linha) : null
  }

  /** Os abertos mais recentemente primeiro; os nunca abertos depois, dos mais novos aos mais antigos. */
  listarLivros(): Livro[] {
    const linhas = this.#db
      .prepare('SELECT * FROM livros ORDER BY aberto_em IS NULL, aberto_em DESC, adicionado_em DESC')
      .all() as Linha[]
    return linhas.map(paraLivro)
  }

  marcarAberto(id: string, quando = new Date()) {
    this.#db
      .prepare('UPDATE livros SET aberto_em = ?, atualizado_em = ? WHERE id = ?')
      .run(quando.toISOString(), new Date().toISOString(), id)
  }

  salvarPosicao(id: string, posicao: Locator) {
    const progresso = Math.min(1, Math.max(0, posicao.locations.totalProgression ?? 0))
    this.#db
      .prepare('UPDATE livros SET posicao = ?, progresso = ?, atualizado_em = ? WHERE id = ?')
      .run(JSON.stringify(posicao), progresso, new Date().toISOString(), id)
  }

  removerLivro(id: string) {
    this.#db.prepare('DELETE FROM livros WHERE id = ?').run(id)
  }

  lerPreferencia<T>(chave: string): T | undefined {
    const linha = this.#db.prepare('SELECT valor FROM preferencias WHERE chave = ?').get(chave) as
      | { valor: string }
      | undefined
    return linha ? (JSON.parse(linha.valor) as T) : undefined
  }

  salvarPreferencia(chave: string, valor: unknown) {
    this.#db
      .prepare(
        `INSERT INTO preferencias (chave, valor, atualizado_em) VALUES (?, ?, ?)
         ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
      )
      .run(chave, JSON.stringify(valor), new Date().toISOString())
  }

  fechar() {
    if (this.#db.isOpen) this.#db.close()
  }
}
