// A capa do livro. Sem imagem, vira uma capa tipográfica com uma cor tirada do título.

import { useState } from 'react'
import type { Livro } from '@nucleo/tipos'
import { urlDoArquivo } from '../api'

// Tons fechados que conversam com a ameixa; o título creme fica acima de 5,8:1 em todos.
const TONS = ['#5b2a55', '#7a4a2e', '#34466b', '#4d5a36', '#7b3b46', '#2f5552', '#5a4a7a', '#7a5a2a']

const tomDoTitulo = (titulo: string) => {
  let soma = 0
  for (const letra of titulo) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0
  return TONS[soma % TONS.length]
}

export function Capa({ livro, tamanho = 'normal' }: { livro: Livro; tamanho?: 'normal' | 'grande' | 'pequena' }) {
  const [falhou, setFalhou] = useState(false)

  if (livro.capa && !falhou) {
    return (
      <img
        className={`capa capa-${tamanho}`}
        src={urlDoArquivo(livro, livro.capa)}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFalhou(true)}
      />
    )
  }

  return (
    <div className={`capa capa-${tamanho} capa-tipografica`} style={{ background: tomDoTitulo(livro.titulo) }} aria-hidden="true">
      <span className="capa-titulo">{livro.titulo}</span>
      {livro.autores[0] && <span className="capa-autor">{livro.autores[0]}</span>}
    </div>
  )
}
