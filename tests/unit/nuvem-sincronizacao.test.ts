// A sincronização entre aparelhos: cada aparelho com o seu banco e a sua pasta, todos na mesma nuvem
// de mentira (com as regras do banco do Supabase).

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Locator, Obra } from '@nucleo/tipos'
import { Banco } from '../../src/main/banco'
import { Biblioteca, nomeDaCapa } from '../../src/main/biblioteca'
import { Nuvem, type OpcoesDaNuvem } from '../../src/main/nuvem'
import { SemConexaoComANuvem } from '@nucleo/nuvem/remoto'
import { NuvemEmMemoria, type RemotoEmMemoria } from '../fakes/nuvem-em-memoria'
import { epubOrigemDasEspecies, gravarLivrosDeTeste } from '../fixtures/livros'

const SENHA = 'senha-de-teste-123'
const EMAIL = 'ana@burrolandia.test'
const VERMELHA = new Uint8Array(readFileSync(join(__dirname, '../fixtures/capa-vermelha.jpg')))
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8])
const OBRA: Obra = {
  id: 'OL1003040W',
  titulo: 'Dom Casmurro',
  autores: ['Machado de Assis'],
  primeiroAno: 1899,
  edicoes: 80,
  capaId: 647501,
  assuntos: ['Romance'],
  descricao: 'Bentinho e Capitu.',
}
const dormir = (ms: number) => new Promise(pronto => setTimeout(pronto, ms))

/** Uma porta: quem espera por `aberto` só passa depois de `abrir()`. */
function portao() {
  let abrir!: () => void
  const aberto = new Promise<void>(pronto => (abrir = pronto))
  return { aberto, abrir }
}

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
  const livrosDaContaPorEmail = async (email: string) => nuvem.livrosDe(nuvem.contas.get(email)!.conta.id)

  /** Os livros de teste, mais A Origem das Espécies (um terceiro, sem capa). */
  function tresLivros(pasta: string) {
    const livros = gravarLivrosDeTeste(join(pasta, 'origem'))
    const origem = join(pasta, 'origem', 'origem-das-especies.epub')
    writeFileSync(origem, epubOrigemDasEspecies())
    return { ...livros, origem }
  }

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

  it('a posição mais nova que chega avisa (o leitor aberto vai para ela); a mais velha, não', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livroA = await importar(a, livros.domCasmurro)
    a.banco.salvarPosicao(livroA.id, posicao('/6/4', 0.2))
    await entrar(a, { criar: true })
    await entrar(b)
    const chegaram: [string, string | undefined][] = []
    b.nuvem.quandoChegarPosicao((id, p) => chegaram.push([id, p.locations.cfi]))
    const [livroB] = b.banco.listarLivros()

    a.banco.salvarPosicao(livroA.id, posicao('/6/12', 0.5))
    await a.nuvem.sincronizar()
    await b.nuvem.sincronizar()
    expect(chegaram).toEqual([[livroB.id, '/6/12']])

    // B leu depois: a posição de A que voltar (mais velha) não muda nada em B.
    b.banco.salvarPosicao(livroB.id, posicao('/6/20', 0.7))
    await b.nuvem.sincronizar()
    await a.nuvem.sincronizar()
    await b.nuvem.sincronizar()
    expect(chegaram).toHaveLength(1)
    expect(a.banco.obterLivro(livroA.id)!.posicao?.locations.cfi).toBe('/6/20')
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

  it('outro aparelho com o mesmo arquivo, importado depois, não passa por cima da obra e da capa que você escolheu', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livroA = await importar(a, livros.domCasmurro)
    a.banco.salvarObra(OBRA)
    a.banco.ligarAoCatalogo(livroA.id, { obraId: OBRA.id, edicaoId: null, reconhecimento: 'escolhido' })
    await a.biblioteca.salvarCapa(livroA.id, VERMELHA, { escolhida: true })
    await entrar(a, { criar: true })
    await dormir(5)
    // B importa o mesmo arquivo depois (o título e a capa vêm do arquivo; o catálogo não achou nada).
    const copia = join(b.pasta, 'dom.epub')
    copyFileSync(livros.domCasmurro, copia)
    const livroB = await importar(b, copia)
    b.banco.ligarAoCatalogo(livroB.id, { obraId: null, edicaoId: null, reconhecimento: 'sem-resultado' })
    await entrar(b)
    await a.nuvem.sincronizar()

    const escolhido = { obraId: OBRA.id, reconhecimento: 'escolhido', capa: nomeDaCapa(VERMELHA) }
    expect((await livrosDaConta(a))[0]).toMatchObject(escolhido)
    expect(a.banco.obterLivro(livroA.id)).toMatchObject(escolhido)
    expect(b.banco.obterLivro(livroB.id)).toMatchObject(escolhido)
    expect(existsSync(join(a.pasta, 'dados', 'livros', livroA.id, nomeDaCapa(VERMELHA)!))).toBe(true)
  })

  it('o reconhecimento automático passa por cima do que veio no arquivo, mas não da sua escolha', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livroA = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    const [livroB] = b.banco.listarLivros()
    // Em B, você diz que não é nenhuma destas; depois, A reconhece sozinho pelo título.
    b.banco.ligarAoCatalogo(livroB.id, { obraId: null, edicaoId: null, reconhecimento: 'recusado' })
    await b.nuvem.sincronizar()
    a.banco.salvarObra(OBRA)
    a.banco.ligarAoCatalogo(livroA.id, { obraId: OBRA.id, edicaoId: null, reconhecimento: 'titulo' })
    await a.nuvem.sincronizar()
    await b.nuvem.sincronizar()
    expect((await livrosDaConta(a))[0]).toMatchObject({ obraId: null, reconhecimento: 'recusado' })
    expect(a.banco.obterLivro(livroA.id)).toMatchObject({ obraId: null, reconhecimento: 'recusado' })
  })

  it('trocar a capa enquanto a anterior sobe: a nova fica, aqui e depois na nuvem', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    const porta = portao()
    const enviar = a.remoto.enviar.bind(a.remoto)
    a.remoto.enviar = async (bucket, caminho, bytes, tipo) => {
      if (bucket === 'capas') await porta.aberto
      return enviar(bucket, caminho, bytes, tipo)
    }
    await a.biblioteca.salvarCapa(livro.id, VERMELHA, { escolhida: true })
    const ciclo = a.nuvem.sincronizar()
    await dormir(30)
    await a.biblioteca.salvarCapa(livro.id, PNG, { escolhida: true })
    porta.abrir()
    await ciclo
    await a.nuvem.sincronizar()

    const png = nomeDaCapa(PNG)!
    expect(a.banco.obterLivro(livro.id)!.capa).toBe(png)
    expect(existsSync(join(a.pasta, 'dados', 'livros', livro.id, png))).toBe(true)
    expect((await livrosDaConta(a))[0].capa).toBe(png)
    expect([...nuvem.arquivos.keys()].filter(chave => chave.startsWith('capas/'))).toEqual([
      expect.stringMatching(new RegExp(`/${png.replace('.', '\\.')}$`)),
    ])
  })

  it('escolher a capa enquanto a de outro aparelho desce: a escolhida por último vale nos dois', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livroA = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    const [livroB] = b.banco.listarLivros()
    await a.biblioteca.salvarCapa(livroA.id, VERMELHA, { escolhida: true })
    await a.nuvem.sincronizar()

    const porta = portao()
    const baixar = b.remoto.baixar.bind(b.remoto)
    b.remoto.baixar = async (bucket, caminho) => {
      const bytes = await baixar(bucket, caminho)
      if (bucket === 'capas') await porta.aberto
      return bytes
    }
    const ciclo = b.nuvem.sincronizar()
    await dormir(30)
    await b.biblioteca.salvarCapa(livroB.id, PNG, { escolhida: true })
    porta.abrir()
    await ciclo
    await b.nuvem.sincronizar()
    await a.nuvem.sincronizar()

    const png = nomeDaCapa(PNG)!
    expect(b.banco.obterLivro(livroB.id)!.capa).toBe(png)
    expect(existsSync(join(b.pasta, 'dados', 'livros', livroB.id, png))).toBe(true)
    expect(a.banco.obterLivro(livroA.id)!.capa).toBe(png)
  })

  it('se apagar da nuvem falhar, a lápide fica e a capa e o arquivo saem na próxima vez', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    expect(nuvem.arquivos.size).toBe(2)
    await a.biblioteca.remover(livro.id)
    const apagar = a.remoto.apagar.bind(a.remoto)
    let semConexao = true
    a.remoto.apagar = async (bucket, caminhos) => {
      if (semConexao) throw new SemConexaoComANuvem()
      return apagar(bucket, caminhos)
    }
    await a.nuvem.sincronizar()
    expect(a.banco.lapides()).toHaveLength(1)
    expect(nuvem.arquivos.size).toBe(2)
    semConexao = false
    await a.nuvem.sincronizar()
    expect(a.banco.lapides()).toEqual([])
    expect(nuvem.arquivos.size).toBe(0)
  })

  it('um livro que a nuvem recusa continua pendente, sem travar os outros, e sobe quando mudar', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const bom = await importar(a, livros.domCasmurro)
    const ruim = await importar(a, livros.memorias)
    await entrar(a, { criar: true })
    const guardar = a.remoto.guardar.bind(a.remoto)
    a.remoto.guardar = async lista => {
      if (lista.some(l => l.hash === ruim.hashSha256)) throw new Error('A nuvem recusou (23514)')
      return guardar(lista)
    }
    a.banco.salvarPosicao(bom.id, posicao('/6/4', 0.3))
    a.banco.salvarPosicao(ruim.id, posicao('/6/6', 0.4))
    await a.nuvem.sincronizar()
    expect(a.nuvem.estado().pendentes).toBe(1)
    expect((await livrosDaConta(a)).find(l => l.hash === bom.hashSha256)!.posicao?.locations.cfi).toBe('/6/4')

    a.remoto.guardar = guardar
    await a.nuvem.sincronizar()
    expect(a.nuvem.estado().pendentes).toBe(1)
    a.banco.salvarPosicao(ruim.id, posicao('/6/8', 0.5))
    await a.nuvem.sincronizar()
    expect(a.nuvem.estado().pendentes).toBe(0)
    expect((await livrosDaConta(a)).find(l => l.hash === ruim.hashSha256)!.posicao?.locations.cfi).toBe('/6/8')
  })

  it('trocar a capa num aparelho troca no outro; a capa antiga sai da nuvem', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)

    // Você troca a capa em A (a do arquivo, que já estava na nuvem, perde para a escolhida).
    await a.biblioteca.salvarCapa(livro.id, VERMELHA, { escolhida: true })
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

  it('sair da conta: os livros que vieram da nuvem saem (baixados ou não), os adicionados aqui ficam', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = tresLivros(a.pasta)
    await importar(a, livros.domCasmurro)
    await importar(a, livros.origem)
    await entrar(a, { criar: true })
    const deB = join(b.pasta, 'memorias.epub')
    copyFileSync(livros.memorias, deB)
    await importar(b, deB)
    await entrar(b)
    expect(b.banco.listarLivros()).toHaveLength(3)
    const baixado = b.banco.listarLivros().find(l => l.titulo === 'Dom Casmurro')!
    expect(await b.nuvem.baixar(baixado.id)).toMatchObject({ ok: true })

    await b.nuvem.sair()
    expect(b.nuvem.estado()).toMatchObject({ conta: null, problema: null })
    expect(b.banco.listarLivros().map(l => l.titulo)).toEqual(['Memórias Póstumas de Brás Cubas'])
    expect(await b.remoto.conta()).toBeNull()
  })

  it('sair manda antes o que falta subir: um livro removido agora não volta ao entrar de novo', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livro = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await a.biblioteca.remover(livro.id)
    await a.nuvem.sair()
    expect((await livrosDaContaPorEmail(EMAIL))[0].removidoEm).toEqual(expect.any(String))
    await entrar(a)
    expect(a.banco.listarLivros()).toEqual([])
  })

  it('sair durante a primeira leitura da nuvem: nada da conta entra depois', async () => {
    const a = aparelho()
    const livros = tresLivros(a.pasta)
    for (const livro of [livros.domCasmurro, livros.origem, livros.memorias]) await importar(a, livro)
    await entrar(a, { criar: true })

    const b = aparelho({ fimDoCiclo: 20 })
    const capa = portao()
    let esperando = 0
    const baixar = b.remoto.baixar.bind(b.remoto)
    b.remoto.baixar = async (bucket, caminho) => {
      const bytes = await baixar(bucket, caminho)
      if (bucket === 'capas') {
        esperando++
        await capa.aberto
      }
      return bytes
    }
    expect(await b.nuvem.entrar(EMAIL, SENHA)).toMatchObject({ ok: true })
    await dormir(30)
    // A leitura parou no meio, baixando a capa do primeiro livro.
    expect(esperando).toBe(1)
    await b.nuvem.sair()
    capa.abrir()
    await dormir(50)
    expect(b.banco.listarLivros()).toEqual([])
    expect(b.banco.lerPreferencia('nuvem:marcador')).toBeUndefined()
  })

  it('saindo e entrando com outra conta durante a leitura, chegam só os livros da conta nova', async () => {
    const a = aparelho()
    const livros = tresLivros(a.pasta)
    await importar(a, livros.domCasmurro)
    await importar(a, livros.origem)
    await entrar(a, { criar: true })
    const c = aparelho()
    const deC = join(c.pasta, 'memorias.epub')
    copyFileSync(livros.memorias, deC)
    await importar(c, deC)
    await entrar(c, { criar: true, email: 'carla@burrolandia.test' })
    const carla = nuvem.contas.get('carla@burrolandia.test')!.conta.id
    const daCarla = () => [...nuvem.arquivos.keys()].filter(chave => chave.includes(carla)).sort()
    const arquivosDaCarla = daCarla()

    const b = aparelho({ fimDoCiclo: 20 })
    const capa = portao()
    const baixar = b.remoto.baixar.bind(b.remoto)
    let esperando = 0
    b.remoto.baixar = async (bucket, caminho) => {
      const bytes = await baixar(bucket, caminho)
      if (bucket === 'capas' && ++esperando === 1) await capa.aberto
      return bytes
    }
    await b.nuvem.entrar(EMAIL, SENHA)
    await dormir(30)
    expect(esperando).toBe(1)
    await b.nuvem.sair()
    expect(await b.nuvem.entrar('carla@burrolandia.test', SENHA)).toMatchObject({ ok: true })
    capa.abrir()
    await b.nuvem.sincronizar()
    expect(b.banco.listarLivros().map(l => l.titulo)).toEqual(['Memórias Póstumas de Brás Cubas'])
    expect(b.banco.lerPreferencia('nuvem:marcador')).toMatchObject({ conta: carla })
    // Nada da conta de Carla foi apagado pelo ciclo da conta anterior.
    expect(daCarla()).toEqual(arquivosDaCarla)
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

  it('além do espaço da conta, o arquivo fica só neste aparelho, e o app diz quantos ficaram', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const comCapa = await importar(a, livros.domCasmurro)
    await importar(a, livros.memorias)
    const capa = statSync(join(a.pasta, 'dados', 'livros', comCapa.id, comCapa.capa!)).size
    const [maior, menor] = [statSync(livros.domCasmurro).size, statSync(livros.memorias).size].sort((x, y) => y - x)
    // Cabe a capa e só um dos dois arquivos, qualquer que suba primeiro.
    nuvem.limitePorConta = capa + maior + menor - 1
    await entrar(a, { criar: true })
    expect([...nuvem.arquivos.keys()].filter(chave => chave.startsWith('arquivos/'))).toHaveLength(1)
    expect(a.nuvem.estado()).toMatchObject({ semEspaco: 1, problema: null })
  })

  it('um arquivo que a nuvem recusa não segura os outros, e espera antes de tentar de novo', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const recusado = await importar(a, livros.domCasmurro)
    await importar(a, livros.memorias)
    const envios: string[] = []
    const enviar = a.remoto.enviar.bind(a.remoto)
    a.remoto.enviar = async (bucket, caminho, bytes, tipo) => {
      if (bucket === 'arquivos') envios.push(caminho)
      if (bucket === 'arquivos' && caminho.startsWith(recusado.hashSha256)) throw new Error('A nuvem recusou o arquivo (413)')
      return enviar(bucket, caminho, bytes, tipo)
    }
    await entrar(a, { criar: true })
    expect([...nuvem.arquivos.keys()].filter(chave => chave.startsWith('arquivos/'))).toHaveLength(1)
    expect(a.nuvem.estado().problema).toBeNull()
    await a.nuvem.sincronizar()
    expect(envios.filter(caminho => caminho.startsWith(recusado.hashSha256))).toHaveLength(1)
  })

  it('entre um arquivo e outro, a posição que mudou sobe sem esperar os outros arquivos', async () => {
    const a = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const lido = await importar(a, livros.domCasmurro)
    await importar(a, livros.memorias)
    const portas = [portao(), portao()]
    let envios = 0
    const enviar = a.remoto.enviar.bind(a.remoto)
    a.remoto.enviar = async (bucket, caminho, bytes, tipo) => {
      if (bucket === 'arquivos') await portas[envios++]?.aberto
      return enviar(bucket, caminho, bytes, tipo)
    }
    expect(await a.nuvem.criarConta(EMAIL, SENHA)).toMatchObject({ ok: true })
    while (envios < 1) await dormir(5)
    // Você lê enquanto o primeiro arquivo sobe; o segundo vai demorar.
    a.banco.salvarPosicao(lido.id, posicao('/6/10', 0.4))
    portas[0].abrir()
    while (envios < 2) await dormir(5)
    expect((await livrosDaConta(a)).find(l => l.hash === lido.hashSha256)!.posicao?.locations.cfi).toBe('/6/10')
    portas[1].abrir()
    await a.nuvem.sincronizar()
  })

  it('o mesmo arquivo adicionado aqui completa o livro que estava só na nuvem (grande demais para subir)', async () => {
    const a = aparelho({ limiteDoArquivo: 100 })
    const b = aparelho({ limiteDoArquivo: 100 })
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    const [naNuvem] = b.banco.listarLivros()
    const baixar = await b.nuvem.baixar(naNuvem.id)
    expect(baixar).toMatchObject({ ok: false, mensagem: expect.stringContaining('mais que os 0 MB que a nuvem aceita por arquivo') })

    const copia = join(b.pasta, 'dom.epub')
    copyFileSync(livros.domCasmurro, copia)
    const resultado = await b.biblioteca.importar(copia)
    expect(resultado).toMatchObject({ tipo: 'adicionado', livro: { id: naNuvem.id, estado: 'pronto' } })
    // Agora é deste computador: saindo da conta, ele fica.
    await b.nuvem.sair()
    expect(b.banco.listarLivros().map(l => l.id)).toEqual([naNuvem.id])
  })

  it('removido em outro aparelho enquanto desce: o download diz isso, e nada fica para trás', async () => {
    const a = aparelho()
    const b = aparelho()
    const livros = gravarLivrosDeTeste(join(a.pasta, 'origem'))
    const livroA = await importar(a, livros.domCasmurro)
    await entrar(a, { criar: true })
    await entrar(b)
    const [livroB] = b.banco.listarLivros()
    const porta = portao()
    let descendo = false
    const baixar = b.remoto.baixar.bind(b.remoto)
    b.remoto.baixar = async (bucket, caminho) => {
      const bytes = await baixar(bucket, caminho)
      if (bucket === 'arquivos') {
        descendo = true
        await porta.aberto
      }
      return bytes
    }
    const download = b.nuvem.baixar(livroB.id)
    while (!descendo) await dormir(5)
    await a.biblioteca.remover(livroA.id)
    await a.nuvem.sincronizar()
    await b.nuvem.sincronizar()
    porta.abrir()
    expect(await download).toMatchObject({ ok: false, mensagem: 'Este livro foi removido em outro aparelho enquanto descia.' })
    expect(b.banco.listarLivros()).toEqual([])
    expect(existsSync(join(b.pasta, 'dados', 'livros', livroB.id))).toBe(false)
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
