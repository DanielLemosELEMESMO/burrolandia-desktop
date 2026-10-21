import { describe, expect, it } from 'vitest'
import type { Livro } from '@nucleo/tipos'
import { escolherDestaque, livrosRecentes, organizarLivros } from '@nucleo/organizar'

let contador = 0
const livro = (parcial: Partial<Livro> = {}): Livro => ({
  id: `00000000-0000-4000-8000-${String(++contador).padStart(12, '0')}`,
  titulo: 'Sem título',
  autores: [],
  idioma: 'pt-BR',
  formatoOriginal: 'epub',
  arquivoOriginal: 'original.epub',
  arquivoLeitura: 'original.epub',
  capa: null,
  hashSha256: String(contador),
  tamanhoBytes: 1000,
  identificadores: { isbn: [], outros: [] },
  estado: 'pronto',
  posicao: null,
  progresso: 0,
  adicionadoEm: '2026-10-01T10:00:00.000Z',
  abertoEm: null,
  atualizadoEm: '2026-10-01T10:00:00.000Z',
  obraId: null,
  edicaoId: null,
  reconhecimento: 'pendente',
  ...parcial,
})

const titulos = (livros: Livro[]) => livros.map(l => l.titulo)

describe('organizarLivros', () => {
  const domCasmurro = livro({ titulo: 'Dom Casmurro', autores: ['Machado de Assis'], abertoEm: '2026-10-19T10:00:00.000Z', progresso: 0.4 })
  const origem = livro({ titulo: 'A Origem das Espécies', autores: ['Charles Darwin'], formatoOriginal: 'pdf', adicionadoEm: '2026-10-20T08:00:00.000Z' })
  const iracema = livro({ titulo: 'Iracema', autores: ['José de Alencar'], abertoEm: '2026-10-15T10:00:00.000Z', progresso: 0.9 })
  const semAutor = livro({ titulo: 'Apostila', formatoOriginal: 'pdf', adicionadoEm: '2026-09-01T10:00:00.000Z' })
  const todos = [domCasmurro, origem, iracema, semAutor]

  it('busca por título ou autor, sem ligar para acentos nem maiúsculas', () => {
    expect(titulos(organizarLivros(todos, { busca: 'jose alencar' }))).toEqual(['Iracema'])
    expect(titulos(organizarLivros(todos, { busca: 'ESPECIES' }))).toEqual(['A Origem das Espécies'])
    expect(titulos(organizarLivros(todos, { busca: 'machado casmurro' }))).toEqual(['Dom Casmurro'])
    expect(organizarLivros(todos, { busca: 'tolkien' })).toEqual([])
  })

  it('filtra pelo formato do arquivo', () => {
    expect(titulos(organizarLivros(todos, { formato: 'pdf', ordem: 'titulo' }))).toEqual(['Apostila', 'A Origem das Espécies'])
    expect(titulos(organizarLivros(todos, { formato: 'epub', ordem: 'titulo' }))).toEqual(['Dom Casmurro', 'Iracema'])
  })

  it('ordena por título como numa biblioteca, sem contar o artigo do começo', () => {
    expect(titulos(organizarLivros(todos, { ordem: 'titulo' }))).toEqual([
      'Apostila',
      'Dom Casmurro',
      'Iracema',
      'A Origem das Espécies',
    ])
  })

  it('ordena por autor, com os livros sem autor no fim', () => {
    expect(titulos(organizarLivros(todos, { ordem: 'autor' }))).toEqual([
      'A Origem das Espécies',
      'Iracema',
      'Dom Casmurro',
      'Apostila',
    ])
  })

  it('ordena pelos mais recentes: o que você abriu ou adicionou por último vem primeiro', () => {
    expect(titulos(organizarLivros(todos, { ordem: 'recentes' }))).toEqual([
      'A Origem das Espécies',
      'Dom Casmurro',
      'Iracema',
      'Apostila',
    ])
  })

  it('ordena pelo progresso, do mais adiantado ao que ainda não começou', () => {
    expect(titulos(organizarLivros(todos, { ordem: 'progresso' }))).toEqual([
      'Iracema',
      'Dom Casmurro',
      'A Origem das Espécies',
      'Apostila',
    ])
  })

  it('não mexe na lista que recebeu', () => {
    const copia = [...todos]
    organizarLivros(todos, { ordem: 'titulo' })
    expect(todos).toEqual(copia)
  })
})

describe('escolherDestaque', () => {
  it('continua o livro aberto por último que ainda não terminou', () => {
    const terminado = livro({ titulo: 'Terminado', abertoEm: '2026-10-20T10:00:00.000Z', progresso: 1 })
    const emLeitura = livro({ titulo: 'Em leitura', abertoEm: '2026-10-19T10:00:00.000Z', progresso: 0.3 })
    const antigo = livro({ titulo: 'Antigo', abertoEm: '2026-10-01T10:00:00.000Z', progresso: 0.5 })
    expect(escolherDestaque([antigo, terminado, emLeitura])).toEqual({ livro: emLeitura, continuar: true })
  })

  it('sem leitura em andamento, sugere o livro mais novo que você ainda não abriu', () => {
    const velho = livro({ titulo: 'Velho', adicionadoEm: '2026-09-01T10:00:00.000Z' })
    const novo = livro({ titulo: 'Novo', adicionadoEm: '2026-10-19T10:00:00.000Z' })
    expect(escolherDestaque([velho, novo])).toEqual({ livro: novo, continuar: false })
  })

  it('sem nada para sugerir, não há destaque', () => {
    expect(escolherDestaque([])).toBeNull()
    expect(escolherDestaque([livro({ abertoEm: '2026-10-19T10:00:00.000Z', progresso: 1 })])).toBeNull()
  })
})

describe('livrosRecentes', () => {
  it('lista os mais recentes, sem repetir o destaque', () => {
    const a = livro({ titulo: 'A', adicionadoEm: '2026-10-01T10:00:00.000Z' })
    const b = livro({ titulo: 'B', adicionadoEm: '2026-10-02T10:00:00.000Z', abertoEm: '2026-10-18T10:00:00.000Z' })
    const c = livro({ titulo: 'C', adicionadoEm: '2026-10-03T10:00:00.000Z' })
    expect(titulos(livrosRecentes([a, b, c], b.id, 5))).toEqual(['C', 'A'])
    expect(titulos(livrosRecentes([a, b, c], null, 2))).toEqual(['B', 'C'])
  })
})
