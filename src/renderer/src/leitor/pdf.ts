// O pdf.js na interface: desenha a página original e gera a capa dos PDFs.

import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import trabalhador from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = trabalhador

const recurso = (pasta: string) => new URL(`pdfjs/${pasta}/`, location.href).href

export interface PdfAberto {
  pdf: PDFDocumentProxy
  fechar(): Promise<void>
}

export async function abrirPdf(url: string): Promise<PdfAberto> {
  const tarefa = getDocument({
    url,
    cMapUrl: recurso('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: recurso('standard_fonts'),
    wasmUrl: recurso('wasm'),
    iccUrl: recurso('iccs'),
    disableRange: true,
    disableStream: true,
  })
  return { pdf: await tarefa.promise, fechar: () => tarefa.destroy() }
}

/** Desenha uma página num canvas, na largura pedida (em pixels de CSS). */
export async function desenharPagina(pagina: PDFPageProxy, canvas: HTMLCanvasElement, largura: number) {
  const base = pagina.getViewport({ scale: 1 })
  const escala = largura / base.width
  const densidade = Math.min(window.devicePixelRatio || 1, 2)
  const viewport = pagina.getViewport({ scale: escala * densidade })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${Math.floor(viewport.width / densidade)}px`
  canvas.style.height = `${Math.floor(viewport.height / densidade)}px`
  const tarefa = pagina.render({ canvas, viewport })
  await tarefa.promise
  return tarefa
}

/** A primeira página do PDF, como JPEG, para servir de capa. */
export async function gerarCapaDoPdf(url: string): Promise<Uint8Array> {
  const { pdf, fechar } = await abrirPdf(url)
  try {
    const pagina = await pdf.getPage(1)
    const canvas = document.createElement('canvas')
    await desenharPagina(pagina, canvas, 600 / Math.min(window.devicePixelRatio || 1, 2))
    const blob = await new Promise<Blob | null>(pronto => canvas.toBlob(pronto, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Não deu para gerar a imagem da capa')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    await fechar()
  }
}
