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

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const inicioDoDia = (data: Date) => new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime()

/** "agora há pouco", "há 5 minutos", "ontem", "há 3 dias", "há 2 semanas", "em 12 de março". */
export function haQuantoTempo(quando: Date | string, agora = new Date()): string {
  const data = typeof quando === 'string' ? new Date(quando) : quando
  const minutos = (agora.getTime() - data.getTime()) / 60_000
  if (minutos < 1) return 'agora há pouco'
  if (minutos < 60) return `há ${plural(Math.floor(minutos), 'minuto', 'minutos')}`
  if (minutos < 24 * 60) return `há ${plural(Math.floor(minutos / 60), 'hora', 'horas')}`
  // Dias do calendário, não blocos de 24 horas (round absorve a troca de horário de verão).
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(data)) / 86_400_000)
  if (dias <= 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  if (dias < 30) return `há ${plural(Math.floor(dias / 7), 'semana', 'semanas')}`
  const ano = data.getFullYear() === agora.getFullYear() ? '' : ` de ${data.getFullYear()}`
  return `em ${data.getDate()} de ${MESES[data.getMonth()]}${ano}`
}
