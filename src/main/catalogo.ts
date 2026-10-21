// O catálogo: reconhece a obra e a edição de cada livro no Open Library e guarda no banco.
// Primeiro pelo ISBN (acha a edição exata); senão, pelo título e pelo autor (acha a obra, e a
// edição fica para você escolher). Do computador só saem título, autor e ISBN; o arquivo, nunca.
// Sem internet, o livro continua "pendente" e é procurado de novo na próxima abertura do app.

import { ClienteOpenLibrary, SemConexao } from '@nucleo/catalogo/cliente'
import { consultaDeTexto, escolherObra, ordenarEdicoes } from '@nucleo/catalogo/correspondencia'
import { paraIsbn13 } from '@nucleo/catalogo/isbn'
import type { Edicao, Livro, ObraEncontrada, Reconhecimento, SobreLivro } from '@nucleo/tipos'
import type { Banco } from './banco'
import type { Biblioteca } from './biblioteca'

export class Catalogo {
  /** As últimas obras achadas e edições listadas, para escolher sem perguntar de novo ao catálogo. */
  readonly #obrasVistas = new Map<string, ObraEncontrada>()
  readonly #edicoesVistas = new Map<string, Edicao>()
  readonly #emAndamento = new Map<string, Promise<SobreLivro | null>>()
  readonly #capas = new Map<number, Uint8Array>()

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

  /** O "Sobre este livro", buscando a descrição da obra se ela ainda não veio. */
  async sobreCompleto(livroId: string): Promise<SobreLivro | null> {
    const sobre = this.sobre(livroId)
    if (sobre?.obra && sobre.obra.descricao === null && this.cliente) {
      const detalhes = await this.cliente.detalhesDaObra(sobre.obra.id).catch(() => null)
      if (detalhes) {
        this.banco.salvarObra({ ...sobre.obra, ...detalhes, assuntos: detalhes.assuntos.length ? detalhes.assuntos : sobre.obra.assuntos })
        return this.sobre(livroId)
      }
    }
    return sobre
  }

  /**
   * Procura a obra do livro no catálogo. Só procura livros pendentes (ou se pedirem de novo); sem
   * conexão, devolve o livro ainda pendente. Dois pedidos para o mesmo livro viram um só.
   */
  reconhecer(livroId: string, { deNovo = false } = {}): Promise<SobreLivro | null> {
    const andamento = this.#emAndamento.get(livroId)
    if (andamento) return andamento
    const tarefa = this.#reconhecer(livroId, deNovo)
      .catch(erro => {
        if (erro instanceof SemConexao) return this.sobre(livroId)
        throw erro
      })
      .finally(() => this.#emAndamento.delete(livroId))
    this.#emAndamento.set(livroId, tarefa)
    return tarefa
  }

  /**
   * Procura os livros pendentes, um por um (pelo mesmo caminho dos pedidos da interface, para não
   * procurar o mesmo livro duas vezes). Se um continua pendente, está sem conexão: para e tenta na
   * próxima abertura do app.
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

  async #reconhecer(livroId: string, deNovo: boolean): Promise<SobreLivro | null> {
    const livro = this.banco.obterLivro(livroId)
    if (!livro || !this.cliente || (!deNovo && livro.reconhecimento !== 'pendente')) return this.sobre(livroId)

    for (const isbn of livro.identificadores.isbn.flatMap(i => paraIsbn13(i) ?? [])) {
      const achada = await this.cliente.porIsbn(isbn)
      if (achada?.edicao) return this.#ligar(livro, achada, 'isbn')
    }

    const alvo = { titulo: livro.titulo, autores: livro.autores }
    const achada = escolherObra(alvo, await this.cliente.porTexto(consultaDeTexto(alvo)))
    // Achada pelo título, a edição que bateu na busca não é necessariamente a sua.
    if (achada) return this.#ligar(livro, { obra: achada.obra, edicao: null }, 'titulo')

    this.banco.ligarAoCatalogo(livro.id, { obraId: null, edicaoId: null, reconhecimento: 'sem-resultado' })
    this.aoMudar(livro.id)
    return this.sobre(livro.id)
  }

  async #ligar(livro: Livro, { obra, edicao }: ObraEncontrada, reconhecimento: Reconhecimento) {
    const detalhes = obra.descricao === null ? await this.cliente?.detalhesDaObra(obra.id).catch(() => null) : null
    this.banco.salvarObra({
      ...obra,
      descricao: detalhes?.descricao ?? obra.descricao,
      assuntos: detalhes?.assuntos.length ? detalhes.assuntos : obra.assuntos,
    })
    if (edicao) this.banco.salvarEdicao(edicao)
    this.banco.ligarAoCatalogo(livro.id, { obraId: obra.id, edicaoId: edicao?.id ?? null, reconhecimento })
    if (!livro.capa) await this.#baixarCapa(livro.id, edicao?.capaId ?? obra.capaId)
    this.aoMudar(livro.id)
    return this.sobre(livro.id)
  }

  /** A imagem da capa no catálogo, baixada uma vez por sessão. */
  async #imagemDaCapa(capaId: number | null): Promise<Uint8Array | null> {
    if (!capaId || !this.cliente) return null
    const guardada = this.#capas.get(capaId)
    if (guardada) return guardada
    const imagem = await this.cliente.capa(capaId).catch(() => null)
    if (imagem) this.#capas.set(capaId, imagem)
    return imagem
  }

  async #baixarCapa(livroId: string, capaId: number | null) {
    const imagem = await this.#imagemDaCapa(capaId)
    if (imagem) await this.biblioteca.salvarCapa(livroId, imagem)
  }

  /** A capa do catálogo (a da sua edição, ou a da obra), para ver antes de usar. */
  async capaDoCatalogo(livroId: string): Promise<Uint8Array | null> {
    const sobre = this.sobre(livroId)
    return this.#imagemDaCapa(sobre?.edicao?.capaId ?? sobre?.obra?.capaId ?? null)
  }

  /** Busca livre, para quando a obra não foi reconhecida (ou não é a certa). null: sem conexão. */
  async buscarObras(texto: string): Promise<ObraEncontrada[] | null> {
    if (!this.cliente) return null
    try {
      const achadas = await this.cliente.porTexto(texto)
      for (const achada of achadas) this.#obrasVistas.set(achada.obra.id, achada)
      return achadas
    } catch (erro) {
      if (erro instanceof SemConexao) return null
      throw erro
    }
  }

  async escolherObra(livroId: string, obraId: string): Promise<SobreLivro | null> {
    const livro = this.banco.obterLivro(livroId)
    if (!livro) return null
    const achada = this.#obrasVistas.get(obraId) ?? (await this.cliente?.obra(obraId).catch(() => null))
    if (!achada) return this.sobre(livroId)
    return this.#ligar(livro, { obra: achada.obra, edicao: null }, 'escolhido')
  }

  /** As edições da obra do livro, primeiro as do idioma dele. null: sem conexão. */
  async edicoes(livroId: string): Promise<Edicao[] | null> {
    const livro = this.banco.obterLivro(livroId)
    if (!livro?.obraId || !this.cliente) return livro?.obraId ? null : []
    try {
      const edicoes = ordenarEdicoes(await this.cliente.edicoes(livro.obraId), livro.idioma)
      for (const edicao of edicoes) this.#edicoesVistas.set(edicao.id, edicao)
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
    if (!edicao) return this.sobre(livroId)
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

  /** Troca a capa do livro pela do catálogo (a da sua edição, ou a da obra). */
  async usarCapaDoCatalogo(livroId: string): Promise<SobreLivro | null> {
    const sobre = this.sobre(livroId)
    await this.#baixarCapa(livroId, sobre?.edicao?.capaId ?? sobre?.obra?.capaId ?? null)
    this.aoMudar(livroId)
    return this.sobre(livroId)
  }
}
