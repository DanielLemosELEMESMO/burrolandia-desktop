// Um Supabase de mentira, num servidor HTTP local: atende os pedidos que o supabase-js faz (Auth,
// as funções do banco por PostgREST e o Storage), com as regras do banco de verdade (regras.ts, pela
// NuvemEmMemoria). O app aponta para ele por BURROLANDIA_NUVEM; dois apps com pastas de dados
// diferentes são dois aparelhos na mesma conta.

import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { LivroNaNuvem, LivroParaGuardar } from '../../src/nucleo/nuvem/regras'
import { ErroDaConta } from '../../src/nucleo/nuvem/remoto'
import type { Conta } from '../../src/nucleo/tipos'
import { NuvemEmMemoria } from '../fakes/nuvem-em-memoria'

const base64url = (texto: string) => Buffer.from(texto).toString('base64url')

/** Um JWT de mentira (sem assinatura que valha), no formato que o supabase-js lê. */
function token(conta: Conta, expiraEm: number) {
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const corpo = base64url(
    JSON.stringify({ sub: conta.id, email: conta.email, role: 'authenticated', aud: 'authenticated', exp: expiraEm }),
  )
  return `${cabecalho}.${corpo}.${base64url('assinatura')}`
}

const usuario = (conta: Conta) => ({
  id: conta.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: conta.email,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

/** Uma linha da tabela livros, como o PostgREST devolve. */
const linha = (l: LivroNaNuvem) => ({
  hash_sha256: l.hash,
  titulo: l.titulo,
  autores: l.autores,
  idioma: l.idioma,
  formato_original: l.formato,
  tamanho_bytes: l.tamanhoBytes,
  identificadores: l.identificadores,
  obra_id: l.obraId,
  edicao_id: l.edicaoId,
  reconhecimento: l.reconhecimento,
  obra: l.obra,
  edicao: l.edicao,
  metadados_em: l.metadadosEm,
  capa: l.capa,
  capa_em: l.capaEm,
  arquivo: l.arquivo,
  posicao: l.posicao,
  progresso: l.progresso,
  posicao_em: l.posicaoEm,
  adicionado_em: l.adicionadoEm,
  aberto_em: l.abertoEm,
  removido_em: l.removidoEm,
  atualizado_em: l.atualizadoEm,
})

const paraGuardar = (x: Record<string, unknown>): LivroParaGuardar =>
  ({
    hash: x.hash_sha256,
    titulo: x.titulo,
    autores: x.autores ?? [],
    idioma: x.idioma ?? null,
    formato: x.formato_original,
    tamanhoBytes: x.tamanho_bytes,
    identificadores: x.identificadores ?? { isbn: [], outros: [] },
    obraId: x.obra_id ?? null,
    edicaoId: x.edicao_id ?? null,
    reconhecimento: x.reconhecimento ?? 'pendente',
    obra: x.obra ?? null,
    edicao: x.edicao ?? null,
    metadadosEm: x.metadados_em,
    capa: x.capa ?? null,
    capaEm: x.capa_em ?? null,
    arquivo: x.arquivo ?? null,
    posicao: x.posicao ?? null,
    progresso: x.progresso ?? 0,
    posicaoEm: x.posicao_em ?? null,
    adicionadoEm: x.adicionado_em,
    abertoEm: x.aberto_em ?? null,
    novo: x.novo === true,
  }) as LivroParaGuardar

async function corpo(req: IncomingMessage): Promise<Buffer> {
  const partes: Buffer[] = []
  for await (const parte of req) partes.push(parte as Buffer)
  return Buffer.concat(partes)
}

function json(res: ServerResponse, status: number, dados: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(dados))
}

export async function abrirNuvemFalsa() {
  const nuvem = new NuvemEmMemoria()
  /** access_token e refresh_token → conta. */
  const acessos = new Map<string, Conta>()
  const renovacoes = new Map<string, Conta>()
  const pedidos: string[] = []
  /** Uma rede lenta para "o que mudou" (os testes ligam e desligam). */
  const lentidao = { mudancas: 0 }

  const sessao = (conta: Conta) => {
    const expiraEm = Math.floor(Date.now() / 1000) + 3600
    const acesso = token(conta, expiraEm)
    const renovacao = randomUUID()
    acessos.set(acesso, conta)
    renovacoes.set(renovacao, conta)
    return {
      access_token: acesso,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: expiraEm,
      refresh_token: renovacao,
      user: usuario(conta),
    }
  }

  const contaDoPedido = (req: IncomingMessage) => acessos.get((req.headers.authorization ?? '').replace(/^Bearer /i, '')) ?? null

  const erroDaConta = (res: ServerResponse, erro: unknown) => {
    if (!(erro instanceof ErroDaConta)) return json(res, 500, { msg: String(erro) })
    const codigos = {
      'senha-errada': [400, 'invalid_credentials'],
      'conta-existe': [422, 'user_already_exists'],
      'senha-fraca': [422, 'weak_password'],
      'email-invalido': [400, 'email_address_invalid'],
      'muitas-tentativas': [429, 'over_request_rate_limit'],
      'sem-conexao': [503, 'unexpected_failure'],
      falhou: [500, 'unexpected_failure'],
    } as const
    const [status, codigo] = codigos[erro.codigo]
    json(res, status, { error_code: codigo, msg: erro.codigo })
  }

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const caminho = decodeURIComponent(url.pathname)
    pedidos.push(`${req.method} ${caminho}`)
    try {
      // Auth
      if (caminho === '/auth/v1/signup' && req.method === 'POST') {
        const { email, password } = JSON.parse((await corpo(req)).toString())
        return json(res, 200, sessao(nuvem._criarConta(email, password)))
      }
      if (caminho === '/auth/v1/token' && req.method === 'POST') {
        const dados = JSON.parse((await corpo(req)).toString())
        if (url.searchParams.get('grant_type') === 'password') return json(res, 200, sessao(nuvem._entrar(dados.email, dados.password)))
        const conta = renovacoes.get(dados.refresh_token)
        if (!conta) return json(res, 400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
        renovacoes.delete(dados.refresh_token)
        return json(res, 200, sessao(conta))
      }
      if (caminho === '/auth/v1/logout') {
        acessos.delete((req.headers.authorization ?? '').replace(/^Bearer /i, ''))
        res.writeHead(204)
        return res.end()
      }
      if (caminho === '/auth/v1/user') {
        const conta = contaDoPedido(req)
        return conta ? json(res, 200, usuario(conta)) : json(res, 401, { error_code: 'bad_jwt', msg: 'invalid JWT' })
      }

      const conta = contaDoPedido(req)
      // PostgREST: as funções do banco
      if (caminho.startsWith('/rest/v1/rpc/')) {
        if (!conta) return json(res, 401, { code: '42501', message: 'É preciso entrar na conta' })
        const argumentos = JSON.parse((await corpo(req)).toString() || '{}')
        switch (caminho.slice('/rest/v1/rpc/'.length)) {
          case 'guardar_livros':
            return json(res, 200, nuvem._guardar(conta.id, argumentos.itens.map(paraGuardar)).map(linha))
          case 'remover_livros':
            return json(
              res,
              200,
              nuvem
                ._remover(conta.id, argumentos.itens.map((i: { hash_sha256: string; removido_em: string }) => ({ hash: i.hash_sha256, removidoEm: i.removido_em })))
                .map(linha),
            )
          case 'livros_desde':
            if (lentidao.mudancas) await new Promise(pronto => setTimeout(pronto, lentidao.mudancas))
            return json(res, 200, nuvem._mudancas(conta.id, argumentos.desde ?? null, argumentos.depois_de ?? null, argumentos.limite ?? 500).map(linha))
          case 'uso_da_nuvem': {
            const livros = nuvem.livrosDe(conta.id).filter(l => !l.removidoEm)
            const bytes = [...nuvem.arquivos.entries()]
              .filter(([chave]) => chave.split('/')[1] === conta.id)
              .reduce((soma, [, a]) => soma + a.bytes.length, 0)
            return json(res, 200, { livros: livros.length, arquivos: livros.filter(l => l.arquivo).length, bytes, limite: nuvem.limitePorConta })
          }
        }
        return json(res, 404, { code: 'PGRST202', message: 'função não existe' })
      }

      // Storage
      if (caminho.startsWith('/storage/v1/object/')) {
        if (!conta) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'invalid jwt: sem sessão' })
        const resto = caminho.slice('/storage/v1/object/'.length)
        if (resto.startsWith('list/') && req.method === 'POST') {
          const bucket = resto.slice('list/'.length)
          const { prefix } = JSON.parse((await corpo(req)).toString())
          const pasta = `${bucket}/${String(prefix).replace(/\/$/, '')}/`
          const nomes = [...nuvem.arquivos.keys()]
            .filter(chave => chave.startsWith(pasta) && !chave.slice(pasta.length).includes('/'))
            .map(chave => chave.slice(pasta.length))
          return json(res, 200, nomes.map(name => ({ name, id: randomUUID(), metadata: {} })))
        }
        if (req.method === 'DELETE') {
          const { prefixes } = JSON.parse((await corpo(req)).toString())
          const apagados = (prefixes as string[]).filter(p => p.startsWith(`${conta.id}/`) && nuvem.arquivos.delete(`${resto}/${p}`))
          return json(res, 200, apagados.map(name => ({ name })))
        }
        // O primeiro nível do caminho é a conta: ninguém mexe na pasta de outra.
        const [bucket, dono] = resto.split('/')
        if (dono !== conta.id) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy (pasta de outra conta)' })
        if (req.method === 'POST' || req.method === 'PUT') {
          nuvem.arquivos.set(resto, { bytes: new Uint8Array(await corpo(req)), tipo: String(req.headers['content-type']) })
          return json(res, 200, { Id: randomUUID(), Key: resto })
        }
        if (req.method === 'GET') {
          const arquivo = nuvem.arquivos.get(resto)
          if (!arquivo) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
          res.writeHead(200, { 'Content-Type': arquivo.tipo })
          return res.end(Buffer.from(arquivo.bytes))
        }
        return json(res, 400, { statusCode: '400', error: 'bad_request', message: `${req.method} ${bucket}` })
      }
      return json(res, 404, { message: 'não existe' })
    } catch (erro) {
      return erroDaConta(res, erro)
    }
  })
  await new Promise<void>(pronto => servidor.listen(0, '127.0.0.1', pronto))
  const { port } = servidor.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    nuvem,
    pedidos,
    lentidao,
    fechar: () => new Promise<void>(fechado => servidor.close(() => fechado())),
  }
}
