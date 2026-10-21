// Como um livro que veio da nuvem entra neste aparelho: as mesmas regras da nuvem (regras.ts), do lado
// de cá. Sem efeitos: quem aplica é o banco e a biblioteca.

import { depoisDe, type LivroNaNuvem } from './regras'

/** O que o aparelho sabe de um livro para decidir. */
export interface LivroNoAparelho {
  metadadosEm: string
  capa: string | null
  capaEm: string | null
  /** O nome da capa deste aparelho que já está na nuvem. */
  capaNaNuvem: string | null
  /** O nome do arquivo na nuvem, se este aparelho já sabe que está lá. */
  arquivoNaNuvem: string | null
  posicaoEm: string | null
  abertoEm: string | null
  /** 0: o livro nunca foi enviado para esta conta. */
  versaoEnviada: number
}

export type Decisao =
  | { tipo: 'ignorar' }
  /** O livro foi removido em outro aparelho e já estava sincronizado aqui. */
  | { tipo: 'remover' }
  /** Um livro de outro aparelho: entra na biblioteca, com o arquivo ainda na nuvem. */
  | { tipo: 'criar' }
  | {
      tipo: 'atualizar'
      metadados: boolean
      posicao: boolean
      aberto: boolean
      /** baixar: a capa da nuvem é outra e mais nova; marcar: é a mesma daqui, já está lá. */
      capa: 'baixar' | 'marcar' | null
      /** O arquivo está na nuvem: não precisa subir daqui. */
      arquivo: boolean
    }

/**
 * temLapide: o livro foi removido aqui e a remoção ainda não subiu (ela vai, e a nuvem decide).
 * Um livro que nunca foi enviado para a conta não é removido pela lápide de outro aparelho: ele vai
 * para a conta como livro novo.
 */
export function decidir(local: LivroNoAparelho | null, remoto: LivroNaNuvem, temLapide: boolean): Decisao {
  if (remoto.removidoEm) return local && local.versaoEnviada > 0 ? { tipo: 'remover' } : { tipo: 'ignorar' }
  if (temLapide) return { tipo: 'ignorar' }
  if (!local) return { tipo: 'criar' }

  const capaNova = !!remoto.capa && depoisDe(remoto.capaEm, local.capaEm)
  const capa: 'baixar' | 'marcar' | null = capaNova
    ? remoto.capa === local.capa
      ? 'marcar'
      : 'baixar'
    : remoto.capa && remoto.capa === local.capa && local.capaNaNuvem !== remoto.capa
      ? 'marcar'
      : null
  const decisao = {
    tipo: 'atualizar' as const,
    metadados: depoisDe(remoto.metadadosEm, local.metadadosEm),
    posicao: !!remoto.posicao && depoisDe(remoto.posicaoEm, local.posicaoEm),
    aberto: depoisDe(remoto.abertoEm, local.abertoEm),
    capa,
    arquivo: !!remoto.arquivo && remoto.arquivo !== local.arquivoNaNuvem,
  }
  return decisao.metadados || decisao.posicao || decisao.aberto || decisao.capa || decisao.arquivo ? decisao : { tipo: 'ignorar' }
}
