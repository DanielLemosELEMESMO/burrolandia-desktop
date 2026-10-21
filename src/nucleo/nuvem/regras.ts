// O livro como fica na nuvem e as regras de conflito entre aparelhos. O banco do Supabase segue estas
// regras (supabase/migrations); as nuvens de mentira dos testes usam estas funções, e um teste de
// contrato confere que as duas dão o mesmo resultado.

import type { Edicao, FormatoOriginal, Identificadores, Locator, Obra, Reconhecimento } from '../tipos'

export interface LivroNaNuvem {
  /** O hash SHA-256 do arquivo: o mesmo arquivo em dois aparelhos é o mesmo livro. */
  hash: string
  titulo: string
  autores: string[]
  idioma: string | null
  formato: FormatoOriginal
  tamanhoBytes: number
  identificadores: Identificadores
  obraId: string | null
  edicaoId: string | null
  reconhecimento: Reconhecimento
  /** A obra e a edição como estavam no aparelho que reconheceu. */
  obra: Obra | null
  edicao: Edicao | null
  metadadosEm: string
  /** O nome da capa na nuvem (capa-<hash da imagem>.<tipo>), depois de enviada. */
  capa: string | null
  capaEm: string | null
  /** O nome do arquivo na nuvem (<hash>.<formato>), depois de enviado. */
  arquivo: string | null
  posicao: Locator | null
  progresso: number
  posicaoEm: string | null
  adicionadoEm: string
  abertoEm: string | null
  /** A lápide: removido num aparelho, os outros removem também. */
  removidoEm: string | null
  /** A hora do servidor da última mudança, como o servidor escreve (é o marcador de "o que mudou"). */
  atualizadoEm: string
}

/**
 * O que um aparelho manda guardar. `novo`: o livro ainda não foi enviado para esta conta (importado
 * agora, ou o aparelho acabou de entrar); só um livro novo volta depois de removido.
 */
export type LivroParaGuardar = Omit<LivroNaNuvem, 'removidoEm' | 'atualizadoEm'> & { novo: boolean }

export interface Lapide {
  hash: string
  removidoEm: string
}

/**
 * A hora do que o app faz sozinho (o título e a capa que vieram no arquivo, o reconhecimento
 * automático, a capa gerada da primeira página): perde para qualquer escolha sua, em qualquer
 * aparelho, e entre duas automáticas fica a que chegou primeiro à nuvem.
 */
export const HORA_FRACA = '1970-01-01T00:00:00.000Z'

/**
 * A hora de um reconhecimento: o que o app achou sozinho fica entre o que veio no arquivo e a sua
 * escolha (escolhido, recusado), com o ISBN acima do título e o "não achou" abaixo dos dois.
 */
export function horaDoReconhecimento(reconhecimento: Reconhecimento, agora = new Date()): string {
  const automatico: Partial<Record<Reconhecimento, number>> = { pendente: 0, 'sem-resultado': 1, titulo: 2, isbn: 3 }
  const passo = automatico[reconhecimento]
  return passo === undefined ? agora.toISOString() : new Date(Date.parse(HORA_FRACA) + passo).toISOString()
}

/** Um relógio adiantado não ganha todas: as horas dos aparelhos passam no máximo 5 minutos do servidor. */
const FOLGA_DO_RELOGIO = 5 * 60_000

function horaDoAparelho(hora: string | null, agora: Date): string | null {
  if (!hora) return null
  const limite = agora.getTime() + FOLGA_DO_RELOGIO
  return Date.parse(hora) > limite ? new Date(limite).toISOString() : hora
}

/** a é depois de b (nula nunca é depois; qualquer hora é depois de nula). */
export const depoisDe = (a: string | null, b: string | null) => !!a && (!b || Date.parse(a) > Date.parse(b))

type Estado = Omit<LivroNaNuvem, 'atualizadoEm'>

/**
 * Como o livro fica na nuvem depois de um aparelho mandar guardar. undefined: nada muda (o livro foi
 * removido e o aparelho, atrasado, ainda não sabia).
 */
export function guardarNaNuvem(atual: Estado | undefined, recebido: LivroParaGuardar, agora: Date): Estado | undefined {
  const item: LivroParaGuardar = {
    ...recebido,
    metadadosEm: horaDoAparelho(recebido.metadadosEm, agora)!,
    capaEm: horaDoAparelho(recebido.capaEm, agora),
    posicaoEm: horaDoAparelho(recebido.posicaoEm, agora),
    adicionadoEm: horaDoAparelho(recebido.adicionadoEm, agora)!,
    abertoEm: horaDoAparelho(recebido.abertoEm, agora),
  }
  const { novo: _novo, ...campos } = item
  const inteiro = (): Estado => ({ ...campos, capaEm: campos.capa ? campos.capaEm : null, removidoEm: null })

  if (!atual) return inteiro()
  if (atual.removidoEm) return item.novo ? inteiro() : undefined

  const meta = depoisDe(item.metadadosEm, atual.metadadosEm)
  const capaNova = !!item.capa && !!item.capaEm && depoisDe(item.capaEm, atual.capaEm)
  const posicaoNova = !!item.posicao && !!item.posicaoEm && depoisDe(item.posicaoEm, atual.posicaoEm)
  return {
    ...atual,
    ...(meta && {
      titulo: item.titulo,
      autores: item.autores,
      idioma: item.idioma,
      identificadores: item.identificadores,
      obraId: item.obraId,
      edicaoId: item.edicaoId,
      reconhecimento: item.reconhecimento,
      obra: item.obra,
      edicao: item.edicao,
      metadadosEm: item.metadadosEm,
    }),
    ...(capaNova && { capa: item.capa, capaEm: item.capaEm }),
    arquivo: atual.arquivo ?? item.arquivo,
    ...(posicaoNova && { posicao: item.posicao, progresso: item.progresso, posicaoEm: item.posicaoEm }),
    // Adicionado de novo (novo para a conta) com o livro ainda vivo: conta a hora mais recente, e uma
    // remoção atrasada de outro aparelho, feita antes disso, não o tira.
    adicionadoEm: item.novo && depoisDe(item.adicionadoEm, atual.adicionadoEm) ? item.adicionadoEm : atual.adicionadoEm,
    abertoEm: depoisDe(item.abertoEm, atual.abertoEm) ? item.abertoEm : atual.abertoEm,
  }
}

/**
 * Como o livro fica depois da lápide: sem nada pessoal. undefined: nada muda (já removido, ou
 * adicionado de novo depois da hora da remoção).
 */
export function removerNaNuvem(atual: Estado | undefined, lapide: Lapide, agora: Date): Estado | undefined {
  const removidoEm = horaDoAparelho(lapide.removidoEm, agora)!
  if (!atual || atual.removidoEm || !depoisDe(removidoEm, atual.adicionadoEm)) return undefined
  return {
    ...atual,
    removidoEm,
    titulo: '(removido)',
    autores: [],
    idioma: null,
    identificadores: { isbn: [], outros: [] },
    obraId: null,
    edicaoId: null,
    reconhecimento: 'pendente',
    obra: null,
    edicao: null,
    capa: null,
    capaEm: null,
    arquivo: null,
    posicao: null,
    progresso: 0,
    posicaoEm: null,
    abertoEm: null,
  }
}

/** Os livros que mudaram depois de (desde, depoisDe), em ordem, até o limite. Sem desde, todos. */
export function mudancasDesde(livros: LivroNaNuvem[], desde: string | null, depoisDeHash: string | null, limite: number) {
  const chave = (l: LivroNaNuvem) => [l.atualizadoEm, l.hash] as const
  const maior = (a: readonly [string, string], b: readonly [string, string]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])
  return livros
    .filter(l => desde === null || maior(chave(l), [desde, depoisDeHash ?? '']))
    .sort((a, b) => (maior(chave(a), chave(b)) ? 1 : maior(chave(b), chave(a)) ? -1 : 0))
    .slice(0, Math.min(Math.max(limite, 1), 1000))
}
