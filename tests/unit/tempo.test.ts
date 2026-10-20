import { describe, expect, it } from 'vitest'
import { duracaoEmPalavras, faltaNoCapitulo, saudacao } from '@nucleo/tempo'

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
