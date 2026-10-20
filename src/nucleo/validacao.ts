// Tudo o que chega do renderer pelo IPC passa por aqui antes de tocar o banco.

import { TAMANHO_MAXIMO, TAMANHO_MINIMO, type Locator, type Preferencias } from './tipos'

const OPCOES: { [K in Exclude<keyof Preferencias, 'tamanho'>]: readonly Preferencias[K][] } = {
  tema: ['automatico', 'papel', 'sepia', 'noite'],
  letra: ['literata', 'atkinson', 'original'],
  espacamento: ['compacto', 'confortavel', 'amplo'],
  largura: ['estreita', 'media', 'larga'],
  alinhamento: ['esquerda', 'justificado'],
  fluxo: ['paginas', 'rolagem'],
  colunas: ['uma', 'duas'],
}

const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

export function validarPreferencias(entrada: unknown): Partial<Preferencias> {
  if (!ehObjeto(entrada)) return {}
  const saida: Record<string, unknown> = {}
  for (const [chave, opcoes] of Object.entries(OPCOES)) {
    if ((opcoes as readonly unknown[]).includes(entrada[chave])) saida[chave] = entrada[chave]
  }
  if (typeof entrada.tamanho === 'number' && Number.isFinite(entrada.tamanho)) {
    saida.tamanho = Math.round(Math.min(TAMANHO_MAXIMO, Math.max(TAMANHO_MINIMO, entrada.tamanho)))
  }
  return saida as Partial<Preferencias>
}

const LIMITE_DE_TEXTO = 500

const texto = (x: unknown, limite = LIMITE_DE_TEXTO) => (typeof x === 'string' ? x.slice(0, limite) : undefined)
const fracao = (x: unknown) => (typeof x === 'number' && x >= 0 && x <= 1 ? x : undefined)

/** Remove as chaves com valor undefined, para o objeto sair limpo no JSON. */
const limpo = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

export function validarLocator(entrada: unknown): Locator | null {
  if (!ehObjeto(entrada) || typeof entrada.href !== 'string' || !ehObjeto(entrada.locations)) return null
  const l = entrada.locations
  const locator: Locator = limpo({
    href: entrada.href.slice(0, LIMITE_DE_TEXTO),
    type: texto(entrada.type) ?? 'application/xhtml+xml',
    title: texto(entrada.title),
    locations: limpo({
      progression: fracao(l.progression),
      totalProgression: fracao(l.totalProgression),
      position: typeof l.position === 'number' && Number.isInteger(l.position) ? l.position : undefined,
      cfi: texto(l.cfi, 2000),
      pagina: texto(l.pagina, 50),
    }),
  })
  if (ehObjeto(entrada.text)) {
    const t = entrada.text
    locator.text = limpo({ before: texto(t.before), highlight: texto(t.highlight), after: texto(t.after) })
  }
  return locator
}
