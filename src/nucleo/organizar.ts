// A biblioteca organizada: busca, filtro de formato, ordens e o que aparece primeiro no Início.
// Sem DOM: dá para testar no Node.

import type { Livro } from './tipos'

export type Ordem = 'recentes' | 'titulo' | 'autor' | 'progresso'
export type FiltroDeFormato = 'todos' | 'epub' | 'pdf'

export interface Organizacao {
  busca?: string
  ordem?: Ordem
  formato?: FiltroDeFormato
}

/** Acima disto, o livro conta como terminado. */
const TERMINADO = 0.995

const semAcento = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Como numa biblioteca: "A Origem das Espécies" fica no O.
const ARTIGO = /^(?:o|a|os|as|um|uma|uns|umas|the|an?)\s+/
const chaveDoTitulo = (titulo: string) => semAcento(titulo).trim().replace(ARTIGO, '')

const comparar = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare
const porTitulo = (a: Livro, b: Livro) => comparar(chaveDoTitulo(a.titulo), chaveDoTitulo(b.titulo))

/** A última vez que você mexeu no livro: quando o abriu ou, se nunca abriu, quando o adicionou. */
export const ultimoUso = (livro: Livro) =>
  livro.abertoEm && livro.abertoEm > livro.adicionadoEm ? livro.abertoEm : livro.adicionadoEm

const porRecentes = (a: Livro, b: Livro) => ultimoUso(b).localeCompare(ultimoUso(a))

const ORDENS: Record<Ordem, (a: Livro, b: Livro) => number> = {
  recentes: porRecentes,
  titulo: porTitulo,
  autor: (a, b) => {
    const [autorA, autorB] = [a.autores[0], b.autores[0]]
    if (!autorA !== !autorB) return autorA ? -1 : 1
    return comparar(autorA ?? '', autorB ?? '') || porTitulo(a, b)
  },
  progresso: (a, b) => b.progresso - a.progresso || porRecentes(a, b),
}

export function organizarLivros(
  livros: Livro[],
  { busca = '', ordem = 'recentes', formato = 'todos' }: Organizacao = {},
): Livro[] {
  const termos = semAcento(busca).split(/\s+/).filter(Boolean)
  return livros
    .filter(livro => formato === 'todos' || livro.formatoOriginal === formato)
    .filter(livro => {
      const onde = semAcento([livro.titulo, ...livro.autores].join(' '))
      return termos.every(termo => onde.includes(termo))
    })
    .sort(ORDENS[ordem])
}

/** Continuar lendo: o livro aberto por último que ainda não terminou. Senão, o mais novo que você não abriu. */
export function escolherDestaque(livros: Livro[]): { livro: Livro; continuar: boolean } | null {
  const [emLeitura] = livros
    .filter(livro => livro.abertoEm && livro.progresso < TERMINADO)
    .sort((a, b) => b.abertoEm!.localeCompare(a.abertoEm!))
  if (emLeitura) return { livro: emLeitura, continuar: true }
  const [nuncaAberto] = livros.filter(livro => !livro.abertoEm).sort((a, b) => b.adicionadoEm.localeCompare(a.adicionadoEm))
  return nuncaAberto ? { livro: nuncaAberto, continuar: false } : null
}

/** Os livros mexidos por último, menos o que já está em destaque. */
export function livrosRecentes(livros: Livro[], exceto: string | null, limite: number): Livro[] {
  return livros.filter(livro => livro.id !== exceto).sort(porRecentes).slice(0, limite)
}
