// O pdf.js na interface: desenha a página original, gera a capa dos PDFs (só a imagem, quando a
// capa vem no meio de uma página branca) e prepara páginas para o recorte da capa.

import { getDocument, GlobalWorkerOptions, OPS, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import trabalhador from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { caixasDasImagens, capaNaPagina } from '@nucleo/pdf/imagens'
import { emPixels, INTEIRO, type Retangulo } from '@nucleo/recorte'

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

/** A altura da capa gerada, em pixels. */
const ALTURA_DA_CAPA = 900
/** A página desenhada para recortar fica com esta altura (a imagem da capa sai nítida). */
const ALTURA_PARA_RECORTAR = 1600
const ALTURA_MAXIMA = 3200

/** Onde está a capa dentro da página (a maior imagem em pé), em frações; null se a página toda serve. */
export async function capaDentroDaPagina(pagina: PDFPageProxy): Promise<Retangulo | null> {
  const { fnArray, argsArray } = await pagina.getOperatorList()
  const [x1, y1, x2, y2] = pagina.view
  const caixa = capaNaPagina(caixasDasImagens(fnArray, argsArray, OPS), { x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 })
  if (!caixa) return null
  // A janela de visão cuida da rotação da página e da origem fora do zero.
  const visao = pagina.getViewport({ scale: 1 })
  const [a, b] = visao.convertToViewportPoint(caixa.x, caixa.y) as [number, number]
  const [c, d] = visao.convertToViewportPoint(caixa.x + caixa.largura, caixa.y + caixa.altura) as [number, number]
  const [esquerda, topo] = [Math.min(a, c), Math.min(b, d)]
  return {
    x: esquerda / visao.width,
    y: topo / visao.height,
    largura: Math.abs(c - a) / visao.width,
    altura: Math.abs(d - b) / visao.height,
  }
}

/** A página inteira num canvas fora da tela, com a altura pedida em pixels (até um limite). */
async function desenharNaAltura(pagina: PDFPageProxy, altura: number): Promise<HTMLCanvasElement> {
  const base = pagina.getViewport({ scale: 1 })
  const viewport = pagina.getViewport({ scale: Math.min(altura, ALTURA_MAXIMA) / base.height })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  await pagina.render({ canvas, viewport }).promise
  return canvas
}

async function emBlob(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>(pronto => canvas.toBlob(pronto, 'image/jpeg', qualidade))
  if (!blob) throw new Error('Não deu para gerar a imagem da página')
  return blob
}

/** Um pedaço do canvas (em frações) num canvas novo. */
function recortar(canvas: HTMLCanvasElement, recorte: Retangulo): HTMLCanvasElement {
  const px = emPixels(recorte, canvas.width, canvas.height)
  const pedaco = document.createElement('canvas')
  pedaco.width = px.largura
  pedaco.height = px.altura
  pedaco.getContext('2d')?.drawImage(canvas, px.x, px.y, px.largura, px.altura, 0, 0, px.largura, px.altura)
  return pedaco
}

/**
 * A capa do PDF, como JPEG: a primeira página, ou só a imagem dela quando a capa vem no meio de uma
 * página branca (às vezes com uma linha de texto em cima).
 */
export async function gerarCapaDoPdf(url: string): Promise<Uint8Array> {
  const { pdf, fechar } = await abrirPdf(url)
  try {
    const pagina = await pdf.getPage(1)
    const capa = await capaDentroDaPagina(pagina).catch(() => null)
    const canvas = await desenharNaAltura(pagina, ALTURA_DA_CAPA / (capa?.altura ?? 1))
    const blob = await emBlob(capa ? recortar(canvas, capa) : canvas, 0.85)
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    await fechar()
  }
}

/** Uma página pronta para o recorte: a imagem (URL de blob, quem usa libera) e a capa achada nela. */
export async function paginaParaRecortar(pdf: PDFDocumentProxy, numero: number) {
  const pagina = await pdf.getPage(numero)
  const selecao = (await capaDentroDaPagina(pagina).catch(() => null)) ?? INTEIRO
  const canvas = await desenharNaAltura(pagina, ALTURA_PARA_RECORTAR)
  const url = URL.createObjectURL(await emBlob(canvas, 0.92))
  return { url, largura: canvas.width, altura: canvas.height, selecao }
}

/** A miniatura de uma página (URL de blob, quem usa libera). */
export async function miniaturaDaPagina(pdf: PDFDocumentProxy, numero: number, altura = 240): Promise<string> {
  const canvas = await desenharNaAltura(await pdf.getPage(numero), altura)
  return URL.createObjectURL(await emBlob(canvas, 0.8))
}
