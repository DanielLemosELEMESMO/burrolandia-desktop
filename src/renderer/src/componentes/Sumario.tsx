import { useEffect, useRef } from 'react'
import type { ItemDoSumario } from '../leitor/foliate'
import { Dialogo } from './Dialogo'

function Itens({ itens, atual, aoIr }: { itens: ItemDoSumario[]; atual?: string; aoIr: (href: string) => void }) {
  return (
    <ol>
      {itens.map((item, i) => (
        <li key={`${item.href}-${i}`}>
          <button
            type="button"
            className="sumario-item"
            aria-current={item.href === atual ? 'location' : undefined}
            onClick={() => aoIr(item.href)}
          >
            {item.label?.trim() || 'Sem título'}
          </button>
          {item.subitems && item.subitems.length > 0 && <Itens itens={item.subitems} atual={atual} aoIr={aoIr} />}
        </li>
      ))}
    </ol>
  )
}

export function Sumario({
  aberto,
  aoFechar,
  itens,
  atual,
  aoIr,
}: {
  aberto: boolean
  aoFechar: () => void
  itens: ItemDoSumario[]
  atual?: string
  aoIr: (href: string) => void
}) {
  const lista = useRef<HTMLElement>(null)

  // Ao abrir, o foco vai para o capítulo em que você está.
  useEffect(() => {
    if (!aberto) return
    const item = lista.current?.querySelector<HTMLButtonElement>('[aria-current]')
    item?.focus()
    item?.scrollIntoView({ block: 'center' })
  }, [aberto])

  return (
    <Dialogo aberto={aberto} titulo="Sumário" aoFechar={aoFechar} variante="lateral-esquerda" comFechar>
      <nav ref={lista} className="sumario" aria-label="Capítulos">
        {itens.length ? (
          <Itens itens={itens} atual={atual} aoIr={aoIr} />
        ) : (
          <p className="dica">Este livro não trouxe um sumário.</p>
        )}
      </nav>
    </Dialogo>
  )
}
