// Roda a conversão de PDF num processo utilitário do Electron e repassa o andamento.

import { utilityProcess } from 'electron'
import type { ResultadoConversao } from '@nucleo/pdf/converter'
import type { ConversorDePdf } from './biblioteca'
import caminhoDoConversor from './conversor?modulePath'

type Mensagem =
  | { tipo: 'andamento'; atual: number; total: number }
  | { tipo: 'fim'; resultado: ResultadoConversao }
  | { tipo: 'erro'; nome?: string; mensagem: string }

const LIMITE_DE_TEMPO = 10 * 60 * 1000

/** A conversão não terminou (demorou demais ou o processo caiu): não quer dizer que o PDF está ruim. */
const interrompida = (mensagem: string) => {
  const erro = new Error(mensagem)
  erro.name = 'ConversaoInterrompida'
  return erro
}

export const converterEmProcessoSeparado: ConversorDePdf = (bytes, { aoAndamento, ...opcoes }) =>
  new Promise((resolve, reject) => {
    const filho = utilityProcess.fork(caminhoDoConversor, [], { serviceName: 'Burrolândia: conversor de PDF' })
    let terminou = false
    const encerrar = () => {
      terminou = true
      clearTimeout(limite)
      filho.kill()
    }
    const limite = setTimeout(() => {
      encerrar()
      reject(interrompida('O PDF demorou demais para converter'))
    }, LIMITE_DE_TEMPO)

    filho.on('message', (mensagem: Mensagem) => {
      if (mensagem.tipo === 'andamento') return aoAndamento?.(mensagem.atual, mensagem.total)
      encerrar()
      if (mensagem.tipo === 'fim') {
        const { epub } = mensagem.resultado
        resolve({ ...mensagem.resultado, epub: epub ? new Uint8Array(epub) : null })
      } else {
        const erro = new Error(mensagem.mensagem)
        erro.name = mensagem.nome ?? 'Error'
        reject(erro)
      }
    })
    filho.on('exit', codigo => {
      if (terminou) return
      clearTimeout(limite)
      reject(interrompida(`O conversor de PDF parou (código ${codigo})`))
    })
    filho.postMessage({ bytes, ...opcoes })
  })
