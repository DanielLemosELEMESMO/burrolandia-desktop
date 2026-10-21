import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lerBusca, lerEdicao, lerEdicoes, lerObra, textoSimples } from '@nucleo/catalogo/openlibrary'

const resposta = (nome: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/openlibrary', nome), 'utf8'))

describe('lerBusca', () => {
  it('traduz a busca em obras, cada uma com a edição que a fez aparecer', () => {
    const [primeira] = lerBusca(resposta('busca-dom-casmurro.json'))
    expect(primeira.obra).toMatchObject({
      id: 'OL1003040W',
      titulo: 'Dom Casmurro',
      autores: ['Machado de Assis'],
      primeiroAno: 1900,
      edicoes: 90,
      capaId: 647501,
      descricao: null,
    })
    expect(primeira.obra.assuntos.length).toBeGreaterThan(0)
    expect(primeira.obra.assuntos.length).toBeLessThanOrEqual(12)
    expect(primeira.edicao).toMatchObject({ obraId: 'OL1003040W', titulo: 'Dom Casmurro' })
  })

  it('na busca por ISBN, a edição que aparece é a exata', () => {
    const [achada] = lerBusca(resposta('busca-isbn-9788508145607.json'))
    expect(achada.edicao).toEqual({
      id: 'OL56164313M',
      obraId: 'OL39781935W',
      titulo: 'Dom Casmurro',
      editoras: ['Ática'],
      publicadaEm: '3 dezembro 2019',
      ano: 2019,
      paginas: null,
      idiomas: ['por'],
      isbn: ['9788508145607'],
      capaId: 15231557,
    })
  })

  it('junta o subtítulo ao título, sem repetir, e tira os caracteres de controle dos catálogos', () => {
    const [sapiens] = lerBusca(resposta('busca-sapiens.json'))
    expect(sapiens.edicao?.titulo).toBe('Sapiens: uma breve história da humanidade')
    const senhor = lerBusca(resposta('busca-senhor-dos-aneis.json')).find(a => a.obra.id === 'OL46050132W')
    expect(senhor?.obra.titulo).toBe('O senhor dos anéis')
    expect(senhor?.edicao?.titulo).toBe('O senhor dos anéis: romance')
    // Título que já tem subtítulo não ganha o outro, que é só a série.
    const [sociedade] = lerBusca(resposta('busca-senhor-dos-aneis-sociedade.json'))
    expect(sociedade.edicao?.titulo).toBe('O Senhor dos Anéis: A Sociedade do Anel')
    expect(lerEdicao({ key: '/books/OL1M', works: [{ key: '/works/OL1W' }], title: 'Sapiens: uma breve história', subtitle: 'Uma breve história' })?.titulo).toBe(
      'Sapiens: uma breve história',
    )
  })

  it('pula registros incompletos ou de outro tipo, sem quebrar', () => {
    expect(lerBusca({ docs: [{ key: '/works/OL1W' }, null, { title: 'Sem chave' }, { key: '/authors/OL1A', title: 'Autor' }] })).toEqual([])
    expect(lerBusca('não é JSON de busca')).toEqual([])
  })
})

describe('lerEdicoes e lerEdicao', () => {
  it('traduz a lista de edições de uma obra', () => {
    const edicoes = lerEdicoes(resposta('edicoes-OL1003040W.json'), 'OL1003040W')
    expect(edicoes).toHaveLength(12)
    expect(edicoes.find(e => e.id === 'OL61241820M')).toEqual({
      id: 'OL61241820M',
      obraId: 'OL1003040W',
      titulo: 'Dom Casmurro',
      editoras: ['Penguin-Companhia'],
      publicadaEm: '16/07/2016',
      ano: 2016,
      paginas: 400,
      idiomas: ['por'],
      isbn: ['9788582850350'],
      capaId: 15167286,
    })
  })

  it('uma edição avulsa diz de qual obra ela é', () => {
    const edicao = lerEdicao({
      key: '/books/OL56164313M',
      title: 'Dom Casmurro',
      publishers: ['Ática'],
      publish_date: '3 dezembro 2019',
      number_of_pages: 232,
      isbn_13: ['9788508145607'],
      isbn_10: ['8508145608'],
      covers: [-1, 15231557],
      languages: [{ key: '/languages/por' }],
      works: [{ key: '/works/OL39781935W' }],
    })
    expect(edicao).toMatchObject({ id: 'OL56164313M', obraId: 'OL39781935W', paginas: 232, isbn: ['9788508145607'], capaId: 15231557 })
  })
})

describe('lerObra', () => {
  it('pega a descrição em texto simples e os assuntos', () => {
    const detalhes = lerObra(resposta('obra-OL1003040W.json'))
    expect(detalhes.descricao).toMatch(/^Dom Casmurro, publicado pela primeira vez em 1899/)
    expect(detalhes.descricao).not.toContain('**')
    expect(detalhes.assuntos).toHaveLength(12)
    expect(detalhes.assuntos).toContain('Brazilian literature')
  })

  it('obra sem descrição vira texto vazio (já procurou, não tem)', () => {
    expect(lerObra({ key: '/works/OL1W', title: 'X' }).descricao).toBe('')
  })
})

describe('textoSimples', () => {
  it('tira a marcação do Open Library e o bloco de "contido também em"', () => {
    const descricao = '**Negrito** e um [link](https://example.org).\r\n\r\n----------\r\n**Also contained in:**\r\n[Obras](https://openlibrary.org/works/OL1W)'
    expect(textoSimples(descricao)).toBe('Negrito e um link.')
  })
})
