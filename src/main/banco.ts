// O banco local (SQLite embutido no Node/Electron). As tabelas seguem o formato que terão no
// Supabase na parte 2: ids UUID, datas ISO e atualizado_em em toda linha. Cada mudança que precisa
// subir para a nuvem soma 1 à versão do livro; a sincronização manda os que estão à frente da
// versão enviada. Remover um livro que já estava na nuvem deixa uma lápide para mandar.

import { DatabaseSync } from 'node:sqlite'
import type { Decisao } from '@nucleo/nuvem/aparelho'
import { HORA_FRACA, horaDoReconhecimento, type Lapide, type LivroNaNuvem } from '@nucleo/nuvem/regras'
import type { Edicao, Identificadores, Livro, Locator, Obra, Reconhecimento } from '@nucleo/tipos'

/** Um livro recém-importado: sem posição, sem progresso e ainda não procurado no catálogo. */
export type NovoLivro = Omit<
  Livro,
  'posicao' | 'progresso' | 'abertoEm' | 'atualizadoEm' | 'obraId' | 'edicaoId' | 'reconhecimento'
>

/** O livro com o que a sincronização precisa saber dele. */
export interface LivroSincronizavel extends Livro {
  /** Quando título, autores, obra ou edição mudaram por último. */
  metadadosEm: string
  capaEm: string | null
  posicaoEm: string | null
  versao: number
  /** 0: nunca foi enviado para a conta. */
  versaoEnviada: number
  /** O nome da capa daqui que já está na nuvem. */
  capaNaNuvem: string | null
  /** O nome do arquivo na nuvem, quando já está lá. */
  arquivoNaNuvem: string | null
}

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
  // Parte 2: a nuvem. A hora de cada tipo de mudança (para os conflitos), a versão de cada livro
  // (para saber o que subir), o que já está na nuvem e as lápides dos removidos.
  `ALTER TABLE livros ADD COLUMN metadados_em TEXT NOT NULL DEFAULT '';
  ALTER TABLE livros ADD COLUMN capa_em TEXT;
  ALTER TABLE livros ADD COLUMN posicao_em TEXT;
  ALTER TABLE livros ADD COLUMN versao INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE livros ADD COLUMN versao_enviada INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE livros ADD COLUMN capa_na_nuvem TEXT;
  ALTER TABLE livros ADD COLUMN arquivo_na_nuvem TEXT;
  UPDATE livros SET metadados_em = atualizado_em,
    capa_em = CASE WHEN capa IS NOT NULL THEN atualizado_em END,
    posicao_em = CASE WHEN posicao IS NOT NULL THEN atualizado_em END;
  CREATE TABLE lapides (
    hash_sha256 TEXT PRIMARY KEY,
    removido_em TEXT NOT NULL
  );`,
  // Revisão da parte 2: o livro que veio da nuvem sai ao sair da conta (baixado ou não); o que é
  // automático (o que veio no arquivo, o reconhecimento sozinho, a capa gerada) ganha a hora fraca,
  // para não passar por cima de uma escolha sua feita em outro aparelho. Nos livros que já subiram,
  // nada muda. Num PDF, toda capa pode ter sido gerada: fica fraca também.
  `ALTER TABLE livros ADD COLUMN veio_da_nuvem INTEGER NOT NULL DEFAULT 0;
  UPDATE livros SET veio_da_nuvem = 1 WHERE estado = 'na-nuvem';
  UPDATE livros SET metadados_em = CASE reconhecimento ${(['pendente', 'sem-resultado', 'titulo', 'isbn'] as const)
    .map(r => `WHEN '${r}' THEN '${horaDoReconhecimento(r)}'`)
    .join(' ')} END
    WHERE versao_enviada = 0 AND reconhecimento NOT IN ('escolhido', 'recusado');
  UPDATE livros SET capa_em = '${HORA_FRACA}'
    WHERE versao_enviada = 0 AND capa IS NOT NULL AND (formato_original = 'pdf' OR capa NOT LIKE 'capa-%');`,
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

const paraSincronizavel = (l: Linha): LivroSincronizavel => ({
  ...paraLivro(l),
  metadadosEm: l.metadados_em as string,
  capaEm: l.capa_em as string | null,
  posicaoEm: l.posicao_em as string | null,
  versao: l.versao as number,
  versaoEnviada: l.versao_enviada as number,
  capaNaNuvem: l.capa_na_nuvem as string | null,
  arquivoNaNuvem: l.arquivo_na_nuvem as string | null,
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
  #aoMudar: () => void = () => {}

  constructor(caminho: string) {
    this.#db = new DatabaseSync(caminho)
    this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
    this.#migrar()
  }

  /** Avisa a cada mudança que precisa subir para a nuvem (a sincronização agenda o envio). */
  quandoMudar(quando: () => void) {
    this.#aoMudar = quando
  }

  #emTransacao<T>(acao: () => T): T {
    this.#db.exec('BEGIN')
    try {
      const resultado = acao()
      this.#db.exec('COMMIT')
      return resultado
    } catch (erro) {
      this.#db.exec('ROLLBACK')
      throw erro
    }
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
    const agora = new Date().toISOString()
    this.#db
      .prepare(
        `INSERT INTO livros (id, titulo, autores, idioma, formato_original, arquivo_original, arquivo_leitura,
          capa, hash_sha256, tamanho_bytes, identificadores, estado, adicionado_em, atualizado_em, metadados_em, capa_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        agora,
        // O título e a capa que vieram no arquivo perdem para qualquer escolha sua.
        HORA_FRACA,
        novo.capa ? HORA_FRACA : null,
      )
    this.#aoMudar()
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
      .prepare('UPDATE livros SET aberto_em = ?, atualizado_em = ?, versao = versao + 1 WHERE id = ?')
      .run(quando.toISOString(), new Date().toISOString(), id)
    this.#aoMudar()
  }

  /** A posição nova, com a hora de agora. A mesma posição de novo não muda nada (nem a hora). */
  salvarPosicao(id: string, posicao: Locator) {
    const json = JSON.stringify(posicao)
    const progresso = Math.min(1, Math.max(0, posicao.locations.totalProgression ?? 0))
    const agora = new Date().toISOString()
    const { changes } = this.#db
      .prepare(
        `UPDATE livros SET posicao = ?, progresso = ?, posicao_em = ?, atualizado_em = ?, versao = versao + 1
         WHERE id = ? AND posicao IS NOT ?`,
      )
      .run(json, progresso, agora, agora, id, json)
    if (Number(changes) > 0) this.#aoMudar()
  }

  /** Muda o livro aqui. hora: a da mudança (HORA_FRACA para o que o app faz sozinho; senão, agora). */
  atualizarLivro(id: string, campos: Partial<Pick<Livro, 'capa' | 'titulo' | 'autores'>>, { hora }: { hora?: string } = {}) {
    const agora = new Date().toISOString()
    const daMudanca = hora ?? agora
    const colunas: string[] = []
    const valores: (string | null)[] = []
    if ('capa' in campos) {
      colunas.push('capa = ?', 'capa_em = ?')
      valores.push(campos.capa ?? null, daMudanca)
    }
    if (campos.titulo !== undefined) {
      colunas.push('titulo = ?')
      valores.push(campos.titulo)
    }
    if (campos.autores !== undefined) {
      colunas.push('autores = ?')
      valores.push(JSON.stringify(campos.autores))
    }
    if (campos.titulo !== undefined || campos.autores !== undefined) {
      colunas.push('metadados_em = ?')
      valores.push(daMudanca)
    }
    if (!colunas.length) return
    this.#db
      .prepare(`UPDATE livros SET ${colunas.join(', ')}, atualizado_em = ?, versao = versao + 1 WHERE id = ?`)
      .run(...valores, agora, id)
    this.#aoMudar()
  }

  /**
   * Remove o livro. Se ele já estava na nuvem, deixa a lápide para os outros aparelhos removerem
   * também (daNuvem: a remoção veio de lá, não há o que avisar).
   */
  removerLivro(id: string, { daNuvem = false } = {}) {
    const lapide = this.#emTransacao(() => {
      const livro = this.#db.prepare('SELECT hash_sha256, versao_enviada FROM livros WHERE id = ?').get(id) as
        | { hash_sha256: string; versao_enviada: number }
        | undefined
      this.#db.prepare('DELETE FROM livros WHERE id = ?').run(id)
      if (!livro || daNuvem || livro.versao_enviada === 0) return false
      this.#db
        .prepare('INSERT OR REPLACE INTO lapides (hash_sha256, removido_em) VALUES (?, ?)')
        .run(livro.hash_sha256, new Date().toISOString())
      return true
    })
    if (lapide) this.#aoMudar()
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
    const agora = new Date()
    this.#db
      .prepare(
        `UPDATE livros SET obra_id = ?, edicao_id = ?, reconhecimento = ?, metadados_em = ?, atualizado_em = ?,
          versao = versao + 1 WHERE id = ?`,
      )
      .run(obraId, edicaoId, reconhecimento, horaDoReconhecimento(reconhecimento, agora), agora.toISOString(), livroId)
    this.#aoMudar()
  }

  /** Os livros que ainda não foram procurados no catálogo (ou que estavam sem internet). */
  livrosPendentes(): string[] {
    const linhas = this.#db
      .prepare("SELECT id FROM livros WHERE reconhecimento = 'pendente' ORDER BY adicionado_em DESC")
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

  apagarPreferencia(chave: string) {
    this.#db.prepare('DELETE FROM preferencias WHERE chave = ?').run(chave)
  }

  // A nuvem (parte 2). O que vem de lá não soma versão: não precisa voltar para lá.

  paraSincronia(id: string): LivroSincronizavel | null {
    const linha = this.#db.prepare('SELECT * FROM livros WHERE id = ?').get(id) as Linha | undefined
    return linha ? paraSincronizavel(linha) : null
  }

  porHashParaSincronia(hash: string): LivroSincronizavel | null {
    const linha = this.#db.prepare('SELECT * FROM livros WHERE hash_sha256 = ?').get(hash) as Linha | undefined
    return linha ? paraSincronizavel(linha) : null
  }

  /**
   * Os livros com mudanças que ainda não subiram, dos mais antigos aos mais novos. Os recusados
   * (id → versão que a nuvem recusou) ficam de fora até mudarem de novo.
   */
  pendentesDeEnvio(limite: number, recusados: ReadonlyMap<string, number> = new Map()): LivroSincronizavel[] {
    const linhas = this.#db
      .prepare(
        `SELECT * FROM livros WHERE versao > versao_enviada
           AND NOT EXISTS (SELECT 1 FROM json_each(?) AS r WHERE r.value ->> '$[0]' = livros.id AND r.value ->> '$[1]' = livros.versao)
         ORDER BY atualizado_em LIMIT ?`,
      )
      .all(JSON.stringify([...recusados]), limite) as Linha[]
    return linhas.map(paraSincronizavel)
  }

  /** A nuvem recebeu o livro como estava na versão lida (se mudou de novo depois, continua pendente). */
  marcarEnviado(id: string, versao: number) {
    this.#db.prepare('UPDATE livros SET versao_enviada = MAX(versao_enviada, ?) WHERE id = ?').run(versao, id)
  }

  contarPendentes(): number {
    const { livros } = this.#db.prepare('SELECT COUNT(*) AS livros FROM livros WHERE versao > versao_enviada').get() as {
      livros: number
    }
    const { lapides } = this.#db.prepare('SELECT COUNT(*) AS lapides FROM lapides').get() as { lapides: number }
    return livros + lapides
  }

  lapides(): Lapide[] {
    const linhas = this.#db.prepare('SELECT hash_sha256, removido_em FROM lapides ORDER BY removido_em').all() as {
      hash_sha256: string
      removido_em: string
    }[]
    return linhas.map(l => ({ hash: l.hash_sha256, removidoEm: l.removido_em }))
  }

  temLapide(hash: string): boolean {
    return !!this.#db.prepare('SELECT 1 FROM lapides WHERE hash_sha256 = ?').get(hash)
  }

  esquecerLapides(hashes: string[]) {
    const apagar = this.#db.prepare('DELETE FROM lapides WHERE hash_sha256 = ?')
    this.#emTransacao(() => hashes.forEach(hash => apagar.run(hash)))
  }

  /** Um livro de outro aparelho: entra com o arquivo ainda na nuvem (estado "na-nuvem"). */
  inserirDaNuvem(id: string, l: LivroNaNuvem): Livro {
    this.#db
      .prepare(
        `INSERT INTO livros (id, titulo, autores, idioma, formato_original, arquivo_original, arquivo_leitura, capa,
          hash_sha256, tamanho_bytes, identificadores, estado, posicao, progresso, adicionado_em, aberto_em,
          atualizado_em, obra_id, edicao_id, reconhecimento, metadados_em, capa_em, posicao_em, versao,
          versao_enviada, capa_na_nuvem, arquivo_na_nuvem, veio_da_nuvem)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'na-nuvem', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 1, NULL, ?, 1)`,
      )
      .run(
        id,
        l.titulo,
        JSON.stringify(l.autores),
        l.idioma,
        l.formato,
        `original.${l.formato}`,
        l.hash,
        l.tamanhoBytes,
        JSON.stringify(l.identificadores),
        l.posicao ? JSON.stringify(l.posicao) : null,
        l.progresso,
        l.adicionadoEm,
        l.abertoEm,
        new Date().toISOString(),
        l.obraId,
        l.edicaoId,
        l.reconhecimento,
        l.metadadosEm,
        l.posicaoEm,
        l.arquivo,
      )
    return this.obterLivro(id)!
  }

  /** Aplica o que a nuvem tem de mais novo. Devolve se algo mudou. */
  aplicarDaNuvem(id: string, l: LivroNaNuvem, decisao: Extract<Decisao, { tipo: 'atualizar' }>): boolean {
    const colunas: string[] = []
    const valores: (string | number | null)[] = []
    const mudar = (campos: Record<string, string | number | null>) => {
      for (const [coluna, valor] of Object.entries(campos)) {
        colunas.push(`${coluna} = ?`)
        valores.push(valor)
      }
    }
    if (decisao.metadados) {
      mudar({
        titulo: l.titulo,
        autores: JSON.stringify(l.autores),
        idioma: l.idioma,
        identificadores: JSON.stringify(l.identificadores),
        obra_id: l.obraId,
        edicao_id: l.edicaoId,
        reconhecimento: l.reconhecimento,
        metadados_em: l.metadadosEm,
      })
    }
    if (decisao.posicao) mudar({ posicao: JSON.stringify(l.posicao), progresso: l.progresso, posicao_em: l.posicaoEm })
    if (decisao.aberto) mudar({ aberto_em: l.abertoEm })
    if (decisao.capa === 'marcar') mudar({ capa_na_nuvem: l.capa, capa_em: l.capaEm })
    if (decisao.arquivo) mudar({ arquivo_na_nuvem: l.arquivo })
    if (!colunas.length) return false
    const { changes } = this.#db
      .prepare(`UPDATE livros SET ${colunas.join(', ')}, atualizado_em = ? WHERE id = ?`)
      .run(...valores, new Date().toISOString(), id)
    return Number(changes) > 0
  }

  /**
   * A capa que veio da nuvem já está na pasta do livro. Só entra se ainda for mais nova que a daqui
   * (uma capa escolhida aqui durante o download vale). Devolve se entrou.
   */
  guardarCapaDaNuvem(id: string, nome: string, capaEm: string | null): boolean {
    const { changes } = this.#db
      .prepare(
        `UPDATE livros SET capa = ?, capa_em = ?, capa_na_nuvem = ?, atualizado_em = ?
         WHERE id = ? AND (capa_em IS NULL OR (? IS NOT NULL AND capa_em < ?))`,
      )
      .run(nome, capaEm, nome, new Date().toISOString(), id, capaEm, capaEm)
    return Number(changes) > 0
  }

  /**
   * A capa daqui subiu com este nome (o arquivo local também passou a ter este nome). Só se a capa
   * ainda for a que subiu: trocada no meio do envio, a nova fica. Devolve se marcou.
   */
  marcarCapaNaNuvem(id: string, capaQueSubiu: string, nome: string): boolean {
    const { changes } = this.#db
      .prepare('UPDATE livros SET capa = ?, capa_na_nuvem = ? WHERE id = ? AND capa = ?')
      .run(nome, nome, id, capaQueSubiu)
    return Number(changes) > 0
  }

  /** O arquivo subiu: a nuvem precisa saber (o livro volta para a fila de envio). */
  marcarArquivoNaNuvem(id: string, nome: string) {
    this.#db.prepare('UPDATE livros SET arquivo_na_nuvem = ?, versao = versao + 1 WHERE id = ?').run(nome, id)
  }

  /** Os livros deste aparelho cujo arquivo ainda não subiu (até o limite de tamanho). */
  semArquivoNaNuvem(limiteDeBytes: number): LivroSincronizavel[] {
    const linhas = this.#db
      .prepare(
        `SELECT * FROM livros WHERE estado = 'pronto' AND arquivo_na_nuvem IS NULL AND tamanho_bytes <= ?
         ORDER BY aberto_em IS NULL, aberto_em DESC, adicionado_em DESC`,
      )
      .all(limiteDeBytes) as Linha[]
    return linhas.map(paraSincronizavel)
  }

  contarGrandesDemais(limiteDeBytes: number): number {
    const { total } = this.#db
      .prepare("SELECT COUNT(*) AS total FROM livros WHERE estado != 'na-nuvem' AND tamanho_bytes > ?")
      .get(limiteDeBytes) as { total: number }
    return total
  }

  /** O arquivo de um livro da nuvem chegou e foi preparado: o livro fica pronto neste aparelho. */
  completarDaNuvem(id: string, { arquivoOriginal, arquivoLeitura }: { arquivoOriginal: string; arquivoLeitura: string | null }) {
    this.#db
      .prepare("UPDATE livros SET estado = 'pronto', arquivo_original = ?, arquivo_leitura = ?, atualizado_em = ? WHERE id = ?")
      .run(arquivoOriginal, arquivoLeitura, new Date().toISOString(), id)
  }

  /**
   * Saiu da conta: os livros que vieram da nuvem saem, baixados ou não (devolve os ids, para apagar
   * as pastas), e os adicionados aqui voltam a ser "nunca enviados" (entrando de novo, sobem para a
   * conta que entrar).
   */
  esquecerNuvem(): string[] {
    return this.#emTransacao(() => {
      const ids = (this.#db.prepare('SELECT id FROM livros WHERE veio_da_nuvem = 1').all() as { id: string }[]).map(l => l.id)
      this.#db.prepare('DELETE FROM livros WHERE veio_da_nuvem = 1').run()
      this.#db.prepare('UPDATE livros SET versao_enviada = 0, capa_na_nuvem = NULL, arquivo_na_nuvem = NULL').run()
      this.#db.prepare('DELETE FROM lapides').run()
      return ids
    })
  }

  fechar() {
    if (this.#db.isOpen) this.#db.close()
  }
}
