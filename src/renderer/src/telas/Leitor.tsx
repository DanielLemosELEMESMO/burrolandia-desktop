// O leitor: só o livro na tela; as barras aparecem quando você mexe o mouse ou usa o teclado.
// A posição é salva sozinha a cada mudança. Nos PDFs, dá para alternar entre o texto adaptado
// e a página original, sem perder a página.

import { useCallback, useEffect, useRef, useState } from 'react'
import literataNormal from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url'
import literataItalico from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?url'
import atkinsonNormal from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?url'
import atkinsonItalico from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-italic.woff2?url'
import { faltaNoCapitulo } from '@nucleo/tempo'
import {
  paginaDoLocator,
  TAMANHO_MAXIMO,
  TAMANHO_MINIMO,
  type Livro,
  type Locator,
  type Preferencias,
  type TemaEfetivo,
} from '@nucleo/tipos'
import { api, urlDoArquivo } from '../api'
import { AjustesLeitura } from '../componentes/AjustesLeitura'
import { Dock, type Destino, type Navegacao } from '../componentes/Dock'
import { Icone } from '../componentes/Icone'
import { Sumario } from '../componentes/Sumario'
import { atributosDoLayout, estiloDoLivro, type FontesLocais } from '../leitor/estiloDoLivro'
import { criarVisao, type DetalheRelocate, type ItemDoSumario, type LivroFoliate, type VisaoFoliate } from '../leitor/foliate'
import { PaginaOriginal, type ControleDaPaginaOriginal } from '../leitor/PaginaOriginal'
import { usarMidia } from '../usarMidia'

const absoluta = (url: string) => new URL(url, location.href).href
const FONTES: FontesLocais = {
  literata: { normal: absoluta(literataNormal), italico: absoluta(literataItalico) },
  atkinson: { normal: absoluta(atkinsonNormal), italico: absoluta(atkinsonItalico) },
}

const ESPERA_PARA_ESCONDER = 2500
const ESPERA_PARA_SALVAR = 300
/** Depois de um comando seu, por quanto tempo a posição nova ainda é sua (um capítulo grande demora a abrir). */
const JANELA_DO_COMANDO = 5000
const TEMPO_DO_RECADO = 6000

type Painel = null | 'sumario' | 'ajustes'
type Modo = 'texto' | 'original'

interface OndeNoOriginal {
  numero: number
  rotulo: string
  total: number
}

const limitar = (x: number) => Math.min(1, Math.max(0, x))

const numeroDaAncora = (href: string | undefined) => Number(href?.match(/#pagina-(\d+)$/)?.[1]) || null

/** O endereço, no texto adaptado, de onde começa a página N do PDF (ou a anterior mais próxima). */
function hrefDaPagina(livro: LivroFoliate, numero: number): string | null {
  let melhor: string | null = null
  let melhorNumero = 0
  for (const item of livro.pageList ?? []) {
    const n = numeroDaAncora(item.href)
    if (n && n <= numero && n > melhorNumero) {
      melhor = item.href
      melhorNumero = n
    }
  }
  return melhor
}

/**
 * Vai para a posição: pelo CFI; se ele não levar a lugar nenhum (o livro mudou), pela página do
 * original; depois pela fração do livro. Devolve se chegou a algum lugar.
 */
async function irParaPosicao(visao: VisaoFoliate, posicao: Locator | null): Promise<boolean> {
  const antes = visao.lastLocation
  const chegou = () => !!visao.lastLocation && visao.lastLocation !== antes
  const cfi = posicao?.locations.cfi
  if (cfi && visao.resolveNavigation(cfi)) {
    try {
      await visao.init({ lastLocation: cfi })
    } catch (erro) {
      console.warn('A posição salva não abriu; tentando de outro jeito', erro)
    }
    if (chegou()) return true
  }
  const pagina = paginaDoLocator(posicao)
  const href = pagina ? hrefDaPagina(visao.book, pagina) : null
  if (href) {
    await visao.goTo(href)
    if (chegou()) return true
  }
  const fracao = posicao?.locations.totalProgression
  if (fracao) {
    await visao.goToFraction(fracao)
    if (chegou()) return true
  }
  return false
}

/** Abre o texto onde você parou; sem posição que leve a algum lugar, no começo do texto. */
async function voltarParaOndeParou(visao: VisaoFoliate, posicao: Locator | null) {
  if (!(await irParaPosicao(visao, posicao))) await visao.init({ showTextStart: true })
}

const chaveDoModo = (id: string) => `burrolandia:modo:${id}`

/**
 * O texto do livro mora em iframes, e o arrasto de um arquivo lá dentro não chega à janela.
 * Repassa para a janela, onde o App cuida de adicionar o livro (de qualquer tela).
 */
function repassarArrasto(e: Event) {
  const arrasto = e as DragEvent
  if (!Array.from(arrasto.dataTransfer?.types ?? []).includes('Files')) return
  arrasto.preventDefault()
  window.dispatchEvent(new DragEvent(arrasto.type, { dataTransfer: arrasto.dataTransfer, cancelable: true }))
}

function modoInicial(livro: Livro): Modo {
  if (!livro.arquivoLeitura) return 'original'
  try {
    return localStorage.getItem(chaveDoModo(livro.id)) === 'original' ? 'original' : 'texto'
  } catch {
    return 'texto'
  }
}

function paraLocator(visao: VisaoFoliate, d: DetalheRelocate): Locator {
  const indice = d.section?.current ?? 0
  const fracoes = visao.getSectionFractions()
  const inicio = fracoes[indice] ?? 0
  const fim = fracoes[indice + 1] ?? 1
  const trecho = d.range?.toString().replace(/\s+/g, ' ').trim().slice(0, 200)
  const pagina = numeroDaAncora(d.pageItem?.href)
  return {
    href: visao.book.sections[indice]?.id ?? '',
    type: 'application/xhtml+xml',
    title: d.tocItem?.label?.trim() || undefined,
    locations: {
      fragments: pagina ? [`pagina-${pagina}`] : undefined,
      progression: fim > inicio ? limitar((d.fraction - inicio) / (fim - inicio)) : 0,
      totalProgression: limitar(d.fraction),
      cfi: d.cfi,
      pagina: d.pageItem?.label,
    },
    text: trecho ? { highlight: trecho } : undefined,
  }
}

const ROTULO_DA_ORIGEM: Record<Destino, { curto: string; voltar: string }> = {
  inicio: { curto: 'Início', voltar: 'Voltar ao início' },
  biblioteca: { curto: 'Biblioteca', voltar: 'Voltar à biblioteca' },
}

export function TelaLeitor({
  livro,
  origem,
  navegacao,
  preferencias,
  tema,
  aoMudarPreferencias,
}: {
  livro: Livro
  /** De onde você veio: o botão de voltar leva de volta para lá. */
  origem: Destino
  navegacao: Navegacao
  preferencias: Preferencias
  tema: TemaEfetivo
  aoMudarPreferencias: (parcial: Partial<Preferencias>) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const visao = useRef<VisaoFoliate | null>(null)
  const original = useRef<ControleDaPaginaOriginal>(null)
  const ehPdf = livro.formatoOriginal === 'pdf'
  const [textoFalhou, setTextoFalhou] = useState(false)
  const temTexto = !!livro.arquivoLeitura && !textoFalhou
  const [modo, setModo] = useState<Modo>(() => modoInicial(livro))
  const [estado, setEstado] = useState<'abrindo' | 'pronto' | 'erro'>(temTexto ? 'abrindo' : 'pronto')
  const [onde, setOnde] = useState<DetalheRelocate | null>(null)
  const [ondeNoOriginal, setOndeNoOriginal] = useState<OndeNoOriginal | null>(null)
  const [paginaParaAbrir, setPaginaParaAbrir] = useState(() => paginaDoLocator(livro.posicao) ?? 1)
  const [sumario, setSumario] = useState<ItemDoSumario[]>([])
  const [painel, setPainel] = useState<Painel>(null)
  const [barras, setBarras] = useState(true)
  const movimentoReduzido = usarMidia('(prefers-reduced-motion: reduce)')

  // Os ouvintes dentro do livro leem o estado mais recente por estas referências.
  const preferenciasAtuais = useRef(preferencias)
  preferenciasAtuais.current = preferencias
  const painelAtual = useRef<Painel>(painel)
  painelAtual.current = painel
  const modoAtual = useRef<Modo>(modo)
  modoAtual.current = modo
  const ultimaPosicao = useRef<Locator | null>(null)
  const salvamento = useRef<number | undefined>(undefined)
  const esconder = useRef<number | undefined>(undefined)
  const [recado, setRecado] = useState<string | null>(null)

  // Só vira "onde você parou" o que você fez: virar a página, rolar, o sumário, um link do livro.
  // Abrir o livro, mudar a letra ou o tamanho da janela também mexem no texto, mas não são você: se
  // contassem, um aparelho que só abriu o livro passaria por cima da leitura feita em outro.
  /** Quando foi o seu último comando (-Infinity: nenhum ainda; o relógio da janela começa em 0 ao abrir o app). */
  const comando = useRef(Number.NEGATIVE_INFINITY)
  /** O texto já abriu onde você parou (antes disso, nada do que acontece é seu). */
  const textoPronto = useRef(false)
  const marcarComando = useCallback(() => {
    if (textoPronto.current || modoAtual.current === 'original') comando.current = performance.now()
  }, [])

  const guardarPosicao = useCallback(
    (locator: Locator) => {
      ultimaPosicao.current = locator
      window.clearTimeout(salvamento.current)
      salvamento.current = window.setTimeout(() => {
        salvamento.current = undefined
        void api.leitura.salvarPosicao(livro.id, locator)
      }, ESPERA_PARA_SALVAR)
    },
    [livro.id],
  )

  const salvarAgora = useCallback(() => {
    if (salvamento.current === undefined || !ultimaPosicao.current) return
    window.clearTimeout(salvamento.current)
    salvamento.current = undefined
    void api.leitura.salvarPosicao(livro.id, ultimaPosicao.current)
  }, [livro.id])

  // Lido em outro aparelho com este livro aberto aqui: o leitor vai para lá. Ir para lá não é você
  // mexendo, então não grava nada (a posição já está no banco).
  const irParaAPosicaoQueChegou = useCallback(async (posicao: Locator) => {
    comando.current = Number.NEGATIVE_INFINITY
    if (modoAtual.current === 'original') {
      const pagina = paginaDoLocator(posicao)
      if (!pagina || !original.current) return
      original.current.irPara(pagina)
    } else {
      const v = visao.current
      if (!v || !(await irParaPosicao(v, posicao))) return
    }
    ultimaPosicao.current = posicao
    setRecado('O livro foi para onde você parou no outro aparelho.')
  }, [])

  useEffect(
    () =>
      api.leitura.aoChegarPosicao((id, posicao) => {
        // Uma gravação sua esperando para sair é mais nova que a que chegou: ela vale. Antes de o texto
        // abrir, quem cuida é a conferência logo depois que ele abre.
        if (id !== livro.id || salvamento.current !== undefined) return
        if (modoAtual.current === 'texto' && !textoPronto.current) return
        void irParaAPosicaoQueChegou(posicao)
      }),
    [livro.id, irParaAPosicaoQueChegou],
  )

  // A posição pode ter mudado no banco entre abrir o livro e o leitor ficar pronto (a de outro
  // aparelho chegando com a rede lenta, antes de o leitor ouvir o aviso). Pronto, confere: se a do
  // banco é outra e você ainda não mexeu, vai para ela.
  const conferirPosicao = useCallback(async () => {
    const noBanco = await api.leitura.posicao(livro.id)
    if (!noBanco || ultimaPosicao.current || salvamento.current !== undefined) return
    if (JSON.stringify(noBanco) !== JSON.stringify(livro.posicao)) void irParaAPosicaoQueChegou(noBanco)
  }, [livro.id, livro.posicao, irParaAPosicaoQueChegou])

  useEffect(() => {
    // Sem texto adaptado (PDF digitalizado), só há a página original: confere ao abrir.
    if (!livro.arquivoLeitura) void conferirPosicao()
  }, [livro.arquivoLeitura, conferirPosicao])

  useEffect(() => {
    if (!recado) return
    const tempo = window.setTimeout(() => setRecado(null), TEMPO_DO_RECADO)
    return () => window.clearTimeout(tempo)
  }, [recado])

  const mostrarBarras = useCallback(() => {
    setBarras(true)
    window.clearTimeout(esconder.current)
    esconder.current = window.setTimeout(() => {
      if (painelAtual.current || document.querySelector('.leitor-barra:focus-within, .leitor-barra:hover')) return
      setBarras(false)
    }, ESPERA_PARA_ESCONDER)
  }, [])

  const mudarTamanho = useCallback(
    (passo: number) => {
      if (modoAtual.current === 'original') return original.current?.zoom(passo)
      const tamanho = preferenciasAtuais.current.tamanho + passo
      if (tamanho >= TAMANHO_MINIMO && tamanho <= TAMANHO_MAXIMO) aoMudarPreferencias({ tamanho })
    },
    [aoMudarPreferencias],
  )

  const avancar = useCallback(() => {
    marcarComando()
    if (modoAtual.current === 'original') original.current?.proxima()
    else void visao.current?.next()
  }, [marcarComando])

  const voltar = useCallback(() => {
    marcarComando()
    if (modoAtual.current === 'original') original.current?.anterior()
    else void visao.current?.prev()
  }, [marcarComando])

  const teclas = useCallback(
    (e: KeyboardEvent) => {
      // Com um diálogo aberto (painéis do leitor ou a importação, que pode abrir por cima do livro),
      // as teclas são do diálogo: não viram a página nem mudam a letra por trás dele.
      if (painelAtual.current || document.querySelector('dialog[open]')) return
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        return mudarTamanho(1)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        return mudarTamanho(-1)
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const alvo = e.target as Element | null
      const emControle = alvo?.ownerDocument === document && !!alvo.closest?.('button, input, select, textarea, a')
      const rtl = modoAtual.current === 'texto' && visao.current?.book.dir === 'rtl'
      switch (e.key) {
        case 'ArrowRight':
          if (emControle && alvo?.matches('input')) return
          e.preventDefault()
          return rtl ? voltar() : avancar()
        case 'ArrowLeft':
          if (emControle && alvo?.matches('input')) return
          e.preventDefault()
          return rtl ? avancar() : voltar()
        case 'PageDown':
          e.preventDefault()
          return avancar()
        case 'PageUp':
          e.preventDefault()
          return voltar()
        case ' ':
          if (emControle) return
          e.preventDefault()
          return e.shiftKey ? voltar() : avancar()
        case 'Home':
        case 'End': {
          const v = visao.current
          const indice = v?.lastLocation?.section?.current
          if (modoAtual.current !== 'texto' || !v || indice === undefined) return
          e.preventDefault()
          marcarComando()
          void v.renderer.goTo({ index: indice, anchor: e.key === 'Home' ? 0 : 1 })
          return
        }
        case 'ArrowUp':
        case 'ArrowDown':
          // Na rolagem, quem rola o texto é o navegador; a posição nova é sua.
          if (!emControle) marcarComando()
          return
        case 'Tab':
          mostrarBarras()
      }
    },
    [mudarTamanho, mostrarBarras, avancar, voltar, marcarComando],
  )

  // A roda do mouse vira a página no modo Páginas do texto adaptado.
  const roda = useRef({ acumulado: 0, ultimaVirada: 0 })
  const aoRolar = useCallback((e: WheelEvent) => {
    const v = visao.current
    if (!v || painelAtual.current || modoAtual.current !== 'texto') return
    marcarComando()
    if (preferenciasAtuais.current.fluxo !== 'paginas') return
    const agora = performance.now()
    if (agora - roda.current.ultimaVirada < 350) return
    roda.current.acumulado += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (Math.abs(roda.current.acumulado) >= 60) {
      void (roda.current.acumulado > 0 ? v.next() : v.prev())
      roda.current = { acumulado: 0, ultimaVirada: agora }
    }
  }, [marcarComando])

  // Clique nas margens vira a página; no meio, mostra ou esconde as barras.
  const aoClicarNoLivro = useCallback(
    (e: MouseEvent) => {
      // Um link do livro (o foliate já cuidou dele e marcou o clique) também leva você a outro lugar.
      if (e.button === 0 && (e.target as Element).closest?.('a[href]')) marcarComando()
      const v = visao.current
      const caixa = host.current?.getBoundingClientRect()
      if (!v || !caixa || e.defaultPrevented || e.button !== 0) return
      const doc = (e.target as Node).ownerDocument
      if (doc?.getSelection()?.toString()) return
      if ((e.target as Element).closest?.('a, button, input, select, textarea, audio, video')) return
      const quadro = doc?.defaultView?.frameElement as HTMLElement | null | undefined
      const x = (quadro?.getBoundingClientRect().left ?? 0) + e.clientX
      const relativo = (x - caixa.left) / caixa.width
      const paginas = preferenciasAtuais.current.fluxo === 'paginas'
      if (paginas && relativo < 0.25) voltar()
      else if (paginas && relativo > 0.75) avancar()
      else {
        setBarras(b => !b)
        window.clearTimeout(esconder.current)
      }
    },
    [marcarComando, avancar, voltar],
  )

  const aplicarAparencia = useCallback(() => {
    const v = visao.current
    if (!v?.renderer) return
    const atributos = atributosDoLayout(preferenciasAtuais.current, movimentoReduzido)
    for (const [nome, valor] of Object.entries(atributos)) {
      if (typeof valor === 'boolean') v.renderer.toggleAttribute(nome, valor)
      else v.renderer.setAttribute(nome, valor)
    }
    v.renderer.setStyles(estiloDoLivro(preferenciasAtuais.current, tema, FONTES))
  }, [tema, movimentoReduzido])

  // Abre o texto (EPUB, ou o texto adaptado do PDF) uma vez e volta para onde você parou.
  useEffect(() => {
    if (!livro.arquivoLeitura) return
    let ativo = true
    const elemento = criarVisao()
    elemento.setAttribute('autohide-cursor', '')
    host.current?.append(elemento)
    visao.current = elemento

    const aoRelocar = (e: Event) => {
      const detalhe = (e as CustomEvent<DetalheRelocate>).detail
      setOnde(detalhe)
      const seu = detalhe.reason !== 'anchor' && performance.now() - comando.current < JANELA_DO_COMANDO
      if (modoAtual.current === 'texto' && seu) guardarPosicao(paraLocator(elemento, detalhe))
    }
    const aoCarregarSecao = (e: Event) => {
      const { doc } = (e as CustomEvent<{ doc: Document }>).detail
      doc.addEventListener('keydown', teclas)
      doc.addEventListener('mousemove', mostrarBarras)
      doc.addEventListener('wheel', aoRolar, { passive: true })
      // Deslizar o dedo vira a página (o foliate cuida); a posição nova é sua.
      doc.addEventListener('touchstart', marcarComando, { passive: true })
      doc.addEventListener('click', aoClicarNoLivro)
      for (const tipo of ['dragenter', 'dragover', 'dragleave', 'drop']) doc.addEventListener(tipo, repassarArrasto)
    }
    elemento.addEventListener('relocate', aoRelocar)
    elemento.addEventListener('load', aoCarregarSecao)

    void (async () => {
      try {
        const resposta = await fetch(urlDoArquivo(livro, livro.arquivoLeitura!))
        if (!resposta.ok) throw new Error(`O arquivo do livro não abriu (${resposta.status})`)
        const arquivo = new File([await resposta.blob()], 'livro.epub', { type: 'application/epub+zip' })
        await elemento.open(arquivo)
        if (!ativo) return
        setSumario(elemento.book.toc ?? [])
        aplicarAparencia()
        await voltarParaOndeParou(elemento, livro.posicao)
        if (!ativo) return
        textoPronto.current = true
        setEstado('pronto')
        void conferirPosicao()
      } catch (erro) {
        console.error(erro)
        if (!ativo) return
        // Num PDF, a página original continua lá: abre nela em vez de mostrar erro.
        if (livro.formatoOriginal === 'pdf') {
          setTextoFalhou(true)
          setModo('original')
          setEstado('pronto')
        } else setEstado('erro')
      }
    })()

    return () => {
      ativo = false
      elemento.removeEventListener('relocate', aoRelocar)
      elemento.removeEventListener('load', aoCarregarSecao)
      elemento.close()
      elemento.remove()
      visao.current = null
    }
    // O livro abre uma vez por id; aparência e teclas são aplicadas pelos efeitos abaixo.
  }, [livro.id])

  // Ao sair do leitor (ou fechar a janela), a posição que ainda ia ser gravada é gravada na hora.
  useEffect(() => {
    const aoFecharJanela = () => {
      if (salvamento.current !== undefined && ultimaPosicao.current) {
        api.leitura.salvarPosicaoAgora(livro.id, ultimaPosicao.current)
      }
    }
    window.addEventListener('beforeunload', aoFecharJanela)
    return () => {
      window.removeEventListener('beforeunload', aoFecharJanela)
      salvarAgora()
    }
  }, [livro.id, salvarAgora])

  useEffect(() => {
    if (estado === 'pronto') aplicarAparencia()
  }, [estado, preferencias, aplicarAparencia])

  useEffect(() => {
    window.addEventListener('keydown', teclas)
    return () => window.removeEventListener('keydown', teclas)
  }, [teclas])

  useEffect(() => {
    document.title = `${livro.titulo} — Burrolândia`
    mostrarBarras()
    return () => {
      document.title = 'Burrolândia'
      window.clearTimeout(esconder.current)
    }
  }, [livro.titulo, mostrarBarras])

  const aoMudarPaginaOriginal = useCallback(
    (numero: number, rotulo: string, total: number, pelaPessoa: boolean) => {
      setOndeNoOriginal({ numero, rotulo, total })
      if (!pelaPessoa || modoAtual.current !== 'original') return
      guardarPosicao({
        href: livro.arquivoOriginal,
        type: 'application/pdf',
        locations: {
          fragments: [`page=${numero}`],
          totalProgression: total > 1 ? (numero - 1) / (total - 1) : 0,
          pagina: rotulo,
        },
      })
    },
    [livro.arquivoOriginal, guardarPosicao],
  )

  const aoFalharOriginal = useCallback(() => setEstado('erro'), [])

  // Grava a posição antes de sair, para o progresso aparecer atualizado na biblioteca.
  const navegacaoDoLeitor: Navegacao = {
    aoIr: destino => {
      salvarAgora()
      navegacao.aoIr(destino)
    },
    aoImportar: navegacao.aoImportar,
    aoBuscar: () => {
      salvarAgora()
      navegacao.aoBuscar()
    },
  }
  const sair = () => navegacaoDoLeitor.aoIr(origem)
  const voltarPara = ROTULO_DA_ORIGEM[origem]

  /** Troca entre texto adaptado e página original; sincronizar=false quando outro destino já foi escolhido. */
  const mudarModo = (novo: Modo, sincronizar = true) => {
    if (novo === modo) return
    if (novo === 'original') {
      setPaginaParaAbrir(
        numeroDaAncora(onde?.pageItem?.href) ??
          paginaDoLocator(ultimaPosicao.current) ??
          paginaDoLocator(livro.posicao) ??
          1,
      )
    } else if (sincronizar) {
      const v = visao.current
      const numero = ondeNoOriginal?.numero
      const href = v && numero ? hrefDaPagina(v.book, numero) : null
      if (href) void v!.goTo(href)
    }
    setModo(novo)
    try {
      localStorage.setItem(chaveDoModo(livro.id), novo)
    } catch {
      // Sem armazenamento local, o modo só não fica lembrado.
    }
  }

  const noOriginal = modo === 'original'
  const porcentagem = Math.round(
    (noOriginal
      ? ondeNoOriginal && ondeNoOriginal.total > 1
        ? (ondeNoOriginal.numero - 1) / (ondeNoOriginal.total - 1)
        : 0
      : (onde?.fraction ?? livro.progresso)) * 100,
  )
  const capitulo = onde?.tocItem?.label?.trim()
  const pagina = noOriginal ? ondeNoOriginal?.rotulo : onde?.pageItem?.label
  const paginas = preferencias.fluxo === 'paginas' || noOriginal

  return (
    <main
      className="leitor"
      tabIndex={-1}
      aria-label={`Lendo ${livro.titulo}`}
      data-fluxo={preferencias.fluxo}
      data-cfi={onde?.cfi}
      data-pagina={pagina}
      data-modo={modo}
      data-barras={barras || painel ? 'visiveis' : 'ocultas'}
      onMouseMove={mostrarBarras}
    >
      <header className="leitor-barra leitor-topo">
        <button type="button" className="botao-voltar" aria-label={voltarPara.voltar} onClick={sair}>
          <Icone nome="voltar" />
          <span>{voltarPara.curto}</span>
        </button>
        <div className="leitor-titulo">
          <span className="leitor-nome">{livro.titulo}</span>
          {!noOriginal && capitulo && <span className="leitor-capitulo">{capitulo}</span>}
        </div>
        {ehPdf && temTexto && (
          <div className="alternar-modo" role="radiogroup" aria-label="Como ver o livro">
            {(
              [
                ['texto', 'Texto adaptado'],
                ['original', 'Página original'],
              ] as const
            ).map(([valor, rotulo]) => (
              <label key={valor} className="segmento">
                <input
                  type="radio"
                  name="modo-de-leitura"
                  checked={modo === valor}
                  disabled={estado !== 'pronto'}
                  onChange={() => mudarModo(valor)}
                  // Depois de um clique, as setas voltam a virar a página em vez de trocar o modo.
                  onClick={e => e.detail > 0 && e.currentTarget.blur()}
                />
                <span>{rotulo}</span>
              </label>
            ))}
          </div>
        )}
        {temTexto && (
          <button type="button" className="botao-icone" aria-label="Sumário" onClick={() => setPainel('sumario')}>
            <Icone nome="sumario" />
          </button>
        )}
      </header>

      <div
        className="leitor-livro"
        ref={host}
        data-oculto={noOriginal || undefined}
        onWheel={e => aoRolar(e.nativeEvent)}
        // Arrastar a barra de rolagem do texto também é você mexendo.
        onPointerDown={marcarComando}
      />

      <p className="leitor-recado" role="status" data-visivel={recado ? '' : undefined}>
        {recado}
      </p>

      {noOriginal && (
        <div className="leitor-original">
          <PaginaOriginal
            url={urlDoArquivo(livro, livro.arquivoOriginal)}
            paginaInicial={paginaParaAbrir}
            controle={original}
            aoMudarPagina={aoMudarPaginaOriginal}
            aoFalhar={aoFalharOriginal}
          />
        </div>
      )}

      {!livro.arquivoLeitura && (
        <p className="leitor-nota" role="note">
          Este PDF é uma imagem digitalizada, então ele abre como foi impresso. Ainda não dá para adaptar o texto à tela.
        </p>
      )}
      {textoFalhou && (
        <p className="leitor-nota" role="note">
          Não deu para abrir o texto adaptado deste PDF, então ele abre como foi impresso. Remover e adicionar o livro de
          novo refaz a adaptação.
        </p>
      )}

      {estado === 'abrindo' && !noOriginal && (
        <p className="leitor-aviso" role="status">
          Abrindo o livro…
        </p>
      )}
      {estado === 'erro' && (
        <div className="leitor-aviso leitor-erro" role="alert">
          <Icone nome="aviso" />
          <h2>Não consegui abrir este livro</h2>
          <p>O arquivo pode estar danificado. Você pode removê-lo da biblioteca e adicioná-lo de novo.</p>
          <button type="button" className="botao principal" onClick={sair}>
            {voltarPara.voltar}
          </button>
        </div>
      )}

      {paginas && estado === 'pronto' && (
        <>
          <button type="button" className="leitor-barra virar virar-anterior" aria-label="Página anterior" onClick={voltar}>
            <Icone nome="voltar" />
          </button>
          <button type="button" className="leitor-barra virar virar-proxima" aria-label="Próxima página" onClick={avancar}>
            <Icone nome="avancar" />
          </button>
        </>
      )}

      <footer className="leitor-barra leitor-rodape">
        <div className="rodape-lado">
          {noOriginal ? (
            <span>{ondeNoOriginal ? `Página ${ondeNoOriginal.rotulo} de ${ondeNoOriginal.total}` : ''}</span>
          ) : (
            <>
              <span className="rodape-capitulo">{capitulo ?? ''}</span>
              <span className="rodape-tempo">{onde?.time ? faltaNoCapitulo(onde.time.section) : ''}</span>
            </>
          )}
        </div>
        <Dock atual={null} navegacao={navegacaoDoLeitor} aoAjustes={() => setPainel('ajustes')} naFaixa />
        <div className="rodape-lado rodape-direita">
          {noOriginal && (
            <span className="rodape-zoom">
              <button type="button" className="botao-icone" aria-label="Diminuir a página" onClick={() => original.current?.zoom(-1)}>
                −
              </button>
              <button type="button" className="botao-icone" aria-label="Aumentar a página" onClick={() => original.current?.zoom(1)}>
                +
              </button>
            </span>
          )}
          <span>{porcentagem}% do livro</span>
        </div>
        <div className="barra-livro rodape-barra" aria-hidden="true">
          <i style={{ width: `${porcentagem}%` }} />
        </div>
      </footer>

      {temTexto && (
        <Sumario
          aberto={painel === 'sumario'}
          aoFechar={() => setPainel(null)}
          itens={sumario}
          atual={onde?.tocItem?.href}
          aoIr={href => {
            setPainel(null)
            if (noOriginal) mudarModo('texto', false)
            marcarComando()
            void visao.current?.goTo(href)
          }}
        />
      )}
      <AjustesLeitura
        aberto={painel === 'ajustes'}
        aoFechar={() => setPainel(null)}
        preferencias={preferencias}
        aoMudar={aoMudarPreferencias}
      />
    </main>
  )
}
