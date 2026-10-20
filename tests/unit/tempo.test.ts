import { describe, expect, it } from 'vitest'
import { duracaoEmPalavras, faltaNoCapitulo, haQuantoTempo, saudacao } from '@nucleo/tempo'

describe('duracaoEmPalavras', () => {
  it('diz "menos de 1 minuto" abaixo de um minuto', () => {
    expect(duracaoEmPalavras(0.4)).toBe('menos de 1 minuto')
  })

  it('usa o singular para 1 minuto', () => {
    expect(duracaoEmPalavras(1.2)).toBe('1 minuto')
  })

  it('arredonda os minutos', () => {
    expect(duracaoEmPalavras(7.6)).toBe('8 minutos')
  })

  it('diz horas cheias por extenso', () => {
    expect(duracaoEmPalavras(60)).toBe('1 hora')
    expect(duracaoEmPalavras(121)).toBe('2 horas')
  })

  it('arredonda para 5 minutos acima de uma hora', () => {
    expect(duracaoEmPalavras(73)).toBe('1 hora e 15 minutos')
    expect(duracaoEmPalavras(127)).toBe('2 horas e 5 minutos')
  })
})

describe('faltaNoCapitulo', () => {
  it('concorda o verbo no singular', () => {
    expect(faltaNoCapitulo(1)).toBe('falta 1 minuto neste capítulo')
    expect(faltaNoCapitulo(0.2)).toBe('falta menos de 1 minuto neste capítulo')
    expect(faltaNoCapitulo(60)).toBe('falta 1 hora neste capítulo')
  })

  it('concorda o verbo no plural', () => {
    expect(faltaNoCapitulo(8)).toBe('faltam 8 minutos neste capítulo')
    expect(faltaNoCapitulo(70)).toBe('faltam 1 hora e 10 minutos neste capítulo')
  })
})

describe('saudacao', () => {
  const as = (hora: number) => new Date(2026, 9, 20, hora, 30)

  it('dá bom dia de manhã', () => {
    expect(saudacao(as(5))).toBe('Bom dia')
    expect(saudacao(as(11))).toBe('Bom dia')
  })

  it('dá boa tarde à tarde', () => {
    expect(saudacao(as(12))).toBe('Boa tarde')
    expect(saudacao(as(17))).toBe('Boa tarde')
  })

  it('dá boa noite à noite e de madrugada', () => {
    expect(saudacao(as(18))).toBe('Boa noite')
    expect(saudacao(as(2))).toBe('Boa noite')
  })
})

describe('haQuantoTempo', () => {
  const agora = new Date(2026, 9, 20, 15, 0)
  const antes = (minutos: number) => new Date(agora.getTime() - minutos * 60_000)

  it('diz "agora há pouco" no primeiro minuto', () => {
    expect(haQuantoTempo(antes(0.5), agora)).toBe('agora há pouco')
  })

  it('conta minutos e horas, com singular e plural', () => {
    expect(haQuantoTempo(antes(1), agora)).toBe('há 1 minuto')
    expect(haQuantoTempo(antes(25), agora)).toBe('há 25 minutos')
    expect(haQuantoTempo(antes(60), agora)).toBe('há 1 hora')
    expect(haQuantoTempo(antes(5 * 60), agora)).toBe('há 5 horas')
  })

  it('diz "ontem" para o dia anterior, e conta os dias da semana', () => {
    expect(haQuantoTempo(new Date(2026, 9, 19, 9, 0), agora)).toBe('ontem')
    expect(haQuantoTempo(new Date(2026, 9, 17, 20, 0), agora)).toBe('há 3 dias')
  })

  it('conta semanas no último mês', () => {
    expect(haQuantoTempo(new Date(2026, 9, 12, 10, 0), agora)).toBe('há 1 semana')
    expect(haQuantoTempo(new Date(2026, 8, 28, 10, 0), agora)).toBe('há 3 semanas')
  })

  it('mais antigo que isso, diz a data', () => {
    expect(haQuantoTempo(new Date(2026, 2, 12, 10, 0), agora)).toBe('em 12 de março')
    expect(haQuantoTempo(new Date(2025, 11, 1, 10, 0), agora)).toBe('em 1 de dezembro de 2025')
  })

  it('aceita a data guardada como texto ISO', () => {
    expect(haQuantoTempo(antes(3).toISOString(), agora)).toBe('há 3 minutos')
  })
})
