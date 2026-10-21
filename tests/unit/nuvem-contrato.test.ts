// O contrato da nuvem: as mesmas situações contra a nuvem de mentira (sempre) e contra o Supabase de
// verdade (só com BURROLANDIA_NUVEM_AO_VIVO=1, SUPABASE_REF e SUPABASE_TOKEN: cria contas de teste
// @burrolandia.test e apaga tudo no fim). Assim as regras do banco e as dos testes não se desencontram.

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { LivroNaNuvem, LivroParaGuardar } from '../../src/nucleo/nuvem/regras'
import { ErroDaConta, NaoEstaNaNuvem, SessaoTerminada, type Remoto } from '../../src/nucleo/nuvem/remoto'
import { PROJETO_DA_NUVEM, RemotoSupabase } from '../../src/main/supabase'
import { NuvemEmMemoria } from '../fakes/nuvem-em-memoria'

const AO_VIVO =
  process.env.BURROLANDIA_NUVEM_AO_VIVO === '1' && !!process.env.SUPABASE_REF && !!process.env.SUPABASE_TOKEN

const SENHA = 'senha-de-teste-123'
const novoEmail = () => `teste-contrato-${randomUUID().slice(0, 8)}@burrolandia.test`
const novoHash = () => createHash('sha256').update(randomBytes(16)).digest('hex')
/** Uma hora no passado (as do futuro a nuvem limita a 5 minutos). */
const ha = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString()
const mesmaHora = (a: string | null, b: string | null) => (a && b ? Date.parse(a) === Date.parse(b) : a === b)

function livro(hash: string, campos: Partial<LivroParaGuardar> = {}): LivroParaGuardar {
  return {
    hash,
    titulo: 'Dom Casmurro',
    autores: ['Machado de Assis'],
    idioma: 'pt-BR',
    formato: 'epub',
    tamanhoBytes: 123456,
    identificadores: { isbn: ['9788535910667'], outros: [] },
    obraId: null,
    edicaoId: null,
    reconhecimento: 'pendente',
    obra: null,
    edicao: null,
    metadadosEm: ha(60),
    capa: null,
    capaEm: null,
    arquivo: null,
    posicao: null,
    progresso: 0,
    posicaoEm: null,
    adicionadoEm: ha(120),
    abertoEm: null,
    novo: true,
    ...campos,
  }
}

const posicao = (cfi: string, total: number) => ({
  href: 'texto.xhtml',
  type: 'application/xhtml+xml',
  locations: { cfi, totalProgression: total },
})

const doLivro = (lista: LivroNaNuvem[], hash: string) => {
  const achado = lista.find(l => l.hash === hash)
  if (!achado) throw new Error(`O livro ${hash.slice(0, 8)} não voltou`)
  return achado
}

interface Ambiente {
  /** Uma conta nova, já com sessão. */
  novaConta(): Promise<Remoto>
  /** Outro aparelho com a mesma conta (outra sessão). */
  outroAparelho(email: string): Promise<Remoto>
}

function contrato(nome: string, ambiente: () => Ambiente) {
  describe(`contrato da nuvem: ${nome}`, () => {
    let remoto: Remoto
    let email: string

    beforeAll(async () => {
      remoto = await ambiente().novaConta()
      email = (await remoto.conta())!.email
    })

    test('guarda um livro novo e devolve como ficou', async () => {
      const hash = novoHash()
      const enviado = livro(hash, { posicao: posicao('/6/4!/4/2', 0.3), progresso: 0.3, posicaoEm: ha(10) })
      const ficou = doLivro(await remoto.guardar([enviado]), hash)
      expect(ficou).toMatchObject({ titulo: 'Dom Casmurro', autores: ['Machado de Assis'], formato: 'epub', progresso: 0.3 })
      expect(ficou.posicao).toEqual(enviado.posicao)
      expect(ficou.tamanhoBytes).toBe(123456)
      expect(ficou.removidoEm).toBeNull()
      expect(mesmaHora(ficou.posicaoEm, enviado.posicaoEm)).toBe(true)
      expect(ficou.atualizadoEm).toBeTruthy()
    })

    test('a posição mais recente vence, venha de onde vier', async () => {
      const hash = novoHash()
      await remoto.guardar([livro(hash, { posicao: posicao('/6/10', 0.5), progresso: 0.5, posicaoEm: ha(10) })])
      const antiga = await remoto.guardar([livro(hash, { posicao: posicao('/6/2', 0.1), progresso: 0.1, posicaoEm: ha(30), novo: false })])
      expect(doLivro(antiga, hash).posicao?.locations.cfi).toBe('/6/10')
      const nova = await remoto.guardar([livro(hash, { posicao: posicao('/6/20', 0.8), progresso: 0.8, posicaoEm: ha(5), novo: false })])
      expect(doLivro(nova, hash)).toMatchObject({ progresso: 0.8, posicao: { locations: { cfi: '/6/20' } } })
      // Sem posição (outro aparelho que nem abriu o livro), a que está lá fica.
      const sem = await remoto.guardar([livro(hash, { novo: false })])
      expect(doLivro(sem, hash).posicao?.locations.cfi).toBe('/6/20')
    })

    test('título, autores e obra: a mudança mais recente vence', async () => {
      const hash = novoHash()
      await remoto.guardar([livro(hash, { metadadosEm: ha(50) })])
      const obra = { id: 'OL1003040W', titulo: 'Dom Casmurro', autores: ['Machado de Assis'], primeiroAno: 1899, edicoes: 80, capaId: 123, assuntos: ['Romance'], descricao: 'Bentinho e Capitu.' }
      const reconhecido = await remoto.guardar([
        livro(hash, { metadadosEm: ha(20), obraId: 'OL1003040W', reconhecimento: 'titulo', obra, novo: false }),
      ])
      expect(doLivro(reconhecido, hash)).toMatchObject({ obraId: 'OL1003040W', reconhecimento: 'titulo', obra })
      const atrasado = await remoto.guardar([livro(hash, { metadadosEm: ha(40), titulo: 'Outro título', novo: false })])
      expect(doLivro(atrasado, hash)).toMatchObject({ titulo: 'Dom Casmurro', obraId: 'OL1003040W' })
    })

    test('capa: a escolhida por último vence; sem capa não apaga a que está lá', async () => {
      const hash = novoHash()
      await remoto.guardar([livro(hash, { capa: 'capa-aaaaaaaaaaaa.jpg', capaEm: ha(30) })])
      const nula = await remoto.guardar([livro(hash, { capa: null, capaEm: ha(1), novo: false })])
      expect(doLivro(nula, hash).capa).toBe('capa-aaaaaaaaaaaa.jpg')
      const antiga = await remoto.guardar([livro(hash, { capa: 'capa-bbbbbbbbbbbb.png', capaEm: ha(40), novo: false })])
      expect(doLivro(antiga, hash).capa).toBe('capa-aaaaaaaaaaaa.jpg')
      const nova = await remoto.guardar([livro(hash, { capa: 'capa-cccccccccccc.webp', capaEm: ha(2), novo: false })])
      expect(doLivro(nova, hash).capa).toBe('capa-cccccccccccc.webp')
    })

    test('o arquivo entra uma vez e fica; aberto_em fica com o mais recente', async () => {
      const hash = novoHash()
      const aberto = ha(10)
      await remoto.guardar([livro(hash, { abertoEm: aberto })])
      const comArquivo = doLivro(await remoto.guardar([livro(hash, { arquivo: `${hash}.epub`, abertoEm: ha(30), novo: false })]), hash)
      expect(comArquivo.arquivo).toBe(`${hash}.epub`)
      expect(mesmaHora(comArquivo.abertoEm, aberto)).toBe(true)
      const semArquivo = await remoto.guardar([livro(hash, { arquivo: null, novo: false })])
      expect(doLivro(semArquivo, hash).arquivo).toBe(`${hash}.epub`)
    })

    test('um relógio adiantado não ganha todas: a hora passa no máximo 5 minutos da do servidor', async () => {
      const hash = novoHash()
      const daqui1Ano = new Date(Date.now() + 365 * 24 * 3600_000).toISOString()
      const ficou = doLivro(await remoto.guardar([livro(hash, { posicao: posicao('/6/4', 0.2), progresso: 0.2, posicaoEm: daqui1Ano })]), hash)
      expect(Date.parse(ficou.posicaoEm!)).toBeLessThan(Date.now() + 6 * 60_000)
      // Horas vazias continuam vazias.
      expect(ficou.capaEm).toBeNull()
      expect(ficou.abertoEm).toBeNull()
    })

    test('a lápide apaga o que é pessoal; um aparelho atrasado não traz o livro de volta; um livro novo traz', async () => {
      const hash = novoHash()
      await remoto.guardar([livro(hash, { posicao: posicao('/6/4', 0.4), progresso: 0.4, posicaoEm: ha(10), capa: 'capa-aaaaaaaaaaaa.jpg', capaEm: ha(10), arquivo: `${hash}.epub` })])
      const removido = doLivro(await remoto.remover([{ hash, removidoEm: ha(5) }]), hash)
      expect(removido.removidoEm).toBeTruthy()
      expect(removido).toMatchObject({ titulo: '(removido)', autores: [], posicao: null, capa: null, arquivo: null, obra: null })

      const atrasado = doLivro(await remoto.guardar([livro(hash, { posicao: posicao('/6/8', 0.6), posicaoEm: ha(1), novo: false })]), hash)
      expect(atrasado.removidoEm).toBeTruthy()
      expect(atrasado.posicao).toBeNull()

      const deNovo = doLivro(await remoto.guardar([livro(hash, { adicionadoEm: ha(1), titulo: 'Dom Casmurro (de novo)', novo: true })]), hash)
      expect(deNovo.removidoEm).toBeNull()
      expect(deNovo.titulo).toBe('Dom Casmurro (de novo)')
    })

    test('a lápide não remove um livro adicionado depois da hora da remoção', async () => {
      const hash = novoHash()
      await remoto.guardar([livro(hash, { adicionadoEm: ha(5) })])
      const ficou = doLivro(await remoto.remover([{ hash, removidoEm: ha(30) }]), hash)
      expect(ficou.removidoEm).toBeNull()
      expect(ficou.titulo).toBe('Dom Casmurro')
    })

    test('o que mudou desde uma hora, de página em página', async () => {
      const inicio = (await remoto.mudancas(null, null, 1000)).at(-1)
      const hashes = [novoHash(), novoHash(), novoHash()]
      for (const hash of hashes) await remoto.guardar([livro(hash)])
      const vistos: string[] = []
      let desde = inicio?.atualizadoEm ?? null
      let depoisDe = inicio?.hash ?? null
      for (let pagina = 0; pagina < 10; pagina++) {
        const lote = await remoto.mudancas(desde, depoisDe, 2)
        if (!lote.length) break
        expect(lote.length).toBeLessThanOrEqual(2)
        vistos.push(...lote.map(l => l.hash))
        desde = lote.at(-1)!.atualizadoEm
        depoisDe = lote.at(-1)!.hash
      }
      expect(vistos).toEqual(hashes)
    })

    test('capa e arquivo: enviar, baixar, listar e apagar', async () => {
      const hash = novoHash()
      const imagem = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...randomBytes(64)])
      await remoto.enviar('capas', `${hash}/capa-aaaaaaaaaaaa.jpg`, imagem, 'image/jpeg')
      expect(await remoto.baixar('capas', `${hash}/capa-aaaaaaaaaaaa.jpg`)).toEqual(imagem)
      expect(await remoto.listar('capas', hash)).toEqual(['capa-aaaaaaaaaaaa.jpg'])
      const epub = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...randomBytes(256)])
      await remoto.enviar('arquivos', `${hash}.epub`, epub, 'application/epub+zip')
      // Enviar de novo (uma tentativa repetida) não falha.
      await remoto.enviar('arquivos', `${hash}.epub`, epub, 'application/epub+zip')
      expect(await remoto.baixar('arquivos', `${hash}.epub`)).toEqual(epub)
      await remoto.apagar('capas', [`${hash}/capa-aaaaaaaaaaaa.jpg`])
      await remoto.apagar('arquivos', [`${hash}.epub`])
      // A listagem é a palavra final; o download de um arquivo recém-apagado ainda pode vir do cache
      // do Supabase por alguns segundos (inofensivo: os nomes mudam com o conteúdo).
      expect(await remoto.listar('capas', hash)).toEqual([])
      await expect(remoto.baixar('arquivos', `${novoHash()}.epub`)).rejects.toBeInstanceOf(NaoEstaNaNuvem)
    })

    test('o uso conta os livros e os bytes guardados', async () => {
      const uso = await remoto.uso()
      expect(uso.livros).toBeGreaterThan(0)
      expect(uso.bytes).toBeGreaterThanOrEqual(0)
    })

    test('outra conta não vê nem mexe nos seus livros e arquivos', async () => {
      const hash = novoHash()
      await remoto.guardar([livro(hash, { titulo: 'Só meu' })])
      await remoto.enviar('arquivos', `${hash}.pdf`, new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]), 'application/pdf')
      const outra = await ambiente().novaConta()
      expect((await outra.mudancas(null, null, 1000)).map(l => l.hash)).not.toContain(hash)
      await expect(outra.baixar('arquivos', `${hash}.pdf`)).rejects.toBeInstanceOf(NaoEstaNaNuvem)
      // Guardar o mesmo arquivo na outra conta cria o livro dela, sem tocar no seu.
      await outra.guardar([livro(hash, { titulo: 'Da outra conta' })])
      expect(doLivro(await remoto.mudancas(null, null, 1000), hash).titulo).toBe('Só meu')
      await remoto.apagar('arquivos', [`${hash}.pdf`])
      await outra.sair()
    })

    test('a mesma conta em outro aparelho vê os livros; sair encerra só a sessão daquele aparelho', async () => {
      const hash = novoHash()
      await remoto.guardar([livro(hash)])
      const outro = await ambiente().outroAparelho(email)
      expect((await outro.mudancas(null, null, 1000)).map(l => l.hash)).toContain(hash)
      await outro.sair()
      expect(await outro.conta()).toBeNull()
      await expect(outro.mudancas(null, null, 10)).rejects.toBeInstanceOf(SessaoTerminada)
      expect((await remoto.mudancas(null, null, 1000)).map(l => l.hash)).toContain(hash)
    })

    test('erros da conta: e-mail já usado, senha errada, senha curta', async () => {
      const tentativa = await ambiente().novaConta()
      const emailDaTentativa = (await tentativa.conta())!.email
      await tentativa.sair()
      await expect(tentativa.criarConta(emailDaTentativa, SENHA)).rejects.toMatchObject({ codigo: 'conta-existe' })
      await expect(tentativa.entrar(emailDaTentativa, 'outra-senha-999')).rejects.toMatchObject({ codigo: 'senha-errada' })
      const curta = tentativa.criarConta(novoEmail(), 'curta')
      await expect(curta).rejects.toBeInstanceOf(ErroDaConta)
      await expect(curta).rejects.toMatchObject({ codigo: 'senha-fraca' })
    })
  })
}

// A nuvem de mentira: sempre.
const memoria = new NuvemEmMemoria()
contrato('em memória', () => ({
  novaConta: async () => {
    const remoto = memoria.remoto()
    await remoto.criarConta(novoEmail(), SENHA)
    return remoto
  },
  outroAparelho: async email => {
    const remoto = memoria.remoto()
    await remoto.entrar(email, SENHA)
    return remoto
  },
}))

// O Supabase de verdade: só quando pedido, e apaga as contas de teste no fim.
if (AO_VIVO) {
  const abertos: RemotoSupabase[] = []
  const novoRemoto = () => {
    const sessao = new Map<string, string>()
    const remoto = new RemotoSupabase(PROJETO_DA_NUVEM, {
      getItem: chave => sessao.get(chave) ?? null,
      setItem: (chave, valor) => void sessao.set(chave, valor),
      removeItem: chave => void sessao.delete(chave),
    })
    abertos.push(remoto)
    return remoto
  }

  /** Uma conta nova com o cliente do Supabase direto, para tentar o que o app nunca tenta. */
  const cru = async () => {
    const email = novoEmail()
    const cliente = createClient(PROJETO_DA_NUVEM.url, PROJETO_DA_NUVEM.chave, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await cliente.auth.signUp({ email, password: SENHA })
    if (error || !data.user) throw error ?? new Error('Sem usuário')
    return { email, id: data.user.id, cliente }
  }

  const linhaMinima = (hash: string) => ({
    hash_sha256: hash,
    titulo: 'Intruso',
    formato_original: 'pdf',
    tamanho_bytes: 10,
    metadados_em: ha(1),
    adicionado_em: ha(1),
  })

  /** SQL no projeto, pelo Management API (só para arrumar depois dos testes). */
  const sql = async <T>(consulta: string): Promise<T[]> => {
    const resposta = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_REF}/database/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.SUPABASE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: consulta }),
    })
    if (!resposta.ok) throw new Error(`O Management API respondeu ${resposta.status}: ${await resposta.text()}`)
    return (await resposta.json()) as T[]
  }

  // No fim, nada das contas de teste fica na nuvem: os arquivos que um teste interrompido deixou são
  // apagados pela própria conta (a senha é a dos testes), e as contas saem (os livros vão junto).
  afterAll(async () => {
    for (const remoto of abertos) await remoto.parar()
    const sobras = await sql<{ email: string; bucket_id: string; name: string }>(
      `select u.email, o.bucket_id, o.name from storage.objects o
       join auth.users u on (storage.foldername(o.name))[1] = u.id::text
       where u.email like 'teste-contrato-%@burrolandia.test'`,
    )
    for (const email of new Set(sobras.map(s => s.email))) {
      const cliente = createClient(PROJETO_DA_NUVEM.url, PROJETO_DA_NUVEM.chave, { auth: { persistSession: false, autoRefreshToken: false } })
      await cliente.auth.signInWithPassword({ email, password: SENHA })
      for (const bucket of ['capas', 'arquivos']) {
        const nomes = sobras.filter(s => s.email === email && s.bucket_id === bucket).map(s => s.name)
        if (nomes.length) await cliente.storage.from(bucket).remove(nomes)
      }
      await cliente.auth.signOut({ scope: 'local' })
    }
    await sql("delete from auth.users where email like 'teste-contrato-%@burrolandia.test'")
    const restantes = await sql<{ total: number }>(
      `select count(*)::int as total from storage.objects o
       where not exists (select 1 from auth.users u where (storage.foldername(o.name))[1] = u.id::text)`,
    )
    expect(restantes[0].total).toBe(0)
  })

  contrato('Supabase', () => ({
    novaConta: async () => {
      const remoto = novoRemoto()
      await remoto.criarConta(novoEmail(), SENHA)
      return remoto
    },
    outroAparelho: async email => {
      const remoto = novoRemoto()
      await remoto.entrar(email, SENHA)
      return remoto
    },
  }))

  describe('só no Supabase', () => {
    test('a RLS: uma conta não lê, não muda e não cria nada na pasta ou nos livros de outra', async () => {
      const contaA = await cru()
      const contaB = await cru()
      const hash = novoHash()
      const remotoA = novoRemoto()
      await remotoA.entrar(contaA.email, SENHA)
      await remotoA.guardar([livro(hash, { titulo: 'Da conta A' })])
      await remotoA.enviar('arquivos', `${hash}.pdf`, new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9]), 'application/pdf')

      const b = contaB.cliente
      const baixar = await b.storage.from('arquivos').download(`${contaA.id}/${hash}.pdf`)
      expect(baixar.error).toBeTruthy()
      const lista = await b.storage.from('arquivos').list(contaA.id)
      expect(lista.data ?? []).toEqual([])
      const enviar = await b.storage.from('arquivos').upload(`${contaA.id}/${novoHash()}.pdf`, new Uint8Array([0x25, 0x50]), { contentType: 'application/pdf' })
      expect(enviar.error).toBeTruthy()
      const apagar = await b.storage.from('arquivos').remove([`${contaA.id}/${hash}.pdf`])
      expect(apagar.data ?? []).toEqual([])
      expect(await remotoA.baixar('arquivos', `${hash}.pdf`)).toHaveLength(6)

      const ler = await b.from('livros').select('*').eq('usuario_id', contaA.id)
      expect(ler.data ?? []).toEqual([])
      const mudar = await b.from('livros').update({ titulo: 'Invadido' }).eq('usuario_id', contaA.id).select()
      expect(mudar.data ?? []).toEqual([])
      const criar = await b.from('livros').insert({ ...linhaMinima(novoHash()), usuario_id: contaA.id })
      expect(criar.error).toBeTruthy()
      const apagarLinha = await b.from('livros').delete().eq('usuario_id', contaA.id).select()
      expect(apagarLinha.data ?? []).toEqual([])
      expect(doLivro(await remotoA.mudancas(null, null, 1000), hash).titulo).toBe('Da conta A')

      // Sem conta (só a chave publicável), nada.
      const anonimo = createClient(PROJETO_DA_NUVEM.url, PROJETO_DA_NUVEM.chave, { auth: { persistSession: false } })
      expect((await anonimo.from('livros').select('*')).data ?? []).toEqual([])
      expect((await anonimo.rpc('livros_desde', {})).error).toBeTruthy()
      expect((await anonimo.storage.from('arquivos').download(`${contaA.id}/${hash}.pdf`)).error).toBeTruthy()

      await remotoA.apagar('arquivos', [`${hash}.pdf`])
      for (const conta of [contaA, contaB]) await conta.cliente.auth.signOut({ scope: 'local' })
    })

    test('caminhos fora do padrão do app e pastas de outras contas são recusados', async () => {
      const remoto = novoRemoto()
      await remoto.criarConta(novoEmail(), SENHA)
      await expect(remoto.enviar('arquivos', 'qualquer-coisa.txt', new Uint8Array([1, 2, 3]), 'application/pdf')).rejects.toThrow()
      await expect(
        remoto.enviar('capas', `${novoHash()}/foto.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 1]), 'image/jpeg'),
      ).rejects.toThrow()
      // O tipo também conta: um executável com nome de PDF não entra.
      await expect(
        remoto.enviar('arquivos', `${novoHash()}.pdf`, new Uint8Array([0x4d, 0x5a]), 'application/x-msdownload'),
      ).rejects.toThrow()
    })
  })
}
