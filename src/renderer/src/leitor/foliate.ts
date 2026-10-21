// Tipos mínimos para o foliate-js (JavaScript puro, vendorizado em ../vendor/foliate-js).

import '../vendor/foliate-js/view.js'

export interface ItemDoSumario {
  id?: number
  label: string
  href: string
  subitems?: ItemDoSumario[] | null
}

export interface LivroFoliate {
  sections: { id: string; linear?: string }[]
  toc?: ItemDoSumario[] | null
  pageList?: ItemDoSumario[] | null
  dir?: string
}

export interface DetalheRelocate {
  fraction: number
  section?: { current: number; total: number }
  location?: { current: number; next: number; total: number }
  time?: { section: number; total: number }
  tocItem?: ItemDoSumario | null
  pageItem?: ItemDoSumario | null
  cfi: string
  range?: Range
  /** Por que a posição mudou: "anchor" é o layout (abrir, letra, janela); os outros, uma navegação. */
  reason?: 'page' | 'snap' | 'scroll' | 'anchor' | 'navigation' | 'selection' | null
}

export interface RendererFoliate extends HTMLElement {
  setStyles(css: string): void
  /** anchor: fração da seção (0 = começo, 1 = fim). */
  goTo(destino: { index: number; anchor?: number }): Promise<void>
}

export interface VisaoFoliate extends HTMLElement {
  book: LivroFoliate
  renderer: RendererFoliate
  lastLocation: DetalheRelocate | null
  open(arquivo: File): Promise<void>
  init(opcoes: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
  goTo(destino: string | number): Promise<unknown>
  goToFraction(fracao: number): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  close(): void
  resolveNavigation(destino: string): { index: number } | undefined
  getSectionFractions(): number[]
}

export const criarVisao = () => document.createElement('foliate-view') as VisaoFoliate
