// O catálogo: reconhece a obra e a edição de cada livro no Open Library e guarda no banco.
// Primeiro pelo ISBN (acha a edição exata); senão, pelo título e pelo autor (acha a obra, e a
// edição fica para você escolher). Do computador só saem título, autor e ISBN; o arquivo, nunca.
// Sem internet, o livro continua "pendente" e é procurado de novo na próxima abertura do app.

import { ClienteOpenLibrary, SemConexao } from '@nucleo/catalogo/cliente'
import { consultasDeTexto, escolherObra, isbnConfere, ordenarEdicoes } from '@nucleo/catalogo/correspondencia'
import { paraIsbn13 } from '@nucleo/catalogo/isbn'
import type { CapaDaObra, CapaDoCatalogo, Edicao, ObraEncontrada, Reconhecimento, SobreLivro } from '@nucleo/tipos'
import type { Banco } from './banco'
import { nomeDaCapa, type Biblioteca } from './biblioteca'

const MAXIMO_NA_MEMORIA = 500
const MAXIMO_DE_CAPAS_NA_MEMORIA = 30
const MAXIMO_DE_MINIATURAS_NA_MEMORIA = 60
/** Quantas capas oferecer para escolher. */
const MAXIMO_DE_CAPAS_DA_OBRA = 24

/** Guarda no mapa, esquecendo o mais antigo quando passa do máximo. */
function guardar<V>(mapa: Map<string | number, V>, chave: string | number, valor: V, maximo: number) {
  mapa.delete(chave)
  mapa.set(chave, valor)
  if (mapa.size > maximo) mapa.delete(mapa.keys().next().value!)
}

export class Catalogo {
  /** As últimas obras achadas e edições listadas, para escolher sem perguntar de novo ao catálogo. */
  readonly #obrasVistas = new Map<string | number, ObraEncontrada>()
  readonly #edicoesVistas = new Map<string | number, Edicao>()
  readonly #emAndamento = new Map<string, Promise<SobreLivro | null>>()
  readonly #capas = new Map<string | number, Uint8Array>()
  readonly #miniaturas = new Map<string | number, Uint8Array>()

  constructor(
    private readonly banco: Banco,
    private readonly biblioteca: Biblioteca,
    /** null quando o app está sem internet de propósito (nos testes, por exemplo). */
    private readonly cliente: ClienteOpenLibrary | null,
    private readonly aoMudar: (livroId: string) => void = () => {},
  ) {}

  sobre(livroId: string): SobreLivro | null {
    const livro = this.banco.obterLivro(livroId)
    if (!livro) return null
    return {
      livro,
      obra: livro.obraId ? this.banco.obterObra(livro.obraId) : null,
      edicao: livro.edicaoId ? this.banco.obterEdicao(livro.edicaoId) : null,
    }
  }

  /**
   * Busca a descrição da obra se ela ainda não veio (o painel mostra o que já tem enquanto isso).
   * Avisa quem estiver olhando quando chegar.
   */
  async completarDescricao(livroId: string) {
    const obra = this.sobre(livroId)?.obra
    if (!obra || obra.descricao !== null || !this.cliente) return
    const detalhes = await this.cliente.detalhesDaObra(obra.id).catch(() => null)
    if (!detalhes) return
    this.banco.salvarObra({ ...obra, ...detalhes, assuntos: detalhes.assuntos.length ? detalhes.assuntos : obra.assuntos })
    this.aoMudar(livroId)
  }

  /**
   * Procura a obra do livro no catálogo. Só procura livros pendentes: o que a pessoa escolheu ou
   * recusou fica como está. Sem conexão, devolve o livro ainda pendente. Dois pedidos para o mesmo
   * livro viram um só.
   */
  reconhecer(livroId: string): Promise<SobreLivro | null> {
    const andamento = this.#emAndamento.get(livroId)
    if (andamento) return andamento
    const tarefa = this.#reconhecer(livroId)
      .catch(erro => {
        if (erro instanceof SemConexao) return this.sobre(livroId)
        throw erro
      })
      .finally(() => this.#emAndamento.delete(livroId))
    this.#emAndamento.set(livroId, tarefa)
    return tarefa
  }

  /**
   * Procura os livros pendentes, um por um, dos mais novos aos mais velhos (pelo mesmo caminho dos
   * pedidos da interface, para não procurar o mesmo livro duas vezes). Se um continua pendente, está
   * sem conexão: para e tenta na próxima abertura do app.
   */
  async reconhecerPendentes() {
    for (const id of this.banco.livrosPendentes()) {
      const depois = await this.reconhecer(id).catch(erro => {
        console.warn('Não deu para reconhecer o livro no catálogo', erro)
        return null
      })
      if (depois?.livro.reconhecimento === 'pendente') return
    }
  }

  async #reconhecer(livroId: string): Promise<SobreLivro | null> {
    const livro = this.banco.obterLivro(livroId)
    if (!livro || !this.cliente || livro.reconhecimento !== 'pendente') return this.sobre(livroId)
    const alvo = { titulo: livro.titulo, autores: livro.autores }

    for (const isbn of livro.identificadores.isbn.flatMap(i => paraIsbn13(i) ?? [])) {
      const achada = await this.cliente.porIsbn(isbn)
      // Um PDF também traz os ISBNs dos livros que cita: só vale se o título ou o autor conferem.
      if (achada?.edicao && isbnConfere(alvo, achada)) return this.#ligar(livro.id, achada, 'isbn')
    }

    // Sem autor que valha, nenhuma busca: o título sozinho não basta (e pode ser o nome do arquivo).
    for (const consulta of consultasDeTexto(alvo)) {
      const achada = escolherObra(alvo, await this.cliente.porTexto(consulta))
      // Achada pelo título, a edição que bateu na busca não é necessariamente a sua.
      if (achada) return this.#ligar(livro.id, { obra: achada.obra, edicao: null }, 'titulo')
    }

    this.banco.ligarAoCatalogo(livro.id, { obraId: null, edicaoId: null, reconhecimento: 'sem-resultado' })
    this.aoMudar(livro.id)
    return this.sobre(livro.id)
  }

  async #ligar(livroId: string, { obra, edicao }: ObraEncontrada, reconhecimento: Reconhecimento) {
    const detalhes = obra.descricao === null ? await this.cliente?.detalhesDaObra(obra.id).catch(() => null) : null
    this.banco.salvarObra({
      ...obra,
      descricao: detalhes?.descricao ?? obra.descricao,
      assuntos: detalhes?.assuntos.length ? detalhes.assuntos : obra.assuntos,
    })
    if (edicao) this.banco.salvarEdicao(edicao)
    this.banco.ligarAoCatalogo(livroId, { obraId: obra.id, edicaoId: edicao?.id ?? null, reconhecimento })
    await this.#baixarCapa(livroId, edicao?.capaId ?? obra.capaId, { soSemCapa: true })
    this.aoMudar(livroId)
    return this.sobre(livroId)
  }

  /** A imagem da capa no catálogo, baixada uma vez por sessão. O que não é imagem fica de fora. */
  async #imagemDaCapa(capaId: number | null): Promise<Uint8Array | null> {
    if (!capaId || !this.cliente) return null
    const guardada = this.#capas.get(capaId)
    if (guardada) return guardada
    const imagem = await this.cliente.capa(capaId).catch(() => null)
    if (!imagem || !nomeDaCapa(imagem)) return null
    guardar(this.#capas, capaId, imagem, MAXIMO_DE_CAPAS_NA_MEMORIA)
    return imagem
  }

  /** soSemCapa: a capa do catálogo só entra se o livro ainda não tiver uma (conferido até o fim). */
  async #baixarCapa(livroId: string, capaId: number | null, { soSemCapa = false } = {}) {
    const temCapa = () => soSemCapa && Boolean(this.banco.obterLivro(livroId)?.capa)
    if (temCapa()) return
    const imagem = await this.#imagemDaCapa(capaId)
    if (imagem && !temCapa()) await this.biblioteca.salvarCapa(livroId, imagem)
  }

  #capaId(livroId: string) {
    const sobre = this.sobre(livroId)
    return sobre?.edicao?.capaId ?? sobre?.obra?.capaId ?? null
  }

  /** A capa do catálogo (a da sua edição, ou a da obra), para ver antes de usar; e se já é a do livro. */
  async capaDoCatalogo(livroId: string): Promise<CapaDoCatalogo | null> {
    const imagem = await this.#imagemDaCapa(this.#capaId(livroId))
    if (!imagem) return null
    return { imagem, emUso: this.banco.obterLivro(livroId)?.capa === nomeDaCapa(imagem) }
  }

  /** As capas que o catálogo tem para a obra do livro: a da obra e as das edições, sem repetir. null: sem conexão. */
  async capasDaObra(livroId: string): Promise<CapaDaObra[] | null> {
    const obra = this.sobre(livroId)?.obra
    if (!obra) return []
    const edicoes = await this.edicoes(livroId)
    if (edicoes === null) return null
    const capas: CapaDaObra[] = []
    const juntar = (capaId: number | null, legenda: string) => {
      if (capaId && !capas.some(c => c.capaId === capaId)) capas.push({ capaId, legenda })
    }
    juntar(obra.capaId, 'A obra')
    for (const e of edicoes) {
      juntar(e.capaId, [e.editoras.join(', ') || 'Editora não informada', e.ano ?? e.publicadaEm].filter(Boolean).join(' · '))
    }
    return capas.slice(0, MAXIMO_DE_CAPAS_DA_OBRA)
  }

  /** A miniatura de uma capa do catálogo (tamanho médio), baixada uma vez por sessão. */
  async miniaturaDaCapa(capaId: number): Promise<Uint8Array | null> {
    if (!this.cliente) return null
    const guardada = this.#miniaturas.get(capaId)
    if (guardada) return guardada
    const imagem = await this.cliente.miniatura(capaId).catch(() => null)
    if (!imagem || !nomeDaCapa(imagem)) return null
    guardar(this.#miniaturas, capaId, imagem, MAXIMO_DE_MINIATURAS_NA_MEMORIA)
    return imagem
  }

  /** Busca livre, para quando a obra não foi reconhecida (ou não é a certa). null: sem conexão. */
  async buscarObras(texto: string): Promise<ObraEncontrada[] | null> {
    if (!this.cliente) return null
    try {
      const achadas = await this.cliente.porTexto(texto)
      for (const achada of achadas) guardar(this.#obrasVistas, achada.obra.id, achada, MAXIMO_NA_MEMORIA)
      return achadas
    } catch (erro) {
      if (erro instanceof SemConexao) return null
      throw erro
    }
  }

  async escolherObra(livroId: string, obraId: string): Promise<SobreLivro | null> {
    if (!this.banco.obterLivro(livroId)) return null
    const achada = this.#obrasVistas.get(obraId) ?? (await this.cliente?.obra(obraId).catch(() => null))
    if (!achada) return this.sobre(livroId)
    return this.#ligar(livroId, { obra: achada.obra, edicao: null }, 'escolhido')
  }

  /** As edições da obra do livro, primeiro as do idioma dele. null: sem conexão. */
  async edicoes(livroId: string): Promise<Edicao[] | null> {
    const livro = this.banco.obterLivro(livroId)
    if (!livro?.obraId || !this.cliente) return livro?.obraId ? null : []
    try {
      const edicoes = ordenarEdicoes(await this.cliente.edicoes(livro.obraId), livro.idioma)
      for (const edicao of edicoes) guardar(this.#edicoesVistas, edicao.id, edicao, MAXIMO_NA_MEMORIA)
      return edicoes
    } catch (erro) {
      if (erro instanceof SemConexao) return null
      throw erro
    }
  }

  async escolherEdicao(livroId: string, edicaoId: string): Promise<SobreLivro | null> {
    const livro = this.banco.obterLivro(livroId)
    if (!livro?.obraId) return this.sobre(livroId)
    const edicao = this.#edicoesVistas.get(edicaoId) ?? (await this.cliente?.edicao(edicaoId).catch(() => null))
    // Só uma edição da obra do livro: a lista na tela pode ser de outro livro, ou de outra obra.
    if (!edicao || edicao.obraId !== livro.obraId) return this.sobre(livroId)
    this.banco.salvarEdicao(edicao)
    this.banco.ligarAoCatalogo(livroId, { obraId: livro.obraId, edicaoId, reconhecimento: 'escolhido' })
    this.aoMudar(livroId)
    return this.sobre(livroId)
  }

  /** "Não é nenhuma destas": o livro fica sem obra e não é procurado de novo sozinho. */
  nenhuma(livroId: string): SobreLivro | null {
    if (!this.banco.obterLivro(livroId)) return null
    this.banco.ligarAoCatalogo(livroId, { obraId: null, edicaoId: null, reconhecimento: 'recusado' })
    this.aoMudar(livroId)
    return this.sobre(livroId)
  }

  /** Troca a capa do livro pela do catálogo: a escolhida, ou a da sua edição, ou a da obra. */
  async usarCapaDoCatalogo(livroId: string, capaId?: number): Promise<SobreLivro | null> {
    await this.#baixarCapa(livroId, capaId ?? this.#capaId(livroId))
    this.aoMudar(livroId)
    return this.sobre(livroId)
  }
}
