// A sincronização entre aparelhos: cada aparelho com o seu banco e a sua pasta, todos na mesma nuvem
// de mentira (com as regras do banco do Supabase).

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Locator, Obra } from '@nucleo/tipos'
import { Banco } from '../../src/main/banco'
import { Biblioteca, nomeDaCapa } from '../../src/main/biblioteca'
import { Nuvem, type OpcoesDaNuvem } from '../../src/main/nuvem'
import { NuvemEmMemoria, type RemotoEmMemoria } from '../fakes/nuvem-em-memoria'
import { gravarLivrosDeTeste } from '../fixtures/livros'

const SENHA = 'senha-de-teste-123'
const EMAIL = 'ana@burrolandia.test'
const VERMELHA = new Uint8Array(readFileSync(join(__dirname, '../fixtures/capa-vermelha.jpg')))
const dormir = (ms: number) => new Promise(pronto => setTimeout(pronto, ms))

const posicao = (cfi: string, total: number): Locator => ({
  href: 'texto.xhtml',
  type: 'application/xhtml+xml',
  locations: { cfi, totalProgression: total },
})

interface Aparelho {
  pasta: string
  banco: Banco
  biblioteca: Biblioteca
  remoto: RemotoEmMemoria
  nuvem: Nuvem
  /** Cada aviso da sincronização: true quando a biblioteca mudou. */
  avisos: boolean[]
}

describe('Nuvem: a sincronização entre aparelhos', () => {
  let nuvem: NuvemEmMemoria
  const aparelhos: Aparelho[] = []

  function aparelho(opcoes: OpcoesDaNuvem = {}): Aparelho {
    const pasta = mkdtempSync(join(tmpdir(), 'burrolandia-aparelho-'))
    const banco = new Banco(join(pasta, 'burrolandia.db'))
    const biblioteca = new Biblioteca(join(pasta, 'dados'), banco)
    const remoto = nuvem.remoto()
    const avisos: boolean[] = []
    const sincronia = new Nuvem(banco, biblioteca, remoto, (_, livros) => avisos.push(livros), {
      espera: 3_600_000,
      intervalo: 3_600_000,
      deNovo: 3_600_000,
      ...opcoes,
    })
    const novo = { pasta, banco, biblioteca, remoto, nuvem: sincronia, avisos }
    aparelhos.push(novo)
    return novo
  }

  async function importar(a: Aparelho, caminho: string) {
    const resultado = await a.biblioteca.importar(caminho)
    if (resultado.tipo !== 'adicionado') throw new Error(`não importou: ${resultado.tipo}`)
    return resultado.livro
  }

  /** Entra (ou cria a conta) e espera a primeira sincronização terminar. */
  async function entrar(a: Aparelho, { criar = false, email = EMAIL } = {}) {
    const resultado = criar ? await a.nuvem.criarConta(email, SENHA) : await a.nuvem.entrar(email, SENHA)
    expect(resultado).toMatchObject({ ok: true })
    await a.nuvem.sincronizar()
  }

  const livrosDaConta = async (a: Aparelho) => nuvem.livrosDe((await a.remoto.conta())!.id)

  beforeEach(() => {
    nuvem = new NuvemEmMemoria()
  })

  afterEach(async () => {
    for (const a of aparelhos.splice(0)) {
      await a.nuvem.parar()
      a.banco.fechar()
      rmSync(a.pasta, { recursive: true, force: true })
    }
  })

  it('ao entrar, a biblioteca sobe: o livro, a capa, o arquivo e a posição', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    a.banco.salvarPosicao(livro.id, posicao('/6/4', 0.25))
    await entrar(a, { criar: true })

    expect(a.nuvem.estado()).toMatchObject({ conta: { email: EMAIL }, pendentes: 0, problema: null, sincronizando: false })
    const [naNuvem] = await livrosDaConta(a)
    expect(naNuvem).toMatchObject({
      titulo: 'Dom Casmurro',
      autores: ['Machado de Assis'],
      arquivo: `${livro.hashSha256}.epub`,
      progresso: 0.25,
      capa: expect.stringMatching(/^capa-[0-9a-f]{12}\.svg$/),
    })
    // A capa daqui passou a ter o nome do conteúdo, o mesmo da nuvem.
    expect(a.banco.obterLivro(livro.id)?.capa).toBe(naNuvem.capa)
    expect(a.biblioteca.caminhoDoArquivo(livro.id, naNuvem.capa!)).not.toBeNull()
    expect(nuvem.arquivos.get(`arquivos/${(await a.remoto.conta())!.id}/${livro.hashSha256}.epub`)?.bytes).toEqual(
      new Uint8Array(readFileSync(livros.domCasmurro)),
    )
  })

  it('outro aparelho recebe o livro "na nuvem", com capa e posição, e baixa o arquivo para ler', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const original = await importar(a, livros.domCasmurro)
    a.banco.salvarPosicao(original.id, posicao('/6/8', 0.5))
    await entrar(a, { criar: true })
    await entrar(b)

    const [recebido] = b.banco.listarLivros()
    expect(recebido).toMatchObject({
      estado: 'na-nuvem',
      titulo: 'Dom Casmurro',
      hashSha256: original.hashSha256,
      posicao: posicao('/6/8', 0.5),
      progresso: 0.5,
      capa: a.banco.obterLivro(original.id)?.capa,
    })
    expect(b.biblioteca.caminhoDoArquivo(recebido.id, recebido.capa!)).not.toBeNull()
    expect(b.avisos).toContain(true)

    const andamentos: string[] = []
    const baixado = await b.nuvem.baixar(recebido.id, a => andamentos.push(a.etapa))
    expect(baixado).toMatchObject({ ok: true, livro: { estado: 'pronto', arquivoLeitura: 'original.epub', posicao: posicao('/6/8', 0.5) } })
    expect(andamentos[0]).toBe('baixando')
    expect(readFileSync(b.biblioteca.caminhoDoArquivo(recebido.id, 'original.epub')!)).toEqual(readFileSync(livros.domCasmurro))
    // Baixar não é mudança: nada volta para a nuvem.
    expect(b.nuvem.estado().pendentes).toBe(0)
  })

  it('um PDF da nuvem é adaptado ao baixar, como na importação', async () => {
    const a = aparelho()
    const b = aparelho()
    mkdirSync(join(a.pasta, 'origem'), { recursive: true })
    const pdf = join(a.pasta, 'origem', 'capa-com-margem.pdf')
    copyFileSync(join(__dirname, '../fixtures/pdf/capa-com-margem.pdf'), pdf)
    await importar(a, pdf)
    await entrar(a, { criar: true })
    await entrar(b)
    const [recebido] = b.banco.listarLivros()
    expect(recebido).toMatchObject({ estado: 'na-nuvem', formatoOriginal: 'pdf' })
    const baixado = await b.nuvem.baixar(recebido.id)
    expect(baixado).toMatchObject({ ok: true, livro: { estado: 'pronto', arquivoOriginal: 'original.pdf', arquivoLeitura: 'leitura.epub' } })
  })

  it('a posição mais recente vence, nos dois aparelhos', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livroA = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    const livroB = b.banco.listarLivros()[0]

    a.banco.salvarPosicao(livroA.id, posicao('/6/10', 0.3))
    await dormir(5)
    b.banco.salvarPosicao(livroB.id, posicao('/6/20', 0.6))
    await a.nuvem.sincronizar()
    await b.nuvem.sincronizar()
    await a.nuvem.sincronizar()
    expect(a.banco.obterLivro(livroA.id)?.posicao?.locations.cfi).toBe('/6/20')
    expect(b.banco.obterLivro(livroB.id)?.posicao?.locations.cfi).toBe('/6/20')
    expect(a.nuvem.estado().pendentes + b.nuvem.estado().pendentes).toBe(0)
  })

  it('a obra reconhecida num aparelho chega ao outro, com a descrição', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    const obra: Obra = {
      id: 'OL1003040W',
      titulo: 'Dom Casmurro',
      autores: ['Machado de Assis'],
      primeiroAno: 1899,
      edicoes: 80,
      capaId: 647501,
      assuntos: ['Romance'],
      descricao: 'Bentinho e Capitu.',
    }
    a.banco.salvarObra(obra)
    a.banco.ligarAoCatalogo(livro.id, { obraId: obra.id, edicaoId: null, reconhecimento: 'titulo' })
    await entrar(a, { criar: true })
    await entrar(b)
    expect(b.banco.listarLivros()[0]).toMatchObject({ obraId: obra.id, reconhecimento: 'titulo' })
    expect(b.banco.obterObra(obra.id)).toEqual(obra)
  })

  it('remover num aparelho remove no outro e apaga da nuvem a capa e o arquivo', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    expect(b.banco.listarLivros()).toHaveLength(1)

    await a.biblioteca.remover(livro.id)
    await a.nuvem.sincronizar()
    const [lapide] = await livrosDaConta(a)
    expect(lapide).toMatchObject({ titulo: '(removido)', removidoEm: expect.any(String), capa: null, arquivo: null })
    expect([...nuvem.arquivos.keys()].filter(chave => chave.includes(livro.hashSha256))).toEqual([])

    await b.nuvem.sincronizar()
    expect(b.banco.listarLivros()).toEqual([])
    expect(b.banco.lapides()).toEqual([])
  })

  it('um aparelho atrasado não traz de volta o livro removido; um aparelho novo com o mesmo livro traz', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livroA = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    const livroB = b.banco.listarLivros()[0]

    await a.biblioteca.remover(livroA.id)
    await a.nuvem.sincronizar()
    // B ainda não sabe, e lê o livro: a posição sobe, mas o livro continua removido (e sai de B).
    b.banco.salvarPosicao(livroB.id, posicao('/6/4', 0.1))
    await b.nuvem.sincronizar()
    expect((await livrosDaConta(a))[0].removidoEm).toBeTruthy()
    expect(b.banco.listarLivros()).toEqual([])

    // C acabou de entrar e tem o mesmo livro no computador: ele vai para a conta como livro novo.
    const c = aparelho()
    const copia = join(c.pasta, 'dom.epub')
    copyFileSync(livros.domCasmurro, copia)
    await importar(c, copia)
    await entrar(c)
    expect((await livrosDaConta(a))[0]).toMatchObject({ removidoEm: null, titulo: 'Dom Casmurro' })
    expect(c.banco.listarLivros()).toHaveLength(1)
    await a.nuvem.sincronizar()
    expect(a.banco.listarLivros()).toMatchObject([{ titulo: 'Dom Casmurro', estado: 'na-nuvem' }])
  })

  it('trocar a capa num aparelho troca no outro; a capa antiga sai da nuvem', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)

    await a.biblioteca.salvarCapa(livro.id, VERMELHA)
    await a.nuvem.sincronizar()
    const nome = nomeDaCapa(VERMELHA)!
    expect(await a.remoto.listar('capas', livro.hashSha256)).toEqual([nome])
    await b.nuvem.sincronizar()
    const recebido = b.banco.listarLivros()[0]
    expect(recebido.capa).toBe(nome)
    expect(readFileSync(b.biblioteca.caminhoDoArquivo(recebido.id, nome)!)).toEqual(Buffer.from(VERMELHA))
  })

  it('sem conexão nada se perde: a mudança espera e sobe quando a conexão volta', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    nuvem.foraDoAr = true
    a.banco.salvarPosicao(livro.id, posicao('/6/12', 0.4))
    await a.nuvem.sincronizar()
    expect(a.nuvem.estado()).toMatchObject({ problema: 'sem-conexao', pendentes: 1, conta: { email: EMAIL } })
    nuvem.foraDoAr = false
    await a.nuvem.sincronizar()
    expect(a.nuvem.estado()).toMatchObject({ problema: null, pendentes: 0 })
    expect((await livrosDaConta(a))[0].posicao?.locations.cfi).toBe('/6/12')
  })

  it('com a sessão encerrada em outro lugar, o app pede para entrar de novo e os livros daqui ficam', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    nuvem.encerrarSessoes()
    a.banco.salvarPosicao(livro.id, posicao('/6/14', 0.45))
    await a.nuvem.sincronizar()
    expect(a.nuvem.estado()).toMatchObject({ conta: null, problema: 'sessao-terminada' })
    expect(a.banco.listarLivros()).toHaveLength(1)
    // Entrando de novo, o que ficou pendente sobe.
    await entrar(a)
    expect((await livrosDaConta(a))[0].posicao?.locations.cfi).toBe('/6/14')
  })

  it('sair da conta: os livros que só estavam na nuvem saem, os deste aparelho ficam', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    const deB = join(b.pasta, 'memorias.epub')
    copyFileSync(livros.memorias, deB)
    await importar(b, deB)
    await entrar(b)
    expect(b.banco.listarLivros()).toHaveLength(2)

    await b.nuvem.sair()
    expect(b.nuvem.estado()).toMatchObject({ conta: null, problema: null })
    expect(b.banco.listarLivros().map(l => l.titulo)).toEqual(['Memórias Póstumas de Brás Cubas'])
    expect(await b.remoto.conta()).toBeNull()
  })

  it('entrando com outra conta, o que era da conta anterior não vai junto', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    expect(b.banco.listarLivros()).toMatchObject([{ estado: 'na-nuvem' }])
    await b.nuvem.sair()
    await b.nuvem.criarConta('bruno@burrolandia.test', SENHA)
    await b.nuvem.sincronizar()
    expect(b.banco.listarLivros()).toEqual([])
    expect(await livrosDaConta(b)).toEqual([])
  })

  it('arquivo maior que o limite fica só neste aparelho (o livro sobe, o arquivo não)', async () => {
    const a = aparelho({ limiteDoArquivo: 100 })
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    expect((await livrosDaConta(a))[0]).toMatchObject({ titulo: 'Dom Casmurro', arquivo: null })
    expect(a.nuvem.estado().grandesDemais).toBe(1)
  })

  it('baixar recusa um arquivo que não confere com o livro', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    const chave = `arquivos/${(await a.remoto.conta())!.id}/${livro.hashSha256}.epub`
    nuvem.arquivos.set(chave, { bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), tipo: 'application/epub+zip' })
    const recebido = b.banco.listarLivros()[0]
    expect(await b.nuvem.baixar(recebido.id)).toMatchObject({ ok: false, mensagem: expect.stringContaining('não confere') })
    expect(b.banco.obterLivro(recebido.id)?.estado).toBe('na-nuvem')
  })

  it('sincronizar de novo sem mudanças não manda nada nem muda a biblioteca', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    nuvem.pedidos.length = 0
    a.avisos.length = 0
    await a.nuvem.sincronizar()
    expect(nuvem.pedidos.filter(p => p !== 'mudancas')).toEqual([])
    expect(a.avisos.at(-1)).toBe(false)
  })

  it('ninguém entra sem conta: sem sessão, nada sobe e nada desce', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    await importar(a, livros.domCasmurro)
    await a.nuvem.sincronizar()
    expect(nuvem.pedidos).toEqual([])
    expect(await a.nuvem.criarConta('x@burrolandia.test', 'curta')).toMatchObject({ ok: false, codigo: 'senha-fraca' })
    expect(await a.nuvem.entrar('ninguem@burrolandia.test', SENHA)).toMatchObject({ ok: false, codigo: 'senha-errada' })
    expect(a.nuvem.estado().conta).toBeNull()
  })
})
