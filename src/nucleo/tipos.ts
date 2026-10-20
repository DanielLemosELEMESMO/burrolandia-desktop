// Tipos compartilhados entre o processo principal, o renderer e (no futuro) o servidor e o celular.

export type FormatoOriginal = 'epub' | 'pdf'
export type EstadoLivro = 'pronto' | 'processando' | 'erro'

/**
 * Onde você está no livro. Segue o Locator do Readium
 * (https://readium.org/architecture/models/locators/), para o celular entender a mesma posição.
 * Extensões: `locations.cfi` (EPUB CFI completo) e `locations.pagina` (rótulo da página do PDF original).
 */

/** A página do PDF original indicada por um Locator (pelos fragmentos page=N ou pagina-N). */
export function paginaDoLocator(locator: Pick<Locator, 'locations'> | null | undefined): number | null {
  for (const fragmento of locator?.locations.fragments ?? []) {
    const numero = Number(fragmento.match(/^(?:page=|pagina-)(\d+)$/)?.[1])
    if (numero > 0) return numero
  }
  return null
}
export interface Locator {
  href: string
  type: string
  title?: string
  locations: {
    /** Num PDF, ["page=12"]; no texto adaptado, ["pagina-12"] (a âncora da página 12 do original). */
    fragments?: string[]
    progression?: number
    totalProgression?: number
    position?: number
    cfi?: string
    pagina?: string
  }
  text?: { before?: string; highlight?: string; after?: string }
}

export interface Identificadores {
  isbn: string[]
  outros: string[]
}

/** O seu exemplar: o arquivo que você trouxe, com a posição e o progresso. */
export interface Livro {
  id: string
  titulo: string
  autores: string[]
  idioma: string | null
  formatoOriginal: FormatoOriginal
  arquivoOriginal: string
  arquivoLeitura: string | null
  capa: string | null
  hashSha256: string
  tamanhoBytes: number
  identificadores: Identificadores
  estado: EstadoLivro
  posicao: Locator | null
  progresso: number
  adicionadoEm: string
  abertoEm: string | null
  atualizadoEm: string
}

export type Tema = 'automatico' | 'papel' | 'sepia' | 'noite'

/** O tema que de fato aparece: "automático" vira papel ou noite, conforme o sistema. */
export type TemaEfetivo = Exclude<Tema, 'automatico'>

export interface Preferencias {
  tema: Tema
  letra: 'literata' | 'atkinson' | 'original'
  tamanho: number
  espacamento: 'compacto' | 'confortavel' | 'amplo'
  largura: 'estreita' | 'media' | 'larga'
  alinhamento: 'esquerda' | 'justificado'
  fluxo: 'paginas' | 'rolagem'
  colunas: 'uma' | 'duas'
}

export const PREFERENCIAS_PADRAO: Preferencias = {
  tema: 'automatico',
  letra: 'literata',
  tamanho: 19,
  espacamento: 'confortavel',
  largura: 'media',
  alinhamento: 'esquerda',
  fluxo: 'paginas',
  colunas: 'duas',
}

export const TAMANHO_MINIMO = 14
export const TAMANHO_MAXIMO = 32

/** O que estava aberto quando o app fechou. */
export interface Sessao {
  livroAberto: string | null
}

export type CodigoErroImportacao =
  | 'formato-nao-suportado'
  | 'arquivo-invalido'
  | 'drm'
  | 'arquivo-inacessivel'
  | 'protegido-por-senha'
  | 'conversao-interrompida'

export type ResultadoImportacao =
  | { tipo: 'adicionado'; livro: Livro }
  | { tipo: 'repetido'; livro: Livro }
  | { tipo: 'erro'; codigo: CodigoErroImportacao; mensagem: string }

/** Andamento de uma importação, para o painel "Preparando seu livro". */
export interface AndamentoImportacao {
  etapa: 'lendo' | 'adaptando' | 'guardando'
  atual?: number
  total?: number
}
