// A ponte entre a interface e o processo principal. Só tipos: a implementação está em index.ts.

import type {
  AndamentoImportacao,
  Livro,
  Locator,
  Preferencias,
  ResultadoImportacao,
  Sessao,
} from '../nucleo/tipos'

export interface ApiBurrolandia {
  biblioteca: {
    listar(): Promise<Livro[]>
    /** Abre o diálogo do sistema e importa o arquivo escolhido. null se a pessoa cancelar. */
    adicionar(): Promise<ResultadoImportacao | null>
    importar(caminho: string): Promise<ResultadoImportacao>
    remover(id: string): Promise<void>
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
}
