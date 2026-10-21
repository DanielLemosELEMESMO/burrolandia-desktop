// O Remoto do Supabase sem rede de verdade: sair sem conexão, cancelar e o tempo limite dos pedidos.

import { afterEach, describe, expect, it } from 'vitest'
import { SemConexaoComANuvem } from '@nucleo/nuvem/remoto'
import { RemotoSupabase, type ArmazenamentoDaSessao } from '../../src/main/supabase'

const CHAVE = 'burrolandia-sessao'
const base64url = (texto: string) => Buffer.from(texto).toString('base64url')

/** Uma sessão guardada como o supabase-js guarda, vencendo em `expiraEm` (segundos). */
function sessaoGuardada(expiraEm: number) {
  const usuario = { id: '11111111-2222-4333-8444-555555555555', email: 'ana@burrolandia.test', aud: 'authenticated', role: 'authenticated' }
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const corpo = base64url(JSON.stringify({ sub: usuario.id, exp: expiraEm, role: 'authenticated' }))
  return JSON.stringify({
    access_token: `${cabecalho}.${corpo}.${base64url('assinatura')}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiraEm,
    refresh_token: 'renovacao-de-teste',
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
