// O banco local (SQLite embutido no Node/Electron). As tabelas seguem o formato que terão no
// Supabase na parte 2: ids UUID, datas ISO e atualizado_em em toda linha.

import { DatabaseSync } from 'node:sqlite'
import type { Edicao, Identificadores, Livro, Locator, Obra, Reconhecimento } from '@nucleo/tipos'

/** Um livro recém-importado: sem posição, sem progresso e ainda não procurado no catálogo. */
export type NovoLivro = Omit<
  Livro,
  'posicao' | 'progresso' | 'abertoEm' | 'atualizadoEm' | 'obraId' | 'edicaoId' | 'reconhecimento'
>

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
  // Etapa 3: o catálogo. Obras e edições com os ids do Open Library; o livro aponta para elas.
  `CREATE TABLE obras (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    autores TEXT NOT NULL,
    primeiro_ano INTEGER,
    edicoes INTEGER NOT NULL DEFAULT 0,
    capa_id INTEGER,
    assuntos TEXT NOT NULL,
    descricao TEXT,
    atualizado_em TEXT NOT NULL
  );
  CREATE TABLE edicoes (
    id TEXT PRIMARY KEY,
    obra_id TEXT NOT NULL,
    titulo TEXT NOT NULL,
    editoras TEXT NOT NULL,
    publicada_em TEXT,
    ano INTEGER,
    paginas INTEGER,
    idiomas TEXT NOT NULL,
    isbn TEXT NOT NULL,
    capa_id INTEGER,
    atualizado_em TEXT NOT NULL
  );
  ALTER TABLE livros ADD COLUMN obra_id TEXT;
  ALTER TABLE livros ADD COLUMN edicao_id TEXT;
  ALTER TABLE livros ADD COLUMN reconhecimento TEXT NOT NULL DEFAULT 'pendente';`,
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
  obraId: l.obra_id as string | null,
  edicaoId: l.edicao_id as string | null,
  reconhecimento: l.reconhecimento as Reconhecimento,
})

const paraObra = (l: Linha): Obra => ({
  id: l.id as string,
  titulo: l.titulo as string,
  autores: JSON.parse(l.autores as string) as string[],
  primeiroAno: l.primeiro_ano as number | null,
  edicoes: l.edicoes as number,
  capaId: l.capa_id as number | null,
  assuntos: JSON.parse(l.assuntos as string) as string[],
  descricao: l.descricao as string | null,
})

const paraEdicao = (l: Linha): Edicao => ({
  id: l.id as string,
  obraId: l.obra_id as string,
  titulo: l.titulo as string,
  editoras: JSON.parse(l.editoras as string) as string[],
  publicadaEm: l.publicada_em as string | null,
  ano: l.ano as number | null,
  paginas: l.paginas as number | null,
  idiomas: JSON.parse(l.idiomas as string) as string[],
  isbn: JSON.parse(l.isbn as string) as string[],
  capaId: l.capa_id as number | null,
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
      try {
        this.#db.exec(MIGRACOES[i])
        this.#db.exec(`PRAGMA user_version = ${i + 1}`)
        this.#db.exec('COMMIT')
      } catch (erro) {
        this.#db.exec('ROLLBACK')
        throw erro
      }
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

  atualizarLivro(id: string, campos: Partial<Pick<Livro, 'capa' | 'titulo' | 'autores'>>) {
    const colunas: string[] = []
    const valores: (string | null)[] = []
    if ('capa' in campos) {
      colunas.push('capa = ?')
      valores.push(campos.capa ?? null)
    }
    if (campos.titulo !== undefined) {
      colunas.push('titulo = ?')
      valores.push(campos.titulo)
    }
    if (campos.autores !== undefined) {
      colunas.push('autores = ?')
      valores.push(JSON.stringify(campos.autores))
    }
    if (!colunas.length) return
    this.#db
      .prepare(`UPDATE livros SET ${colunas.join(', ')}, atualizado_em = ? WHERE id = ?`)
      .run(...valores, new Date().toISOString(), id)
  }

  removerLivro(id: string) {
    this.#db.prepare('DELETE FROM livros WHERE id = ?').run(id)
  }

  /** Guarda (ou atualiza) uma obra. Uma descrição nula não apaga a que já estava guardada. */
  salvarObra(obra: Obra) {
    this.#db
      .prepare(
        `INSERT INTO obras (id, titulo, autores, primeiro_ano, edicoes, capa_id, assuntos, descricao, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET titulo = excluded.titulo, autores = excluded.autores,
           primeiro_ano = excluded.primeiro_ano, edicoes = excluded.edicoes, capa_id = excluded.capa_id,
           assuntos = excluded.assuntos, descricao = COALESCE(excluded.descricao, obras.descricao),
           atualizado_em = excluded.atualizado_em`,
      )
      .run(
        obra.id,
        obra.titulo,
        JSON.stringify(obra.autores),
        obra.primeiroAno,
        obra.edicoes,
        obra.capaId,
        JSON.stringify(obra.assuntos),
        obra.descricao,
        new Date().toISOString(),
      )
  }

  salvarEdicao(edicao: Edicao) {
    this.#db
      .prepare(
        `INSERT INTO edicoes (id, obra_id, titulo, editoras, publicada_em, ano, paginas, idiomas, isbn, capa_id, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET obra_id = excluded.obra_id, titulo = excluded.titulo,
           editoras = excluded.editoras, publicada_em = excluded.publicada_em, ano = excluded.ano,
           paginas = excluded.paginas, idiomas = excluded.idiomas, isbn = excluded.isbn,
           capa_id = excluded.capa_id, atualizado_em = excluded.atualizado_em`,
      )
      .run(
        edicao.id,
        edicao.obraId,
        edicao.titulo,
        JSON.stringify(edicao.editoras),
        edicao.publicadaEm,
        edicao.ano,
        edicao.paginas,
        JSON.stringify(edicao.idiomas),
        JSON.stringify(edicao.isbn),
        edicao.capaId,
        new Date().toISOString(),
      )
  }

  obterObra(id: string): Obra | null {
    const linha = this.#db.prepare('SELECT * FROM obras WHERE id = ?').get(id) as Linha | undefined
    return linha ? paraObra(linha) : null
  }

  obterEdicao(id: string): Edicao | null {
    const linha = this.#db.prepare('SELECT * FROM edicoes WHERE id = ?').get(id) as Linha | undefined
    return linha ? paraEdicao(linha) : null
  }

  ligarAoCatalogo(
    livroId: string,
    { obraId, edicaoId, reconhecimento }: { obraId: string | null; edicaoId: string | null; reconhecimento: Reconhecimento },
  ) {
    this.#db
      .prepare('UPDATE livros SET obra_id = ?, edicao_id = ?, reconhecimento = ?, atualizado_em = ? WHERE id = ?')
      .run(obraId, edicaoId, reconhecimento, new Date().toISOString(), livroId)
  }

  /** Os livros que ainda não foram procurados no catálogo (ou que estavam sem internet). */
  livrosPendentes(): string[] {
    const linhas = this.#db
      .prepare("SELECT id FROM livros WHERE reconhecimento = 'pendente' ORDER BY adicionado_em")
      .all() as { id: string }[]
    return linhas.map(l => l.id)
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
