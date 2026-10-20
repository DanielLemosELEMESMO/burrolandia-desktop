// Lê um PDF com o pdf.js e devolve só o que o conversor precisa: texto com posição, por página,
// os marcadores (sumário) e as informações do documento.

import type { DocumentoPdf, ItemPdf, MarcadorPdf, PaginaPdf } from './tipos'

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
type Documento = Awaited<ReturnType<PdfJs['getDocument']>['promise']>

let pdfjs: Promise<PdfJs> | undefined
const carregarPdfJs = () => (pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs'))

export interface OpcoesDeExtracao {
  aoAndamento?: (atual: number, total: number) => void
  /** Pastas de cmaps e fontes padrão do pdf.js (necessárias para alguns PDFs com fontes CJK). */
  recursos?: { cMapUrl: string; standardFontDataUrl: string }
}

const textoOuNada = (valor: unknown) => (typeof valor === 'string' && valor.trim() ? valor.trim() : undefined)

async function paginaDoDestino(pdf: Documento, destino: unknown): Promise<number | null> {
  try {
    const explicito = typeof destino === 'string' ? await pdf.getDestination(destino) : destino
    if (!Array.isArray(explicito)) return null
    const referencia = explicito[0]
    const indice = typeof referencia === 'number' ? referencia : await pdf.getPageIndex(referencia)
    return indice + 1
  } catch {
    return null
  }
}

async function lerMarcadores(pdf: Documento): Promise<MarcadorPdf[]> {
  const sumario = await pdf.getOutline().catch(() => null)
  if (!sumario) return []
  const marcadores: MarcadorPdf[] = []
  const visitar = async (itens: typeof sumario, nivel: number) => {
    for (const item of itens) {
      const pagina = await paginaDoDestino(pdf, item.dest)
      if (pagina && item.title?.trim()) marcadores.push({ titulo: item.title.trim(), pagina, nivel })
      if (item.items?.length && nivel < 3) await visitar(item.items, nivel + 1)
    }
  }
  await visitar(sumario, 0)
  return marcadores
}

export async function extrairPdf(bytes: Uint8Array, opcoes: OpcoesDeExtracao = {}): Promise<DocumentoPdf> {
  const { getDocument } = await carregarPdfJs()
  // O pdf.js transfere o buffer que recebe; uma cópia mantém o original intacto.
  const tarefa = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
    ...(opcoes.recursos ? { cMapUrl: opcoes.recursos.cMapUrl, cMapPacked: true, standardFontDataUrl: opcoes.recursos.standardFontDataUrl } : {}),
  })
  const pdf = await tarefa.promise

  try {
    const rotulos = await pdf.getPageLabels().catch(() => null)
    const paginas: PaginaPdf[] = []
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      const pagina = await pdf.getPage(numero)
      const [x0, y0, x1, y1] = pagina.view
      const conteudo = await pagina.getTextContent()
      const itens: ItemPdf[] = []
      for (const item of conteudo.items) {
        if (!('str' in item) || !item.str) continue
        const [a, b, c, d, e, f] = item.transform as number[]
        // Texto girado (lombadas, marcas na margem) fica de fora.
        if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01 || a <= 0) continue
        itens.push({ texto: item.str, x: e - x0, y: f - y0, largura: item.width, altura: Math.abs(d) || item.height })
      }
      paginas.push({
        numero,
        rotulo: rotulos?.[numero - 1]?.trim() || String(numero),
        largura: x1 - x0,
        altura: y1 - y0,
        itens,
      })
      pagina.cleanup()
      opcoes.aoAndamento?.(numero, pdf.numPages)
    }

    const marcadores = await lerMarcadores(pdf)
    const informacoes = (await pdf.getMetadata().catch(() => null))?.info as Record<string, unknown> | undefined
    return {
      paginas,
      marcadores,
      titulo: textoOuNada(informacoes?.Title),
      autor: textoOuNada(informacoes?.Author),
      idioma: textoOuNada(informacoes?.Language),
    }
  } finally {
    await tarefa.destroy()
  }
}
