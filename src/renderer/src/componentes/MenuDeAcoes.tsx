// Menu "Mais ações" de um livro: botão com aria-haspopup e itens navegáveis por setas.

import { useEffect, useId, useRef, useState } from 'react'
import { Icone } from './Icone'

export interface Acao {
  rotulo: string
  perigosa?: boolean
  aoEscolher: () => void
}

export function MenuDeAcoes({ rotulo, acoes }: { rotulo: string; acoes: Acao[] }) {
  const [aberto, setAberto] = useState(false)
  const idMenu = useId()
  const botao = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  const itens = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

  const fechar = (devolverFoco = true) => {
    setAberto(false)
    if (devolverFoco) botao.current?.focus()
  }

  useEffect(() => {
    if (!aberto) return
    itens()[0]?.focus()
    const fora = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) fechar(false)
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto])

  const teclas = (e: React.KeyboardEvent) => {
    const lista = itens()
    const atual = lista.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fechar()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      lista[(atual + 1) % lista.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      lista[(atual - 1 + lista.length) % lista.length]?.focus()
    } else if (e.key === 'Tab') {
      fechar(false)
    }
  }

  return (
    <div className="menu-de-acoes">
      <button
        ref={botao}
        type="button"
        className="botao-icone"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={() => setAberto(a => !a)}
      >
        <Icone nome="maisAcoes" />
      </button>
      {aberto && (
        <div ref={menu} id={idMenu} role="menu" aria-label={rotulo} className="menu" onKeyDown={teclas}>
          {acoes.map(acao => (
            <button
              key={acao.rotulo}
              type="button"
              role="menuitem"
              className={acao.perigosa ? 'menu-item perigoso' : 'menu-item'}
              onClick={() => {
                fechar(false)
                acao.aoEscolher()
              }}
            >
              {acao.perigosa && <Icone nome="lixeira" />}
              {acao.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
