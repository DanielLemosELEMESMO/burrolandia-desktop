// ISBN: conferir, padronizar em 13 dígitos e achar no texto (a página de créditos de um PDF).

export function isbnValido(digitos: string) {
  if (/^97[89]\d{10}$/.test(digitos)) {
    const soma = [...digitos].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
    return soma % 10 === 0
  }
  if (/^\d{9}[\dX]$/.test(digitos)) {
    const soma = [...digitos].reduce((s, d, i) => s + (d === 'X' ? 10 : Number(d)) * (10 - i), 0)
    return soma % 11 === 0
  }
  return false
}

/** O ISBN em 13 dígitos, sem hífens; null se não for um ISBN válido. */
export function paraIsbn13(texto: string): string | null {
  const digitos = texto.replace(/[\s-]/g, '').toUpperCase()
  if (!isbnValido(digitos)) return null
  if (digitos.length === 13) return digitos
  const base = `978${digitos.slice(0, 9)}`
  const soma = [...base].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return base + ((10 - (soma % 10)) % 10)
}

// De 10 a 13 dígitos, separados por até dois espaços ou hífens (o PDF quebra "978-85-" e "359…" em
// pedaços), sem colar em outros números.
const SEQUENCIA = /(?<![\dXx-])(?:\d[ \t-]{0,2}){9,12}[\dXx](?![\dXx]|-\d)/g
const ROTULO = /ISBN(?:-?1[03])?\s*:?\s*$/i

/**
 * Os ISBNs de um texto, em 13 dígitos e sem repetir. Um ISBN-13 (978/979) vale sozinho, se o dígito
 * verificador bater; um ISBN-10 só vale logo depois da palavra ISBN (sozinho, parece qualquer número).
 */
export function encontrarIsbns(texto: string): string[] {
  const achados: string[] = []
  for (const encontro of texto.matchAll(SEQUENCIA)) {
    const digitos = encontro[0].replace(/[ \t-]/g, '').toUpperCase()
    const rotulado = ROTULO.test(texto.slice(Math.max(0, encontro.index - 16), encontro.index))
    const aceito = digitos.length === 13 ? /^97[89]/.test(digitos) : digitos.length === 10 && rotulado
    const isbn = aceito ? paraIsbn13(digitos) : null
    if (isbn && !achados.includes(isbn)) achados.push(isbn)
  }
  return achados
}
