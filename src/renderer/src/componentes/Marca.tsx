// A marca, vetorizada fielmente do kit (docs/marca/referencias; os SVG ficam em ../marca): o burro de
// coroa, a variação de óculos escuros e a assinatura "Burrolândia" dourada, com a coroa no lugar do
// acento do â e o brilho no fim. Só as cinco cores da paleta. O burro e a assinatura vão sobre ameixa.

import assinaturaDourada from '../marca/assinatura-dourada.svg'
import burro from '../marca/burro.svg'
import variacaoIcone from '../marca/variacao-icone.svg'

/** O burro de coroa (creme, com os detalhes em ameixa): sobre fundo ameixa. */
export function Burro({ className = 'burro' }: { className?: string }) {
  return <img className={className} src={burro} alt="" draggable={false} />
}

/** A variação bem-humorada (de óculos escuros), no ladrilho creme do kit: estado vazio, campanhas. */
export function BurroDeOculos({ className = 'burro' }: { className?: string }) {
  return <img className={className} src={variacaoIcone} alt="" draggable={false} />
}

/** "Burrolândia" dourada. O leitor de tela ouve o nome com acento. */
export function Assinatura({ className = '' }: { className?: string }) {
  return (
    <span className={`assinatura ${className}`}>
      <span className="so-leitor-de-tela">Burrolândia</span>
      <img src={assinaturaDourada} alt="" draggable={false} />
    </span>
  )
}
