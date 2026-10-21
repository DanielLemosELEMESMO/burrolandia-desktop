// Tipos compartilhados entre o processo principal, o renderer e (no futuro) o servidor e o celular.

export type FormatoOriginal = 'epub' | 'pdf'
/** na-nuvem: o livro veio da sua conta e o arquivo ainda não está neste aparelho (baixa ao abrir). */
export type EstadoLivro = 'pronto' | 'processando' | 'erro' | 'na-nuvem'

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
  /** A obra e a edição no catálogo (Open Library), quando reconhecidas. */
  obraId: string | null
  edicaoId: string | null
  reconhecimento: Reconhecimento
}

/**
 * Como a obra do livro foi reconhecida:
 * - pendente: ainda não procurou (ou estava sem internet);
 * - isbn: achou a edição exata pelo ISBN;
 * - titulo: achou a obra pelo título e pelo autor (a edição fica para você escolher);
 * - escolhido: você escolheu a obra;
 * - sem-resultado: procurou e não achou;
 * - recusado: você disse que não é nenhuma das sugestões.
 */
export type Reconhecimento = 'pendente' | 'isbn' | 'titulo' | 'escolhido' | 'sem-resultado' | 'recusado'

/** A obra: o livro como criação, acima das edições ("A Origem das Espécies"). Dados do Open Library. */
export interface Obra {
  /** O id do Open Library, como OL1003040W. */
  id: string
  titulo: string
  autores: string[]
  primeiroAno: number | null
  /** Quantas edições o Open Library conhece. */
  edicoes: number
  capaId: number | null
  assuntos: string[]
  /** null enquanto não buscou; texto vazio se a obra não tem descrição. */
  descricao: string | null
}

/** Uma publicação específica de uma obra: editora, ano, ISBN. */
export interface Edicao {
  /** O id do Open Library, como OL56164313M. */
  id: string
  obraId: string
  titulo: string
  editoras: string[]
  /** A data como o Open Library escreve ("3 dezembro 2019", "16/07/2016"). */
  publicadaEm: string | null
  ano: number | null
  paginas: number | null
  /** Códigos de idioma do Open Library: por, eng, spa… */
  idiomas: string[]
  isbn: string[]
  capaId: number | null
}

/** O que o painel "Sobre este livro" mostra. */
export interface SobreLivro {
  livro: Livro
  obra: Obra | null
  edicao: Edicao | null
}

/** Uma obra achada na busca, com a edição que a fez aparecer (num livro traduzido, a tradução). */
export interface ObraEncontrada {
  obra: Obra
  edicao: Edicao | null
}

/** Uma imagem de dentro do livro (EPUB) que pode virar capa. */
export interface ImagemDoLivro {
  nome: string
  tipo: string
  bytes: Uint8Array
}

/** Uma capa do catálogo entre as edições da obra, para escolher. */
export interface CapaDaObra {
  capaId: number
  /** Editora e ano da edição, ou "A obra". */
  legenda: string
}

/** A capa do catálogo para ver antes de usar, e se ela já é a capa do livro. */
export interface CapaDoCatalogo {
  imagem: Uint8Array
  emUso: boolean
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

/** A sua conta na nuvem (parte 2). */
export interface Conta {
  id: string
  email: string
}

/** O que a sua conta guarda na nuvem. */
export interface UsoDaNuvem {
  /** Livros na conta. */
  livros: number
  /** Livros com o arquivo na nuvem (os outros ficaram só no aparelho de onde vieram). */
  arquivos: number
  /** Bytes guardados, capas e arquivos. */
  bytes: number
}

/** O maior arquivo que sobe para a nuvem (o limite por arquivo do plano gratuito do Supabase). */
export const LIMITE_DO_ARQUIVO_NA_NUVEM = 50 * 1024 * 1024

export type ProblemaDaNuvem = 'sem-conexao' | 'sessao-terminada' | 'falhou'

/** Como está a nuvem, para o botão da conta e a tela "Sua conta". */
export interface EstadoDaNuvem {
  /** false: este app está sem nuvem (nos testes sem internet, por exemplo). */
  disponivel: boolean
  conta: Conta | null
  sincronizando: boolean
  /** A última sincronização que deu certo (ISO). */
  ultimaVez: string | null
  /** O que deu errado na última tentativa, se deu. */
  problema: ProblemaDaNuvem | null
  /** Mudanças deste aparelho que ainda não subiram. */
  pendentes: number
  /** Livros maiores que o limite, que ficam só neste aparelho. */
  grandesDemais: number
}

export type CodigoDaConta =
  | 'senha-errada'
  | 'conta-existe'
  | 'senha-fraca'
  | 'email-invalido'
  | 'muitas-tentativas'
  | 'sem-conexao'
  | 'falhou'

export type ResultadoDaConta = { ok: true; estado: EstadoDaNuvem } | { ok: false; codigo: CodigoDaConta; mensagem: string }

/** Andamento de um livro que está vindo da nuvem. */
export interface AndamentoDoDownload {
  etapa: 'baixando' | 'adaptando' | 'guardando'
  atual?: number
  total?: number
}

export type ResultadoDoDownload = { ok: true; livro: Livro } | { ok: false; mensagem: string }
