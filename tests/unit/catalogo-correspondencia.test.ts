import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { consultaDeTexto, escolherObra, idiomaDoCatalogo, ordenarEdicoes } from '@nucleo/catalogo/correspondencia'
import { lerBusca, lerEdicoes } from '@nucleo/catalogo/openlibrary'

const resposta = (nome: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/openlibrary', nome), 'utf8'))
const domCasmurro = lerBusca(resposta('busca-dom-casmurro.json'))
const origem = lerBusca(resposta('busca-origem-das-especies.json'))

describe('escolherObra', () => {
  it('acha Dom Casmurro e, entre as obras repetidas do catálogo, fica com a que tem mais edições', () => {
    expect(escolherObra({ titulo: 'Dom Casmurro', autores: ['Machado de Assis'] }, domCasmurro)?.obra.id).toBe('OL1003040W')
  })

  it('reconhece uma tradução pela edição: A Origem das Espécies é a obra de Darwin, On the Origin of Species', () => {
    const achada = escolherObra({ titulo: 'A Origem das Espécies', autores: ['Charles Darwin'] }, origem)
    expect(achada?.obra).toMatchObject({ id: 'OL515051W', edicoes: 259 })
  })

  it('aceita o título com subtítulo e o nome do autor sem acento', () => {
    expect(escolherObra({ titulo: 'Dom Casmurro: romance', autores: ['Machado de Assís'] }, domCasmurro)?.obra.id).toBe('OL1003040W')
  })

  it('não aceita a obra de outro autor com o mesmo título', () => {
    expect(escolherObra({ titulo: 'Dom Casmurro', autores: ['Fulano de Tal'] }, domCasmurro)).toBeNull()
  })

  it('ignora o "autor" que o programa que gerou o PDF deixou nos metadados', () => {
    expect(escolherObra({ titulo: 'Dom Casmurro', autores: ['Administrator'] }, domCasmurro)?.obra.id).toBe('OL1003040W')
  })

  it('não aceita um título só parecido', () => {
    expect(escolherObra({ titulo: 'Dom', autores: ['Machado de Assis'] }, domCasmurro)).toBeNull()
    expect(escolherObra({ titulo: 'Dom Casmurro', autores: [] }, [])).toBeNull()
  })
})

describe('consultaDeTexto', () => {
  it('busca pelo título principal e pelo primeiro autor que vale', () => {
    expect(consultaDeTexto({ titulo: 'Dom Casmurro: romance', autores: ['Administrator', 'Machado de Assis'] })).toBe('Dom Casmurro Machado de Assis')
    expect(consultaDeTexto({ titulo: 'Notas sobre a leitura', autores: [] })).toBe('Notas sobre a leitura')
  })
})

describe('idiomaDoCatalogo', () => {
  it('traduz o idioma do livro para o código do Open Library', () => {
    expect(idiomaDoCatalogo('pt-BR')).toBe('por')
    expect(idiomaDoCatalogo('en')).toBe('eng')
    expect(idiomaDoCatalogo(null)).toBeNull()
    expect(idiomaDoCatalogo('xx')).toBeNull()
  })
})

describe('ordenarEdicoes', () => {
  it('põe primeiro as edições no idioma do livro, depois as com ISBN, das mais novas às mais velhas', () => {
    const edicoes = ordenarEdicoes(lerEdicoes(resposta('edicoes-OL1003040W.json'), 'OL1003040W'), 'pt-BR')
    const portugues = edicoes.filter(e => e.idiomas.includes('por'))
    expect(edicoes.slice(0, portugues.length)).toEqual(portugues)
    expect(portugues.map(e => e.ano)).toEqual([2019, 2016, 2016, 2013, 1966])
  })
})
