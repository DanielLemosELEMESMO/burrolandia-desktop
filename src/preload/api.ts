// A ponte entre a interface e o processo principal. Só tipos: a implementação está em index.ts.

import type {
  AndamentoImportacao,
  Edicao,
  Livro,
  Locator,
  ObraEncontrada,
  Preferencias,
  ResultadoImportacao,
  Sessao,
  SobreLivro,
} from '../nucleo/tipos'

export interface ApiBurrolandia {
  biblioteca: {
    listar(): Promise<Livro[]>
    /** Abre o diálogo do sistema e importa o arquivo escolhido. null se a pessoa cancelar. */
    adicionar(): Promise<ResultadoImportacao | null>
    importar(caminho: string): Promise<ResultadoImportacao>
    remover(id: string): Promise<void>
    /** Guarda a capa gerada pela interface (primeira página de um PDF). */
    salvarCapa(id: string, imagem: Uint8Array): Promise<Livro | null>
    /** Caminho no disco de um arquivo arrastado para a janela. */
    caminhoDoArquivo(arquivo: File): string
    aoAndamento(quando: (andamento: AndamentoImportacao) => void): () => void
  }
  leitura: {
    abrir(id: string): Promise<Livro | null>
    fechar(): Promise<void>
    salvarPosicao(id: string, posicao: Locator): Promise<void>
    /** Salva na hora, sem esperar: para quando a janela está fechando. */
    salvarPosicaoAgora(id: string, posicao: Locator): void
  }
  preferencias: {
    ler(): Promise<Preferencias>
    salvar(parcial: Partial<Preferencias>): Promise<Preferencias>
  }
  sessao: {
    ler(): Promise<Sessao>
  }
  /** O catálogo (Open Library): a obra e a edição de cada livro. */
  catalogo: {
    sobre(id: string): Promise<SobreLivro | null>
    /** Procura a obra do livro (se ainda pendente, ou de novo). Sem conexão, volta ainda pendente. */
    reconhecer(id: string, deNovo?: boolean): Promise<SobreLivro | null>
    /** null: sem conexão com o catálogo. */
    buscar(texto: string): Promise<ObraEncontrada[] | null>
    /** As edições da obra do livro, primeiro as do idioma dele. null: sem conexão. */
    edicoes(id: string): Promise<Edicao[] | null>
    escolherObra(id: string, obraId: string): Promise<SobreLivro | null>
    escolherEdicao(id: string, edicaoId: string): Promise<SobreLivro | null>
    nenhuma(id: string): Promise<SobreLivro | null>
    /** A imagem da capa do catálogo, para ver antes de trocar. */
    capa(id: string): Promise<Uint8Array | null>
    usarCapa(id: string): Promise<SobreLivro | null>
    /** Avisa quando o catálogo muda um livro (reconheceu, trocou a capa…). */
    aoMudar(quando: (livroId: string) => void): () => void
  }
}
