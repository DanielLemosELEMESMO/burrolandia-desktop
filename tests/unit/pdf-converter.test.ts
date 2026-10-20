import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { converterPdfEmEpub } from '@nucleo/pdf/converter'
import { lerEpub } from '@nucleo/epub/ler'

const fixture = (nome: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/pdf', nome)))
const opcoes = { identificador: 'urn:uuid:00000000-0000-4000-8000-000000000000', tituloReserva: 'arquivo sem nome' }

function capitulos(epub: Uint8Array) {
  const arquivos = unzipSync(epub)
  return Object.keys(arquivos)
    .filter(nome => /capitulo-\d+\.xhtml$/.test(nome))
    .sort()
    .map(nome => strFromU8(arquivos[nome]))
}

const paragrafos = (xhtml: string) =>
  [...xhtml.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim())

describe('converterPdfEmEpub', () => {
  it('converte um livro de uma coluna em capítulos, sem cabeçalho nem número de página', async () => {
    const r = await converterPdfEmEpub(fixture('dom-casmurro-uma-coluna.pdf'), opcoes)
    expect(r).toMatchObject({ temTexto: true, titulo: 'Dom Casmurro', idioma: 'pt-BR', paginas: 3, paginasSemTexto: 0 })

    const nav = strFromU8(unzipSync(r.epub!)['OEBPS/nav.xhtml'])
    for (const titulo of ['I. Do título', 'II. Do livro', 'III. A denúncia']) expect(nav).toContain(titulo)
    expect(nav.match(/#pagina-\d+"/g)).toHaveLength(3)

    const [primeiro, segundo] = capitulos(r.epub!)
    const texto = paragrafos(primeiro)
    expect(texto[0]).toMatch(/^Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz/)
    expect(texto).toContain('— Continue, disse eu acordando.')
    expect(texto).toContain('— Já acabei, murmurou ele.')
    expect(primeiro + segundo).not.toContain('Machado de Assis')
    expect(paragrafos(segundo).join(' ')).toContain('dando-lhe o mesmo aspecto')
  })

  it('lê o PDF de duas colunas na ordem: a coluna da esquerda inteira, depois a da direita', async () => {
    const r = await converterPdfEmEpub(fixture('notas-duas-colunas.pdf'), opcoes)
    const texto = capitulos(r.epub!).flatMap(paragrafos)
    expect(texto).toHaveLength(12)
    expect(texto[0]).toMatch(/^A leitura lenta é um hábito/)
    expect(texto[5]).toMatch(/^Estas notas foram escritas/)
    expect(texto[5]).toMatch(/coluna da direita\.$/)
    expect(texto[6]).toMatch(/^A leitura lenta é um hábito/)
  })

  it('reconhece um PDF digitalizado, sem texto para adaptar', async () => {
    const r = await converterPdfEmEpub(fixture('digitalizado.pdf'), opcoes)
    expect(r).toMatchObject({ temTexto: false, epub: null, paginas: 1 })
  })

  it('avisa o andamento página por página', async () => {
    const andamento: [number, number][] = []
    await converterPdfEmEpub(fixture('dom-casmurro-uma-coluna.pdf'), {
      ...opcoes,
      aoAndamento: (atual, total) => andamento.push([atual, total]),
    })
    expect(andamento).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })

  it('limpa caracteres de controle do título, do autor e dos marcadores', async () => {
    const r = await converterPdfEmEpub(fixture('titulo-com-nulo.pdf'), opcoes)
    expect(r).toMatchObject({ titulo: 'Livro de Teste', autores: ['Fulana de Tal'] })
    const arquivos = unzipSync(r.epub!)
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      if (/\.(xhtml|opf)$/.test(nome)) expect(strFromU8(conteudo)).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
    }
    expect(strFromU8(arquivos['OEBPS/nav.xhtml'])).toContain('>Capitulo 1<')
    expect(lerEpub(r.epub!).titulo).toBe('Livro de Teste')
  })

  it('gera um EPUB com os metadados do PDF', async () => {
    const r = await converterPdfEmEpub(fixture('dom-casmurro-uma-coluna.pdf'), opcoes)
    expect(lerEpub(r.epub!)).toMatchObject({ titulo: 'Dom Casmurro', idioma: 'pt-BR' })
  })

  it('aceita as pastas de recursos do pdf.js como o Windows escreve, terminadas em "\\"', async () => {
    const pdfjs = join(__dirname, '../../node_modules/pdfjs-dist')
    const recursos = { pastaDeCmaps: join(pdfjs, 'cmaps') + '\\', pastaDeFontes: join(pdfjs, 'standard_fonts') + '\\' }
    const r = await converterPdfEmEpub(fixture('dom-casmurro-uma-coluna.pdf'), { ...opcoes, recursos })
    expect(r).toMatchObject({ temTexto: true, titulo: 'Dom Casmurro' })
  })
})
