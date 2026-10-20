// O tempo em palavras, como se diz em casa: "faltam 8 minutos neste capítulo".

const plural = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`

export function duracaoEmPalavras(minutos: number): string {
  if (minutos < 1) return 'menos de 1 minuto'
  if (minutos < 60) return plural(Math.round(minutos), 'minuto', 'minutos')

  // Acima de uma hora, minuto a minuto é ruído: arredonda para 5.
  const total = Math.round(minutos / 5) * 5
  const horas = Math.floor(total / 60)
  const resto = total % 60
  const textoHoras = plural(horas, 'hora', 'horas')
  return resto ? `${textoHoras} e ${plural(resto, 'minuto', 'minutos')}` : textoHoras
}

export function faltaNoCapitulo(minutos: number): string {
  const duracao = duracaoEmPalavras(minutos)
  const singular = /^(1 (minuto|hora)|menos de 1 minuto)$/.test(duracao)
  return `${singular ? 'falta' : 'faltam'} ${duracao} neste capítulo`
}

export function saudacao(agora: Date): string {
  const hora = agora.getHours()
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}
