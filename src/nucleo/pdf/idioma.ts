// Adivinha o idioma de um texto pelas palavras mais comuns. Serve para a hifenização e, no futuro,
// para a leitura em voz alta. Só quando o PDF não diz o idioma.

const PALAVRAS: Record<string, string[]> = {
  'pt-BR': ['não', 'uma', 'com', 'os', 'do', 'da', 'dos', 'das', 'que', 'para', 'pelo', 'pela', 'mais', 'também', 'você', 'são', 'está', 'foi', 'ao', 'aos', 'nos', 'nas', 'isso', 'muito', 'já', 'há', 'é', 'em', 'um', 'mas'],
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'it', 'was', 'for', 'on', 'are', 'with', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'had', 'by', 'but', 'not', 'which', 'were', 'their', 'been', 'would'],
  es: ['el', 'la', 'los', 'las', 'y', 'en', 'una', 'por', 'con', 'para', 'es', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'este', 'porque', 'esta', 'cuando', 'muy', 'sin', 'sobre', 'también', 'hasta', 'hay', 'donde', 'él'],
}

export function detectarIdioma(texto: string): string | null {
  const palavras = (texto.toLowerCase().match(/\p{L}+/gu) ?? []).slice(0, 5000)
  if (palavras.length < 30) return null
  let melhor: string | null = null
  let maior = 0
  for (const [idioma, lista] of Object.entries(PALAVRAS)) {
    const conjunto = new Set(lista)
    const acertos = palavras.filter(p => conjunto.has(p)).length
    if (acertos > maior) {
      melhor = idioma
      maior = acertos
    }
  }
  return maior >= palavras.length * 0.08 ? melhor : null
}

/** "pt", "PT-br", "português" → "pt-BR"; códigos válidos passam como vieram. */
export function normalizarIdioma(idioma: string | undefined): string | null {
  if (!idioma) return null
  const codigo = idioma.trim().replace('_', '-')
  if (/^pt(-br)?$/i.test(codigo) || /portugu/i.test(codigo)) return 'pt-BR'
  if (/^pt-pt$/i.test(codigo)) return 'pt-PT'
  try {
    return Intl.getCanonicalLocales(codigo)[0] ?? null
  } catch {
    return null
  }
}
