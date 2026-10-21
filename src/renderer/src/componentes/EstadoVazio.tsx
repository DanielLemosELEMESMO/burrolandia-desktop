// A biblioteca vazia: o lugar certo para o burro de óculos e um pouco de humor.

import { Icone } from './Icone'
import { BurroDeOculos } from './Marca'

export function EstadoVazio({ titulo, aoImportar }: { titulo: string; aoImportar: () => void }) {
  return (
    <div className="vazio">
      <BurroDeOculos className="vazio-burro" />
      <h1>{titulo}</h1>
      <h2>Sua biblioteca está vazia</h2>
      <p>
        Por enquanto, só tem o burro por aqui. Traga um EPUB ou PDF do seu computador — ou arraste o arquivo para
        esta janela.
      </p>
      <button type="button" className="botao principal" onClick={aoImportar}>
        <Icone nome="mais" />
        Importar livro
      </button>
    </div>
  )
}
