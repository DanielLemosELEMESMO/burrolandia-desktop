// O dock: a navegação principal flutua na base da janela, nunca numa barra lateral.
// Nas telas da biblioteca, recolhe num botão pequeno e volta com um clique (ou Enter);
// no leitor, mora na faixa de baixo e some junto com ela enquanto você lê.

import { useEffect, useRef, useState } from 'react'
import { Icone, type NomeDoIcone } from './Icone'

export type Destino = 'inicio' | 'biblioteca'

export interface Navegacao {
  aoIr: (destino: Destino) => void
  aoImportar: () => void
  aoBuscar: () => void
}

const CHAVE = 'burrolandia:dock'

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

export function Dock({
  atual,
  navegacao,
  aoAjustes,
  naFaixa = false,
}: {
  atual: Destino | null
  navegacao: Navegacao
  /** Sem isto, o item Ajustes não aparece (no leitor, o Aa fica no topo). */
  aoAjustes?: () => void
  /** No leitor: dentro da faixa de baixo, sem recolher por conta própria. */
  naFaixa?: boolean
}) {
  const [recolhido, setRecolhido] = useState(() => !naFaixa && lerRecolhido())
  const alternou = useRef(false)
  const alternar = useRef<HTMLButtonElement>(null)

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
      <div className="dock-recolhido">
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
    <nav className={naFaixa ? 'dock dock-na-faixa' : 'dock'} aria-label="Navegação principal">
      <Item icone="casa" rotulo="Início" atual={atual === 'inicio'} aoClicar={() => aoIr('inicio')} />
      <Item icone="estante" rotulo="Biblioteca" atual={atual === 'biblioteca'} aoClicar={() => aoIr('biblioteca')} />
      <button type="button" className="dock-importar" aria-label="Importar livro" onClick={aoImportar}>
        <span className="dock-importar-circulo">
          <Icone nome="mais" />
        </span>
        <span>Importar</span>
      </button>
      <Item icone="lupa" rotulo="Buscar" nomeAcessivel="Buscar na biblioteca" aoClicar={aoBuscar} />
      {aoAjustes && <Item icone="ajustes" rotulo="Ajustes" nomeAcessivel="Ajustes de leitura" aoClicar={aoAjustes} />}
      {!naFaixa && (
        <button
          ref={alternar}
          type="button"
          className="dock-recolher"
          aria-label="Recolher a navegação"
          aria-expanded={true}
          onClick={() => mudar(true)}
        >
          <Icone nome="recolher" />
        </button>
      )}
    </nav>
  )
}
