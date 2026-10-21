import { describe, expect, it } from 'vitest'
import { encontrarIsbns, isbnValido, paraIsbn13 } from '@nucleo/catalogo/isbn'

describe('isbnValido', () => {
  it('confere o dígito verificador do ISBN-13 e do ISBN-10 (inclusive com X)', () => {
    expect(isbnValido('9788508145607')).toBe(true)
    expect(isbnValido('9788508145608')).toBe(false)
    expect(isbnValido('0306406152')).toBe(true)
    expect(isbnValido('080442957X')).toBe(true)
    expect(isbnValido('0804429571')).toBe(false)
    expect(isbnValido('12345')).toBe(false)
  })
})

describe('paraIsbn13', () => {
  it('limpa hífens e espaços e converte o ISBN-10 para 13', () => {
    expect(paraIsbn13('978-85-08-14560-7')).toBe('9788508145607')
    expect(paraIsbn13('0-306-40615-2')).toBe('9780306406157')
    expect(paraIsbn13('0-8044-2957-x')).toBe('9780804429573')
  })

  it('devolve null para o que não é ISBN', () => {
    expect(paraIsbn13('978-85-08-14560-8')).toBeNull()
    expect(paraIsbn13('não é isbn')).toBeNull()
  })
})

describe('encontrarIsbns', () => {
  it('acha os ISBNs da página de créditos de um livro', () => {
    const creditos = `Copyright © 2019 by Fulano
      Dados Internacionais de Catalogação na Publicação (CIP)
      ISBN 978-85-359-2951-5
      ISBN-10: 0-306-40615-2
      1. Romance brasileiro I. Título.`
    expect(encontrarIsbns(creditos)).toEqual(['9788535929515', '9780306406157'])
  })

  it('acha o ISBN-13 sem a palavra ISBN, só se o dígito verificador bater', () => {
    expect(encontrarIsbns('Edição de bolso · 978 85 08 14560 7 · impresso no Brasil')).toEqual(['9788508145607'])
    expect(encontrarIsbns('Pedido 978 85 08 14560 8 · telefone 9780000000000')).toEqual([])
  })

  it('junta o ISBN que o PDF quebrou em pedaços ("978-85- 359…")', () => {
    expect(encontrarIsbns('ISBN 978-85- 359-2951-5')).toEqual(['9788535929515'])
  })

  it('não repete o mesmo livro escrito de dois jeitos', () => {
    expect(encontrarIsbns('ISBN 0-306-40615-2 (ISBN-13: 978-0-306-40615-7)')).toEqual(['9780306406157'])
  })
})
