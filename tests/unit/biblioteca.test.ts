import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { Banco } from '../../src/main/banco'
import { Biblioteca, tituloDoNomeDoArquivo } from '../../src/main/biblioteca'
import { escreverEpub } from '@nucleo/epub/escrever'

const capa = strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="6" height="9"/>')

const epub = (titulo = 'Dom Casmurro') =>
  escreverEpub({
    identificador: `urn:uuid:${crypto.randomUUID()}`,
    titulo,
    autores: ['Machado de Assis'],
    idioma: 'pt-BR',
    capa: { bytes: capa, tipo: 'image/svg+xml' },
    capitulos: [{ titulo: 'Do título', corpo: '<p>Uma noite destas…</p>' }],
  })

describe('tituloDoNomeDoArquivo', () => {
  it('limpa extensão, sublinhados e hifens', () => {
    expect(tituloDoNomeDoArquivo('C:\\Livros\\darwin_a-origem-das-especies.epub')).toBe('darwin a origem das especies')
    expect(tituloDoNomeDoArquivo('/livros/Dom Casmurro (1).pdf')).toBe('Dom Casmurro (1)')
  })
})

describe('Biblioteca', () => {
  let pasta: string
  let banco: Banco
  let biblioteca: Biblioteca

  const arquivo = (nome: string, bytes: Uint8Array) => {
    const caminho = join(pasta, nome)
    writeFileSync(caminho, bytes)
    return caminho
  }

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'burrolandia-biblioteca-'))
    banco = new Banco(join(pasta, 'burrolandia.db'))
    biblioteca = new Biblioteca(join(pasta, 'dados'), banco)
  })

  afterEach(() => {
    banco.fechar()
    rmSync(pasta, { recursive: true, force: true })
  })

  it('adiciona um EPUB: copia o arquivo, guarda a capa e registra o livro', async () => {
    const bytes = epub()
    const resultado = await biblioteca.importar(arquivo('dom.epub', bytes))
    expect(resultado.tipo).toBe('adicionado')
    if (resultado.tipo !== 'adicionado') return

    const { livro } = resultado
    expect(livro).toMatchObject({
      titulo: 'Dom Casmurro',
      autores: ['Machado de Assis'],
      idioma: 'pt-BR',
      formatoOriginal: 'epub',
      arquivoOriginal: 'original.epub',
      arquivoLeitura: 'original.epub',
      capa: 'capa.svg',
      estado: 'pronto',
      tamanhoBytes: bytes.length,
    })
    expect(readFileSync(biblioteca.caminhoDoArquivo(livro.id, 'original.epub')!)).toEqual(Buffer.from(bytes))
    expect(readFileSync(biblioteca.caminhoDoArquivo(livro.id, 'capa.svg')!)).toEqual(Buffer.from(capa))
    expect(biblioteca.listar().map(l => l.id)).toEqual([livro.id])
  })

  it('conta o andamento da importação', async () => {
    const etapas: string[] = []
    await biblioteca.importar(arquivo('dom.epub', epub()), a => etapas.push(a.etapa))
    expect(etapas).toEqual(['lendo', 'guardando'])
  })

  it('reconhece o mesmo arquivo trazido de novo', async () => {
    const bytes = epub()
    const primeiro = await biblioteca.importar(arquivo('a.epub', bytes))
    const segundo = await biblioteca.importar(arquivo('copia.epub', bytes))
    expect(segundo.tipo).toBe('repetido')
    if (primeiro.tipo === 'adicionado' && segundo.tipo === 'repetido') expect(segundo.livro.id).toBe(primeiro.livro.id)
    expect(biblioteca.listar()).toHaveLength(1)
  })

  it('usa o nome do arquivo quando o EPUB não tem título', async () => {
    const semTitulo = zipSync({
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="p.opf"/></rootfiles></container>'),
      'p.opf': strToU8('<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest/><spine/></package>'),
    })
    const resultado = await biblioteca.importar(arquivo('memorias_postumas.epub', semTitulo))
    expect(resultado.tipo === 'adicionado' && resultado.livro.titulo).toBe('memorias postumas')
  })

  it('recusa um tipo de arquivo que não é EPUB nem PDF', async () => {
    const resultado = await biblioteca.importar(arquivo('notas.txt', strToU8('texto solto')))
    expect(resultado).toMatchObject({ tipo: 'erro', codigo: 'formato-nao-suportado' })
  })

  it('recusa um EPUB quebrado sem deixar lixo na pasta de dados', async () => {
    const quebrado = zipSync({ 'qualquer.txt': strToU8('não sou epub') })
    const resultado = await biblioteca.importar(arquivo('quebrado.epub', quebrado))
    expect(resultado).toMatchObject({ tipo: 'erro', codigo: 'arquivo-invalido' })
    const livros = join(pasta, 'dados', 'livros')
    expect(existsSync(livros) ? readdirSync(livros) : []).toEqual([])
  })

  it('avisa quando o arquivo não existe mais', async () => {
    const resultado = await biblioteca.importar(join(pasta, 'sumiu.epub'))
    expect(resultado).toMatchObject({ tipo: 'erro', codigo: 'arquivo-inacessivel' })
  })

  it('remove o livro e a pasta dele', async () => {
    const resultado = await biblioteca.importar(arquivo('dom.epub', epub()))
    if (resultado.tipo !== 'adicionado') throw new Error('deveria ter adicionado')
    const pastaDoLivro = join(pasta, 'dados', 'livros', resultado.livro.id)
    expect(existsSync(pastaDoLivro)).toBe(true)
    await biblioteca.remover(resultado.livro.id)
    expect(existsSync(pastaDoLivro)).toBe(false)
    expect(biblioteca.listar()).toEqual([])
  })

  it('não entrega arquivos fora da pasta do livro', async () => {
    const resultado = await biblioteca.importar(arquivo('dom.epub', epub()))
    if (resultado.tipo !== 'adicionado') throw new Error('deveria ter adicionado')
    expect(biblioteca.caminhoDoArquivo(resultado.livro.id, '../../burrolandia.db')).toBeNull()
    expect(biblioteca.caminhoDoArquivo('../dados', 'original.epub')).toBeNull()
    expect(biblioteca.caminhoDoArquivo(resultado.livro.id, 'nao-existe.epub')).toBeNull()
  })
})
