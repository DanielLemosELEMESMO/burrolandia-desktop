// O leitor: só o livro na tela; as barras aparecem quando você mexe o mouse ou usa o teclado.
// A posição é salva sozinha a cada mudança.

import { useCallback, useEffect, useRef, useState } from 'react'
import literataNormal from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url'
import literataItalico from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?url'
import atkinsonNormal from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?url'
import atkinsonItalico from '@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-italic.woff2?url'
import { faltaNoCapitulo } from '@nucleo/tempo'
import { TAMANHO_MAXIMO, TAMANHO_MINIMO, type Livro, type Locator, type Preferencias, type TemaEfetivo } from '@nucleo/tipos'
import { api, urlDoArquivo } from '../api'
import { AjustesLeitura } from '../componentes/AjustesLeitura'
import { Icone } from '../componentes/Icone'
import { Sumario } from '../componentes/Sumario'
import { atributosDoLayout, estiloDoLivro, type FontesLocais } from '../leitor/estiloDoLivro'
import { criarVisao, type DetalheRelocate, type ItemDoSumario, type VisaoFoliate } from '../leitor/foliate'
import { usarMidia } from '../usarMidia'

const absoluta = (url: string) => new URL(url, location.href).href
const FONTES: FontesLocais = {
  literata: { normal: absoluta(literataNormal), italico: absoluta(literataItalico) },
  atkinson: { normal: absoluta(atkinsonNormal), italico: absoluta(atkinsonItalico) },
}

const ESPERA_PARA_ESCONDER = 2500
const ESPERA_PARA_SALVAR = 300

type Painel = null | 'sumario' | 'ajustes'

const limitar = (x: number) => Math.min(1, Math.max(0, x))

function paraLocator(visao: VisaoFoliate, d: DetalheRelocate): Locator {
  const indice = d.section?.current ?? 0
  const fracoes = visao.getSectionFractions()
  const inicio = fracoes[indice] ?? 0
  const fim = fracoes[indice + 1] ?? 1
  const trecho = d.range?.toString().replace(/\s+/g, ' ').trim().slice(0, 200)
  return {
    href: visao.book.sections[indice]?.id ?? '',
    type: 'application/xhtml+xml',
    title: d.tocItem?.label?.trim() || undefined,
    locations: {
      progression: fim > inicio ? limitar((d.fraction - inicio) / (fim - inicio)) : 0,
      totalProgression: limitar(d.fraction),
      position: d.location ? d.location.current + 1 : undefined,
      cfi: d.cfi,
      pagina: d.pageItem?.label,
    },
    text: trecho ? { highlight: trecho } : undefined,
  }
}

export function TelaLeitor({
  livro,
  preferencias,
  tema,
  aoMudarPreferencias,
  aoVoltar,
}: {
  livro: Livro
  preferencias: Preferencias
  tema: TemaEfetivo
  aoMudarPreferencias: (parcial: Partial<Preferencias>) => void
  aoVoltar: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const visao = useRef<VisaoFoliate | null>(null)
  const [estado, setEstado] = useState<'abrindo' | 'pronto' | 'erro'>('abrindo')
  const [onde, setOnde] = useState<DetalheRelocate | null>(null)
  const [sumario, setSumario] = useState<ItemDoSumario[]>([])
  const [painel, setPainel] = useState<Painel>(null)
  const [barras, setBarras] = useState(true)
  const movimentoReduzido = usarMidia('(prefers-reduced-motion: reduce)')

  // Os ouvintes dentro do livro leem o estado mais recente por estas referências.
  const preferenciasAtuais = useRef(preferencias)
  preferenciasAtuais.current = preferencias
  const painelAtual = useRef<Painel>(painel)
  painelAtual.current = painel
  const ultimaPosicao = useRef<Locator | null>(null)
  const salvamento = useRef<number | undefined>(undefined)
  const esconder = useRef<number | undefined>(undefined)

  const salvarAgora = useCallback(() => {
    if (salvamento.current === undefined || !ultimaPosicao.current) return
    window.clearTimeout(salvamento.current)
    salvamento.current = undefined
    void api.leitura.salvarPosicao(livro.id, ultimaPosicao.current)
  }, [livro.id])

  const mostrarBarras = useCallback(() => {
    setBarras(true)
    window.clearTimeout(esconder.current)
    esconder.current = window.setTimeout(() => {
      if (painelAtual.current || document.querySelector('.leitor-barra:focus-within')) return
      setBarras(false)
    }, ESPERA_PARA_ESCONDER)
  }, [])

  const mudarTamanho = useCallback(
    (passo: number) => {
      const tamanho = preferenciasAtuais.current.tamanho + passo
      if (tamanho >= TAMANHO_MINIMO && tamanho <= TAMANHO_MAXIMO) aoMudarPreferencias({ tamanho })
    },
    [aoMudarPreferencias],
  )

  const teclas = useCallback(
    (e: KeyboardEvent) => {
      const v = visao.current
      if (!v || painelAtual.current) return
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
      const rtl = v.book.dir === 'rtl'
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          void (rtl ? v.prev() : v.next())
          break
        case 'ArrowLeft':
          e.preventDefault()
          void (rtl ? v.next() : v.prev())
          break
        case 'PageDown':
          e.preventDefault()
          void v.next()
          break
        case 'PageUp':
          e.preventDefault()
          void v.prev()
          break
        case ' ':
          if (emControle) return
          e.preventDefault()
          void (e.shiftKey ? v.prev() : v.next())
          break
        case 'Tab':
          mostrarBarras()
          break
      }
    },
    [mudarTamanho, mostrarBarras],
  )

  // A roda do mouse vira a página no modo Páginas.
  const roda = useRef({ acumulado: 0, ultimaVirada: 0 })
  const aoRolar = useCallback((e: WheelEvent) => {
    const v = visao.current
    if (!v || painelAtual.current || preferenciasAtuais.current.fluxo !== 'paginas') return
    const agora = performance.now()
    if (agora - roda.current.ultimaVirada < 350) return
    roda.current.acumulado += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (Math.abs(roda.current.acumulado) >= 60) {
      void (roda.current.acumulado > 0 ? v.next() : v.prev())
      roda.current = { acumulado: 0, ultimaVirada: agora }
    }
  }, [])

  // Clique nas margens vira a página; no meio, mostra ou esconde as barras.
  const aoClicarNoLivro = useCallback(
    (e: MouseEvent) => {
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
      if (paginas && relativo < 0.25) void v.prev()
      else if (paginas && relativo > 0.75) void v.next()
      else {
        setBarras(b => !b)
        window.clearTimeout(esconder.current)
      }
    },
    [],
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

  // Abre o livro uma vez e volta para onde você parou.
  useEffect(() => {
    let ativo = true
    const elemento = criarVisao()
    elemento.setAttribute('autohide-cursor', '')
    host.current?.append(elemento)
    visao.current = elemento

    const aoRelocar = (e: Event) => {
      const detalhe = (e as CustomEvent<DetalheRelocate>).detail
      setOnde(detalhe)
      const locator = paraLocator(elemento, detalhe)
      ultimaPosicao.current = locator
      window.clearTimeout(salvamento.current)
      salvamento.current = window.setTimeout(() => {
        salvamento.current = undefined
        void api.leitura.salvarPosicao(livro.id, locator)
      }, ESPERA_PARA_SALVAR)
    }
    const aoCarregarSecao = (e: Event) => {
      const { doc } = (e as CustomEvent<{ doc: Document }>).detail
      doc.addEventListener('keydown', teclas)
      doc.addEventListener('mousemove', mostrarBarras)
      doc.addEventListener('wheel', aoRolar, { passive: true })
      doc.addEventListener('click', aoClicarNoLivro)
    }
    elemento.addEventListener('relocate', aoRelocar)
    elemento.addEventListener('load', aoCarregarSecao)

    void (async () => {
      try {
        const resposta = await fetch(urlDoArquivo(livro, livro.arquivoLeitura ?? livro.arquivoOriginal))
        if (!resposta.ok) throw new Error(`O arquivo do livro não abriu (${resposta.status})`)
        const arquivo = new File([await resposta.blob()], 'livro.epub', { type: 'application/epub+zip' })
        await elemento.open(arquivo)
        if (!ativo) return
        setSumario(elemento.book.toc ?? [])
        aplicarAparencia()
        const cfi = livro.posicao?.locations.cfi
        const fracao = livro.posicao?.locations.totalProgression
        if (cfi && elemento.resolveNavigation(cfi)) await elemento.init({ lastLocation: cfi })
        else if (fracao) await elemento.goToFraction(fracao)
        else await elemento.init({ showTextStart: true })
        if (ativo) setEstado('pronto')
      } catch (erro) {
        console.error(erro)
        if (ativo) setEstado('erro')
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

  // Ao sair do leitor (ou fechar a janela), a última posição é gravada na hora.
  useEffect(() => {
    const aoFecharJanela = () => {
      if (ultimaPosicao.current) api.leitura.salvarPosicaoAgora(livro.id, ultimaPosicao.current)
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

  const porcentagem = Math.round((onde?.fraction ?? livro.progresso) * 100)
  const capitulo = onde?.tocItem?.label?.trim()
  const paginas = preferencias.fluxo === 'paginas'

  return (
    <main
      className="leitor"
      aria-label={`Lendo ${livro.titulo}`}
      data-cfi={onde?.cfi}
      data-barras={barras || painel ? 'visiveis' : 'ocultas'}
      onMouseMove={mostrarBarras}
    >
      <header className="leitor-barra leitor-topo">
        <button type="button" className="botao-icone" aria-label="Voltar à biblioteca" onClick={aoVoltar}>
          <Icone nome="voltar" />
        </button>
        <div className="leitor-titulo">
          <span className="leitor-nome">{livro.titulo}</span>
          {capitulo && <span className="leitor-capitulo">{capitulo}</span>}
        </div>
        <button type="button" className="botao-icone" aria-label="Sumário" onClick={() => setPainel('sumario')}>
          <Icone nome="sumario" />
        </button>
        <button type="button" className="botao-icone botao-aa" aria-label="Ajustes de leitura" onClick={() => setPainel('ajustes')}>
          Aa
        </button>
      </header>

      <div className="leitor-livro" ref={host} onWheel={e => aoRolar(e.nativeEvent)} />

      {estado === 'abrindo' && (
        <p className="leitor-aviso" role="status">
          Abrindo o livro…
        </p>
      )}
      {estado === 'erro' && (
        <div className="leitor-aviso leitor-erro" role="alert">
          <Icone nome="aviso" />
          <h2>Não consegui abrir este livro</h2>
          <p>O arquivo pode estar danificado. Você pode removê-lo da biblioteca e adicioná-lo de novo.</p>
          <button type="button" className="botao principal" onClick={aoVoltar}>
            Voltar à biblioteca
          </button>
        </div>
      )}

      {paginas && estado === 'pronto' && (
        <>
          <button
            type="button"
            className="leitor-barra virar virar-anterior"
            aria-label="Página anterior"
            onClick={() => void visao.current?.prev()}
          >
            <Icone nome="voltar" />
          </button>
          <button
            type="button"
            className="leitor-barra virar virar-proxima"
            aria-label="Próxima página"
            onClick={() => void visao.current?.next()}
          >
            <Icone nome="avancar" />
          </button>
        </>
      )}

      <footer className="leitor-barra leitor-rodape">
        <div className="barra-livro" aria-hidden="true">
          <i style={{ width: `${porcentagem}%` }} />
        </div>
        <div className="rodape-textos">
          <span className="rodape-capitulo">{capitulo ?? ''}</span>
          <span>{onde?.time ? faltaNoCapitulo(onde.time.section) : ''}</span>
          <span>{porcentagem}% do livro</span>
        </div>
      </footer>

      <Sumario
        aberto={painel === 'sumario'}
        aoFechar={() => setPainel(null)}
        itens={sumario}
        atual={onde?.tocItem?.href}
        aoIr={href => {
          setPainel(null)
          void visao.current?.goTo(href)
        }}
      />
      <AjustesLeitura
        aberto={painel === 'ajustes'}
        aoFechar={() => setPainel(null)}
        preferencias={preferencias}
        aoMudar={aoMudarPreferencias}
      />
    </main>
  )
}
