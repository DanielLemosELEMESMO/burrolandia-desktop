// A sessão da conta (os tokens do Supabase) fica no banco local, cifrada pelo sistema: DPAPI no
// Windows, Keychain no macOS, o chaveiro no Linux. Sem cifra disponível (um Linux sem chaveiro),
// fica como um navegador guardaria: em texto, na pasta do app, que só a sua conta do computador lê.

import { safeStorage } from 'electron'
import type { Banco } from './banco'
import type { ArmazenamentoDaSessao } from './supabase'

const PREFIXO = 'nuvem:sessao:'

type Guardado = { cifrado: string } | { texto: string }

export function sessaoCifrada(banco: Banco): ArmazenamentoDaSessao {
  const cifrar = (texto: string): Guardado =>
    safeStorage.isEncryptionAvailable() ? { cifrado: safeStorage.encryptString(texto).toString('base64') } : { texto }
  const decifrar = (guardado: Guardado) =>
    'cifrado' in guardado ? safeStorage.decryptString(Buffer.from(guardado.cifrado, 'base64')) : guardado.texto
  return {
    getItem: chave => {
      const guardado = banco.lerPreferencia<Guardado>(PREFIXO + chave)
      try {
        return guardado ? decifrar(guardado) : null
      } catch {
        // Cifrada em outro computador ou com outra conta do sistema: como se não houvesse sessão.
        return null
      }
    },
    setItem: (chave, valor) => banco.salvarPreferencia(PREFIXO + chave, cifrar(valor)),
    removeItem: chave => banco.apagarPreferencia(PREFIXO + chave),
  }
}
