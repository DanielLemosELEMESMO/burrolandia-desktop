// Processo utilitário que converte PDF em EPUB longe da janela, para a interface não travar.
// O pdf.js vai empacotado neste arquivo, com o worker dele carregado aqui mesmo.

import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'
import { converterPdfEmEpub, type OpcoesDeConversao } from '@nucleo/pdf/converter'

;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker

export type PedidoDeConversao = Omit<OpcoesDeConversao, 'aoAndamento'> & { bytes: Uint8Array }

process.parentPort.once('message', async ({ data }) => {
  const { bytes, ...opcoes } = data as PedidoDeConversao
  try {
    const resultado = await converterPdfEmEpub(bytes, {
      ...opcoes,
      aoAndamento: (atual, total) => process.parentPort.postMessage({ tipo: 'andamento', atual, total }),
    })
    process.parentPort.postMessage({ tipo: 'fim', resultado })
  } catch (e) {
    const erro = e as Error | undefined
    process.parentPort.postMessage({ tipo: 'erro', nome: erro?.name, mensagem: String(erro?.message ?? e) })
  }
})
