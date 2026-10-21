// O Remoto do Supabase sem rede de verdade: sair sem conexão, cancelar, o tempo limite dos pedidos, a
// sessão recusada que renova uma vez, e o que é sessão terminada e o que não é.

import { afterEach, describe, expect, it } from 'vitest'
import { SemConexaoComANuvem, SessaoTerminada } from '@nucleo/nuvem/remoto'
import { RemotoSupabase, type ArmazenamentoDaSessao } from '../../src/main/supabase'

const CHAVE = 'burrolandia-sessao'
const base64url = (texto: string) => Buffer.from(texto).toString('base64url')

/** Uma sessão guardada como o supabase-js guarda, vencendo em `expiraEm` (segundos). */
function sessaoGuardada(expiraEm: number, renovacao = 'renovacao-de-teste') {
  const usuario = { id: '11111111-2222-4333-8444-555555555555', email: 'ana@burrolandia.test', aud: 'authenticated', role: 'authenticated' }
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const corpo = base64url(JSON.stringify({ sub: usuario.id, exp: expiraEm, role: 'authenticated' }))
  return JSON.stringify({
    access_token: `${cabecalho}.${corpo}.${base64url('assinatura')}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiraEm,
    refresh_token: renovacao,
    user: usuario,
  })
}

function armazenamento(sessao: string): ArmazenamentoDaSessao & { guardado: Map<string, string> } {
  const guardado = new Map([[CHAVE, sessao]])
  return {
    guardado,
    getItem: chave => guardado.get(chave) ?? null,
    setItem: (chave, valor) => void guardado.set(chave, valor),
    removeItem: chave => void guardado.delete(chave),
  }
}

/** Uma rede que nunca responde: o pedido só termina quando é cancelado. */
const redeParada: typeof fetch = (_, init) =>
  new Promise((_, falhar) => init?.signal?.addEventListener('abort', () => falhar(init.signal!.reason)))

const semRede: typeof fetch = async () => {
  throw new TypeError('fetch failed')
}

const agora = () => Math.floor(Date.now() / 1000)
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
const PROJETO = { url: 'http://127.0.0.1:9', chave: 'sb_publishable_de_teste' }

describe('RemotoSupabase sem rede', () => {
  const remotos: RemotoSupabase[] = []
  const novo = (...argumentos: ConstructorParameters<typeof RemotoSupabase>) => {
    const remoto = new RemotoSupabase(...argumentos)
    remotos.push(remoto)
    return remoto
  }

  afterEach(async () => {
    for (const remoto of remotos.splice(0)) await remoto.parar()
  })

  for (const [caso, expiraEm] of [
    ['com o token ainda valendo', agora() + 3000],
    ['com o token vencido (o Supabase desiste antes de apagar)', agora() - 600],
  ] as const) {
    it(`sair sem conexão esquece a sessão daqui, ${caso}`, async () => {
      const guardado = armazenamento(sessaoGuardada(expiraEm))
      const remoto = novo(PROJETO, guardado, semRede)
      await remoto.parar()
      expect(await remoto.conta()).toMatchObject({ email: 'ana@burrolandia.test' })
      await remoto.sair()
      expect(await remoto.conta()).toBeNull()
      expect(guardado.guardado.has(CHAVE)).toBe(false)
    })
  }

  it('sair com a rede parada não fica esperando a nuvem', async () => {
    const guardado = armazenamento(sessaoGuardada(agora() + 3000))
    const remoto = novo(PROJETO, guardado, redeParada, { avisoDaSaida: 50 })
    await remoto.parar()
    const inicio = performance.now()
    await remoto.sair()
    expect(performance.now() - inicio).toBeLessThan(2000)
    expect(await remoto.conta()).toBeNull()
  })

  it('sessão recusada (o relógio daqui atrasado): renova uma vez e o pedido passa', async () => {
    const guardado = armazenamento(sessaoGuardada(agora() + 3000))
    const pedidos: string[] = []
    const nuvem: typeof fetch = async url => {
      const endereco = String(url)
      if (endereco.includes('/rest/v1/rpc/livros_desde')) {
        pedidos.push('mudancas')
        return pedidos.filter(p => p === 'mudancas').length === 1
          ? resposta(401, { code: 'PGRST301', message: 'JWT expired' })
          : resposta(200, [])
      }
      if (endereco.includes('/auth/v1/token')) {
        pedidos.push('renovar')
        return resposta(200, JSON.parse(sessaoGuardada(agora() + 3600, 'renovacao-nova')))
      }
      return resposta(404, {})
    }
    const remoto = novo(PROJETO, guardado, nuvem)
    await remoto.parar()
    expect(await remoto.mudancas(null, null, 10)).toEqual([])
    expect(pedidos).toEqual(['mudancas', 'renovar', 'mudancas'])
    expect(JSON.parse(guardado.guardado.get(CHAVE)!).refresh_token).toBe('renovacao-nova')
  })

  it('recusada também a renovação, a sessão terminou mesmo', async () => {
    const guardado = armazenamento(sessaoGuardada(agora() + 3000))
    const nuvem: typeof fetch = async url =>
      String(url).includes('/auth/v1/token')
        ? resposta(400, { code: 'refresh_token_not_found', error: 'invalid_grant', error_description: 'Invalid Refresh Token' })
        : resposta(401, { code: 'PGRST301', message: 'JWT expired' })
    const remoto = novo(PROJETO, guardado, nuvem)
    await remoto.parar()
    await expect(remoto.mudancas(null, null, 10)).rejects.toBeInstanceOf(SessaoTerminada)
  })

  it('a RLS recusando um caminho não é sessão terminada', async () => {
    const nuvem: typeof fetch = async () =>
      resposta(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' })
    const remoto = novo(PROJETO, armazenamento(sessaoGuardada(agora() + 3000)), nuvem)
    await remoto.parar()
    const falha = await remoto.enviar('capas', 'x/capa-aaaaaaaaaaaa.jpg', new Uint8Array([1]), 'image/jpeg').catch(erro => erro)
    expect(falha).toBeInstanceOf(Error)
    expect(falha).not.toBeInstanceOf(SessaoTerminada)
    expect(falha).not.toBeInstanceOf(SemConexaoComANuvem)
  })

  it('cancelar faz o pedido em andamento falhar como "sem conexão"', async () => {
    const remoto = novo(PROJETO, armazenamento(sessaoGuardada(agora() + 3000)), redeParada)
    await remoto.parar()
    const pedido = remoto.mudancas(null, null, 10)
    setTimeout(() => remoto.cancelar(), 20)
    await expect(pedido).rejects.toBeInstanceOf(SemConexaoComANuvem)
  })

  it('um pedido sem resposta vira "sem conexão" no tempo limite', async () => {
    const remoto = novo(PROJETO, armazenamento(sessaoGuardada(agora() + 3000)), redeParada, { pedido: 50 })
    await remoto.parar()
    await expect(remoto.uso()).rejects.toBeInstanceOf(SemConexaoComANuvem)
  })
})
