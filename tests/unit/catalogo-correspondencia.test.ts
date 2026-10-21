import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  autoresValidos,
  consultaDeTexto,
  consultasDeTexto,
  escolherObra,
  idiomaDoCatalogo,
  isbnConfere,
  ordenarEdicoes,
} from '@nucleo/catalogo/correspondencia'
import { lerBusca, lerEdicoes } from '@nucleo/catalogo/openlibrary'

const resposta = (nome: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/openlibrary', nome), 'utf8'))
const busca = (nome: string) => lerBusca(resposta(nome))
const domCasmurro = busca('busca-dom-casmurro.json')
const origem = busca('busca-origem-das-especies.json')

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
    expect(escolherObra({ titulo: 'Dom Casmurro', autores: ['Administrator', 'Machado de Assis'] }, domCasmurro)?.obra.id).toBe('OL1003040W')
  })

  it('não aceita um título só parecido', () => {
    expect(escolherObra({ titulo: 'Dom', autores: ['Machado de Assis'] }, domCasmurro)).toBeNull()
    expect(escolherObra({ titulo: 'Dom Casmurro', autores: [] }, [])).toBeNull()
  })
})

describe('escolherObra: na dúvida, não escolhe', () => {
  const tolkien = ['J. R. R. Tolkien']
  const senhorDosAneis = busca('busca-senhor-dos-aneis.json')

  it('o volume de uma série pelo subtítulo, e não o primeiro volume', () => {
    expect(escolherObra({ titulo: 'O Senhor dos Anéis: As Duas Torres', autores: tolkien }, senhorDosAneis)?.obra.id).toBe('OL27479W')
    expect(escolherObra({ titulo: 'O Senhor dos Anéis: O Retorno do Rei', autores: tolkien }, senhorDosAneis)?.obra.id).toBe('OL27455W')
    expect(escolherObra({ titulo: 'O Senhor dos Anéis: A Sociedade do Anel', autores: tolkien }, senhorDosAneis)?.obra.id).toBe('OL27513W')
  })

  it('não escolhe registro de obra sem edições, nem se confunde com a série no subtítulo da edição', () => {
    const sociedade = busca('busca-senhor-dos-aneis-sociedade.json')
    expect(escolherObra({ titulo: 'O Senhor dos Anéis: A Sociedade do Anel', autores: tolkien }, sociedade)?.obra.id).toBe('OL27513W')
    const soOSemEdicoes = sociedade.filter(a => a.obra.edicoes === 0)
    expect(escolherObra({ titulo: 'O Senhor dos Anéis: A Sociedade do Anel', autores: tolkien }, soOSemEdicoes)).toBeNull()
  })

  it('sem subtítulo, fica com a obra cujo título bate inteiro', () => {
    expect(escolherObra({ titulo: 'O Senhor dos Anéis', autores: tolkien }, senhorDosAneis)?.obra.id).toBe('OL27448W')
  })

  it('o subtítulo que o catálogo não tem: não chuta o primeiro volume da série', () => {
    const jogosVorazes = busca('busca-jogos-vorazes.json')
    expect(escolherObra({ titulo: 'Jogos Vorazes: Em Chamas', autores: ['Suzanne Collins'] }, jogosVorazes)).toBeNull()
    expect(escolherObra({ titulo: 'Jogos Vorazes', autores: ['Suzanne Collins'] }, jogosVorazes)?.obra.id).toBe('OL5735363W')
  })

  it('"Série: volume" é reconhecido pelo volume', () => {
    const emChamas = busca('busca-em-chamas.json')
    expect(escolherObra({ titulo: 'Jogos Vorazes: Em Chamas', autores: ['Suzanne Collins'] }, emChamas)?.obra.id).toBe('OL5735360W')
    expect(escolherObra({ titulo: 'Em Chamas (Jogos Vorazes Livro 2)', autores: ['Suzanne Collins'] }, emChamas)?.obra.id).toBe('OL5735360W')
  })

  it('o subtítulo bate com o subtítulo da edição', () => {
    const sapiens = busca('busca-sapiens.json')
    expect(escolherObra({ titulo: 'Sapiens: Uma Breve História da Humanidade', autores: ['Yuval Noah Harari'] }, sapiens)?.obra.id).toBe('OL17075811W')
  })

  it('o número do volume tem que bater', () => {
    expect(escolherObra({ titulo: 'Jogos Vorazes 2', autores: ['Suzanne Collins'] }, busca('busca-jogos-vorazes.json'))).toBeNull()
    expect(escolherObra({ titulo: 'Jogos Vorazes (Vol. 2)', autores: ['Suzanne Collins'] }, busca('busca-jogos-vorazes.json'))).toBeNull()
  })

  it('sem autor que valha, não escolhe: "Relatório" não é o relatório do Pará', () => {
    const relatorio = busca('busca-relatorio.json')
    expect(escolherObra({ titulo: 'Relatório', autores: [] }, relatorio)).toBeNull()
    expect(escolherObra({ titulo: 'Relatório', autores: ['Usuário do Windows'] }, relatorio)).toBeNull()
    expect(escolherObra({ titulo: 'Dom Casmurro', autores: ['Administrator'] }, domCasmurro)).toBeNull()
  })
})

describe('autoresValidos', () => {
  it('deixa de fora o "autor" que o computador ou o programa põe nos metadados', () => {
    const falsos = ['Administrator', 'Windows User', 'Usuário do Windows', 'HP Inc.', 'Lenovo', 'Microsoft Office User']
    falsos.push('aluno2024', 'fulano@exemplo.com', 'Desconhecido', 'x')
    expect(autoresValidos([...falsos, 'Machado de Assis', 'J. R. R. Tolkien', 'Yuval Noah Harari'])).toEqual([
      'Machado de Assis',
      'J. R. R. Tolkien',
      'Yuval Noah Harari',
    ])
  })
})

describe('isbnConfere', () => {
  const de1984 = busca('busca-isbn-9788535914849.json')[0]

  it('o ISBN de um livro citado nas referências não é o do livro', () => {
    expect(isbnConfere({ titulo: 'A distopia na literatura do século XX', autores: ['Fulana de Tal'] }, de1984)).toBe(false)
    expect(isbnConfere({ titulo: 'Dissertação de mestrado', autores: [] }, de1984)).toBe(false)
  })

  it('vale quando o título ou o autor batem', () => {
    expect(isbnConfere({ titulo: '1984', autores: [] }, de1984)).toBe(true)
    expect(isbnConfere({ titulo: 'digitalizado 0001', autores: ['George Orwell'] }, de1984)).toBe(true)
  })
})

describe('consultasDeTexto', () => {
  it('sem subtítulo, uma busca: o título sem o artigo e o primeiro autor que vale', () => {
    expect(consultasDeTexto({ titulo: 'Dom Casmurro', autores: ['Administrator', 'Machado de Assis'] })).toEqual(['Dom Casmurro Machado de Assis'])
    expect(consultasDeTexto({ titulo: 'A Hora da Estrela', autores: ['Clarice Lispector'] })).toEqual(['Hora da Estrela Clarice Lispector'])
  })

  it('com subtítulo: o título inteiro, depois o volume, depois a série', () => {
    expect(consultasDeTexto({ titulo: 'Duna: O Messias de Duna', autores: ['Frank Herbert'] })).toEqual([
      'Duna Messias de Duna Frank Herbert',
      'Messias de Duna Frank Herbert',
      'Duna Frank Herbert',
    ])
  })

  it('deixa de fora a série entre parênteses e o subtítulo que só diz o gênero', () => {
    expect(consultasDeTexto({ titulo: 'Em Chamas (Jogos Vorazes Livro 2)', autores: ['Suzanne Collins'] })).toEqual(['Em Chamas Suzanne Collins'])
    expect(consultasDeTexto({ titulo: 'Dom Casmurro: romance', autores: ['Machado de Assis'] })).toEqual(['Dom Casmurro Machado de Assis'])
    expect(consultasDeTexto({ titulo: 'Iracema - lenda do Ceará', autores: ['José de Alencar'] })).toEqual(['Iracema José de Alencar'])
  })

  it('sem autor que valha, não busca sozinho (o título pode ser só o nome do arquivo)', () => {
    expect(consultasDeTexto({ titulo: 'Relatório', autores: [] })).toEqual([])
    expect(consultasDeTexto({ titulo: 'exame-de-sangue-2026', autores: ['Usuário do Windows'] })).toEqual([])
  })
})

describe('consultaDeTexto (a busca à mão)', () => {
  it('busca pelo título principal e pelo primeiro autor que vale', () => {
    expect(consultaDeTexto({ titulo: 'Dom Casmurro: romance', autores: ['Administrator', 'Machado de Assis'] })).toBe('Dom Casmurro Machado de Assis')
    expect(consultaDeTexto({ titulo: 'Notas sobre a leitura', autores: [] })).toBe('Notas sobre a leitura')
  })

  it('cabe no limite da busca', () => {
    expect(consultaDeTexto({ titulo: 'palavra '.repeat(60), autores: ['Machado de Assis'] }).length).toBeLessThanOrEqual(200)
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
