// A página original de um PDF, como foi impressa: páginas empilhadas, desenhadas só quando aparecem.

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { abrirPdf, desenharPagina, type PdfAberto } from './pdf'

export interface ControleDaPaginaOriginal {
  proxima(): void
  anterior(): void
  zoom(passo: number): void
}

const ZOOM_MINIMO = 0.5
const ZOOM_MAXIMO = 2.5
const LARGURA_MAXIMA = 920
const MARGEM = 32
const DESENHADAS_NO_MAXIMO = 12
/** Altura da barra de cima: a página "atual" é a que está logo abaixo dela. */
const TOPO_VISIVEL = 72

export function PaginaOriginal({
  url,
  paginaInicial,
  controle,
  aoMudarPagina,
  aoFalhar,
}: {
  url: string
  /** Página do PDF (1, 2, 3…) onde abrir. */
  paginaInicial: number
  controle: Ref<ControleDaPaginaOriginal>
  aoMudarPagina: (numero: number, rotulo: string, total: number) => void
  aoFalhar: () => void
}) {
  const rolagem = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [proporcao, setProporcao] = useState(1.414)
  const [rotulos, setRotulos] = useState<string[]>([])
  const [largura, setLargura] = useState(0)
  const [zoom, setZoom] = useState(1)
  const atual = useRef(paginaInicial)
  // Enquanto a rolagem vem de um comando (abrir, setas, zoom), a página atual é a do comando;
  // só a rolagem feita pela pessoa (roda, barra de rolagem, toque) recalcula a página.
  const rolagemPorComando = useRef(true)
  const aoMudar = useRef(aoMudarPagina)
  aoMudar.current = aoMudarPagina

  // Abre o PDF.
  useEffect(() => {
    let ativo = true
    let aberto: PdfAberto | null = null
    void (async () => {
      try {
        aberto = await abrirPdf(url)
        const { pdf: documento } = aberto
        const primeira = await documento.getPage(1)
        const base = primeira.getViewport({ scale: 1 })
        const nomes = await documento.getPageLabels().catch(() => null)
        if (!ativo) return
        setProporcao(base.height / base.width)
        setRotulos(Array.from({ length: documento.numPages }, (_, i) => nomes?.[i]?.trim() || String(i + 1)))
        setPdf(documento)
      } catch (erro) {
        console.error(erro)
        if (ativo) aoFalhar()
      }
    })()
    return () => {
      ativo = false
      void aberto?.fechar()
    }
  }, [url, aoFalhar])

  // A largura das páginas acompanha a janela.
  useEffect(() => {
    const elemento = rolagem.current
    if (!elemento) return
    const observador = new ResizeObserver(() => setLargura(Math.min(LARGURA_MAXIMA, elemento.clientWidth - MARGEM * 2)))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  const larguraDaPagina = Math.max(200, Math.round(largura * zoom))
  const total = rotulos.length

  // Desenha as páginas que estão perto da tela e libera as que ficaram longe.
  useEffect(() => {
    const elemento = rolagem.current
    if (!pdf || !elemento || !largura) return
    const desenhadas = new Map<number, RenderTask | null>()
    const ordemDeUso: number[] = []

    const desenhar = async (numero: number, vaga: HTMLElement) => {
      if (desenhadas.has(numero)) return
      desenhadas.set(numero, null)
      ordemDeUso.push(numero)
      const canvas = document.createElement('canvas')
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', `Página ${rotulos[numero - 1] ?? numero} do original`)
      try {
        const pagina = await pdf.getPage(numero)
        if (!desenhadas.has(numero)) return
        const tarefa = await desenharPagina(pagina, canvas, larguraDaPagina)
        if (!desenhadas.has(numero)) return
        desenhadas.set(numero, tarefa)
        vaga.replaceChildren(canvas)
        // Páginas de tamanhos diferentes: a vaga passa a ter a altura real da página.
        vaga.style.height = canvas.style.height
      } catch (erro) {
        if ((erro as Error)?.name !== 'RenderingCancelledException') console.warn(erro)
      }
      while (ordemDeUso.length > DESENHADAS_NO_MAXIMO) {
        const antiga = ordemDeUso.shift()!
        desenhadas.get(antiga)?.cancel()
        desenhadas.delete(antiga)
        elemento.querySelector<HTMLElement>(`[data-numero="${antiga}"]`)?.replaceChildren()
      }
    }

    const observador = new IntersectionObserver(
      entradas => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            const vaga = entrada.target as HTMLElement
            void desenhar(Number(vaga.dataset.numero), vaga)
          }
        }
      },
      { root: elemento, rootMargin: '150% 0px' },
    )
    elemento.querySelectorAll('.pagina-vaga').forEach(vaga => observador.observe(vaga))
    return () => {
      observador.disconnect()
      for (const tarefa of desenhadas.values()) tarefa?.cancel()
      elemento.querySelectorAll('.pagina-vaga').forEach(vaga => vaga.replaceChildren())
    }
  }, [pdf, largura, larguraDaPagina, rotulos])

  const vagas = () => Array.from(rolagem.current?.querySelectorAll<HTMLElement>('.pagina-vaga') ?? [])

  const avisar = (numero: number) => {
    atual.current = numero
    aoMudar.current(numero, rotulos[numero - 1] ?? String(numero), total)
  }

  const irPara = (numero: number, suave = true) => {
    const vaga = vagas()[numero - 1]
    if (!vaga || !rolagem.current) return
    rolagemPorComando.current = true
    if (numero !== atual.current) avisar(numero)
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches
    // Desconta a barra de cima, para o topo da página aparecer logo abaixo dela.
    rolagem.current.scrollTo({ top: vaga.offsetTop - TOPO_VISIVEL, behavior: suave && !reduzido ? 'smooth' : 'auto' })
  }

  // Abre na página pedida e mantém a página atual no lugar quando o tamanho muda.
  useEffect(() => {
    if (pdf && largura) irPara(atual.current, false)
  }, [pdf, largura, larguraDaPagina])

  // Na rolagem feita pela pessoa, a página atual é a que está na linha logo abaixo da barra de cima
  // (a mesma referência usada por irPara); no fim do documento, é a última.
  useEffect(() => {
    const elemento = rolagem.current
    if (!elemento || !total) return
    let quadro = 0
    const medir = () => {
      quadro = 0
      const lista = vagas()
      const noFim = elemento.scrollTop >= elemento.scrollHeight - elemento.clientHeight - 2
      let numero = 1
      if (noFim) numero = lista.length
      else {
        const linha = elemento.scrollTop + TOPO_VISIVEL + 1
        for (const vaga of lista) {
          if (vaga.offsetTop <= linha) numero = Number(vaga.dataset.numero)
          else break
        }
      }
      if (numero !== atual.current) avisar(numero)
    }
    const aoRolar = () => {
      if (!rolagemPorComando.current && !quadro) quadro = requestAnimationFrame(medir)
    }
    const pelaPessoa = () => {
      rolagemPorComando.current = false
    }
    elemento.addEventListener('scroll', aoRolar, { passive: true })
    for (const evento of ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const) {
      elemento.addEventListener(evento, pelaPessoa, { passive: true })
    }
    aoMudar.current(atual.current, rotulos[atual.current - 1] ?? String(atual.current), total)
    return () => {
      elemento.removeEventListener('scroll', aoRolar)
      for (const evento of ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const) {
        elemento.removeEventListener(evento, pelaPessoa)
      }
      cancelAnimationFrame(quadro)
    }
  }, [total, rotulos])

  useImperativeHandle(controle, () => ({
    proxima: () => irPara(Math.min(total, atual.current + 1)),
    anterior: () => irPara(Math.max(1, atual.current - 1)),
    zoom: passo => setZoom(z => Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, Math.round((z + passo * 0.15) * 100) / 100))),
  }))

  return (
    <div ref={rolagem} className="pagina-original" data-pagina-atual={atual.current} tabIndex={-1}>
      {rotulos.map((rotulo, i) => (
        <div
          key={i}
          className="pagina-vaga"
          data-numero={i + 1}
          aria-label={`Página ${rotulo}`}
          style={{ width: larguraDaPagina, height: Math.round(larguraDaPagina * proporcao) }}
        />
      ))}
    </div>
  )
}
