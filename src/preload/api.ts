// A ponte entre a interface e o processo principal. Só tipos: a implementação está em index.ts.

import type {
  AndamentoImportacao,
  CapaDaObra,
  CapaDoCatalogo,
  Edicao,
  ImagemDoLivro,
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
    /** Guarda a capa gerada pela interface (primeira página de um PDF, um recorte, uma imagem sua). */
    salvarCapa(id: string, imagem: Uint8Array): Promise<Livro | null>
    /** As imagens de dentro do livro que podem virar capa (EPUB; o PDF a interface desenha). */
    imagens(id: string): Promise<ImagemDoLivro[]>
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
    /** O que já se sabe do livro; a descrição da obra, se faltar, chega depois por aoMudar. */
    sobre(id: string): Promise<SobreLivro | null>
    /** Procura a obra do livro, se ainda pendente (o que a pessoa escolheu fica). Sem conexão, volta pendente. */
    reconhecer(id: string): Promise<SobreLivro | null>
    /** null: sem conexão com o catálogo. */
    buscar(texto: string): Promise<ObraEncontrada[] | null>
    /** As edições da obra do livro, primeiro as do idioma dele. null: sem conexão. */
    edicoes(id: string): Promise<Edicao[] | null>
    escolherObra(id: string, obraId: string): Promise<SobreLivro | null>
    escolherEdicao(id: string, edicaoId: string): Promise<SobreLivro | null>
    nenhuma(id: string): Promise<SobreLivro | null>
    /** A imagem da capa do catálogo, para ver antes de trocar, e se ela já é a capa do livro. */
    capa(id: string): Promise<CapaDoCatalogo | null>
    /** As capas da obra e das edições no catálogo, para escolher. null: sem conexão. */
    capas(id: string): Promise<CapaDaObra[] | null>
    /** A miniatura de uma capa do catálogo. */
    miniatura(capaId: number): Promise<Uint8Array | null>
    /** Usa a capa do catálogo: a escolhida (capaId), ou a da sua edição, ou a da obra. */
    usarCapa(id: string, capaId?: number): Promise<SobreLivro | null>
    /** Avisa quando o catálogo muda um livro (reconheceu, trocou a capa…). */
    aoMudar(quando: (livroId: string) => void): () => void
  }
}
