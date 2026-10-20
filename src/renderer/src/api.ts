import type { Livro, Preferencias, TemaEfetivo } from '@nucleo/tipos'
import type { ApiBurrolandia } from '../../preload/api'

declare global {
  interface Window {
    burrolandia: ApiBurrolandia
  }
}

export const api = window.burrolandia

export const ORIGEM = 'app://burrolandia'

export const urlDoArquivo = (livro: Pick<Livro, 'id'>, arquivo: string) =>
  `${ORIGEM}/livros/${livro.id}/${encodeURIComponent(arquivo)}`

export const temaEfetivo = (preferencias: Pick<Preferencias, 'tema'>, escuroNoSistema: boolean): TemaEfetivo =>
  preferencias.tema === 'automatico' ? (escuroNoSistema ? 'noite' : 'papel') : preferencias.tema
