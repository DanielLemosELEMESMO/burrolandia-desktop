// O dock: a navegação principal flutua na base da janela, nunca numa barra lateral. É simétrico:
// Importar no meio, dois itens de cada lado (Ajustes é sempre o último; no leitor, abre o Aa).
// O botão de recolher fica de fora, ao lado, e só aparece com o ponteiro perto (ou com o foco do
// teclado). Recolhido, vira um botão pequeno; a escolha vale para todas as telas e fica guardada.
// No leitor, o dock mora na faixa de baixo e some junto com ela enquanto você lê.

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icone, type NomeDoIcone } from './Icone'

export type Destino = 'inicio' | 'biblioteca'

export interface Navegacao {
  aoIr: (destino: Destino) => void
  aoImportar: () => void
  aoBuscar: () => void
}

const CHAVE = 'burrolandia:dock'
/** Até quantos pixels do dock o ponteiro precisa chegar para o botão de recolher aparecer. */
const PERTO = 96

function lerRecolhido() {
  try {
    return localStorage.getItem(CHAVE) === 'recolhido'
  } catch {
    return false
  }
}

function guardarRecolhido(recolhido: boolean) {
  try {
    localStorage.setItem(CHAVE, recolhido ? 'recolhido' : 'aberto')
  } catch {
    // Sem armazenamento local, o dock só não lembra como estava.
  }
}

function Item({
  icone,
  rotulo,
  nomeAcessivel,
  atual,
  aoClicar,
}: {
  icone: NomeDoIcone
  rotulo: string
  nomeAcessivel?: string
  atual?: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      className="dock-item"
      aria-label={nomeAcessivel}
      aria-current={atual ? 'page' : undefined}
      onClick={aoClicar}
    >
      <Icone nome={icone} />
      <span>{rotulo}</span>
    </button>
  )
}

/** Avisa quando o ponteiro chega perto do elemento (ou se afasta), sem renderizar a cada movimento. */
function usarPerto(elemento: RefObject<HTMLElement | null>, ativo: boolean) {
  const [perto, setPerto] = useState(false)
  useEffect(() => {
    if (!ativo) return
    let atual = false
    const aoMover = (evento: PointerEvent) => {
      const caixa = elemento.current?.getBoundingClientRect()
      if (!caixa) return
      const dx = Math.max(caixa.left - evento.clientX, 0, evento.clientX - caixa.right)
      const dy = Math.max(caixa.top - evento.clientY, 0, evento.clientY - caixa.bottom)
      const agora = Math.hypot(dx, dy) <= PERTO
      if (agora === atual) return
      atual = agora
      setPerto(agora)
    }
    window.addEventListener('pointermove', aoMover, { passive: true })
    window.addEventListener('pointerdown', aoMover, { passive: true })
    return () => {
      window.removeEventListener('pointermove', aoMover)
      window.removeEventListener('pointerdown', aoMover)
      setPerto(false)
    }
  }, [elemento, ativo])
  return perto
}

export function Dock({
  atual,
  navegacao,
  aoAjustes,
  naFaixa = false,
}: {
  atual: Destino | null
  navegacao: Navegacao
  /** Abre os ajustes de leitura (no leitor, o painel Aa). */
  aoAjustes: () => void
  /** No leitor: dentro da faixa de baixo, menor e sem flutuar. */
  naFaixa?: boolean
}) {
  const [recolhido, setRecolhido] = useState(lerRecolhido)
  const alternou = useRef(false)
  const alternar = useRef<HTMLButtonElement>(null)
  const nav = useRef<HTMLElement>(null)
  const perto = usarPerto(nav, !recolhido)

  // Quem recolheu ou abriu pelo teclado continua com o foco no botão que trocou de lugar.
  useEffect(() => {
    if (alternou.current) alternar.current?.focus()
    alternou.current = false
  }, [recolhido])

  const mudar = (valor: boolean) => {
    alternou.current = true
    guardarRecolhido(valor)
    setRecolhido(valor)
  }

  if (recolhido) {
    return (
      <div className={naFaixa ? 'dock-recolhido dock-recolhido-na-faixa' : 'dock-recolhido'}>
        <button
          ref={alternar}
          type="button"
          className="dock-mostrar"
          aria-label="Mostrar a navegação"
          aria-expanded={false}
          onClick={() => mudar(false)}
        >
          <Icone nome="mostrar" />
        </button>
      </div>
    )
  }

  const { aoIr, aoImportar, aoBuscar } = navegacao
  return (
    <div className={naFaixa ? 'dock-zona dock-zona-na-faixa' : 'dock-zona'}>
      <nav ref={nav} className={naFaixa ? 'dock dock-na-faixa' : 'dock'} aria-label="Navegação principal">
        <Item icone="casa" rotulo="Início" atual={atual === 'inicio'} aoClicar={() => aoIr('inicio')} />
        <Item icone="estante" rotulo="Biblioteca" atual={atual === 'biblioteca'} aoClicar={() => aoIr('biblioteca')} />
        <button type="button" className="dock-importar" aria-label="Importar livro" onClick={aoImportar}>
          <span className="dock-importar-circulo">
            <Icone nome="mais" />
          </span>
          <span>Importar</span>
        </button>
        <Item icone="lupa" rotulo="Buscar" nomeAcessivel="Buscar na biblioteca" aoClicar={aoBuscar} />
        <Item icone="ajustes" rotulo="Ajustes" nomeAcessivel="Ajustes de leitura" aoClicar={aoAjustes} />
      </nav>
      <button
        ref={alternar}
        type="button"
        className="dock-recolher"
        data-perto={perto || undefined}
        aria-label="Recolher a navegação"
        aria-expanded={true}
        onClick={() => mudar(true)}
      >
        <Icone nome="recolher" />
      </button>
    </div>
  )
}
