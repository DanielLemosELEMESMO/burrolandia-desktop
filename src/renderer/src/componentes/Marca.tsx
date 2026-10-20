// A marca em SVG (docs/marca): o burro de coroa, a variação de óculos escuros e a assinatura
// "Burrolândia", com a coroa no lugar do acento do â. O burro é creme: vai sobre fundo ameixa.

const CREME = '#F6EBDD'
const FOCINHO = '#E4D0B8'
const AMEIXA = '#2F0E2F'
const OURO = '#D4AF7C'
const GRAFITE = '#1F1F24'

/** A coroa sozinha, no ouro da marca (24×18). */
export function Coroa({ className = 'coroa' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 18" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M2 14.6L3.4 4.6 8 9.6 12 2.6l4 7 4.6-5L22 14.6z" />
      <rect x="2" y="14" width="20" height="3.4" rx="1" />
      <circle cx="3.4" cy="3.6" r="1.7" />
      <circle cx="12" cy="1.8" r="1.7" />
      <circle cx="20.6" cy="3.6" r="1.7" />
    </svg>
  )
}

function Olhos({ oculos }: { oculos: boolean }) {
  if (oculos) {
    return (
      <>
        <path d="M41 60H87" stroke={GRAFITE} strokeWidth="3" strokeLinecap="round" />
        <path d="M42 59h18c0 7-3 12-9 12s-9-5-9-12z" fill={GRAFITE} />
        <path d="M68 59h18c0 7-3 12-9 12s-9-5-9-12z" fill={GRAFITE} />
        <path d="M46 62h4M72 62h4" stroke={CREME} strokeWidth="1.8" strokeLinecap="round" opacity=".7" />
      </>
    )
  }
  // Pálpebras a meio mastro: o ar de quem já leu o livro antes de você.
  return (
    <>
      <path d="M45 63h13M70 63h13" stroke={AMEIXA} strokeWidth="3.6" strokeLinecap="round" />
      <path d="M47.4 63.6a4.1 4.1 0 0 0 8.2 0zM72.4 63.6a4.1 4.1 0 0 0 8.2 0z" fill={AMEIXA} />
    </>
  )
}

/** O burro de coroa (128×128). Com óculos, é a variação bem-humorada (estado vazio, campanhas). */
export function Burro({ oculos = false, className = 'burro' }: { oculos?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <path d="M50 44C40 33 27 18 25 7c-1-5 4-6 8-2 11 11 22 24 28 34z" fill={CREME} />
      <path d="M51 37c-7-8-15-17-20-26 8 7 17 16 24 24z" fill={AMEIXA} opacity=".45" />
      <path d="M69 39c7-12 20-24 31-32 4-3 9 0 7 5-5 12-17 25-27 33z" fill={CREME} />
      <path d="M75 35c6-8 15-17 24-23-4 9-12 18-19 25z" fill={AMEIXA} opacity=".45" />
      <path
        d="M64 34c16 0 26 11 25 28-1 12-5 20-6 28 7 6 9 18 4 26-6 8-40 8-46 0-5-8-3-20 4-26-1-8-5-16-6-28-1-17 9-28 25-28z"
        fill={CREME}
      />
      <path d="M43 98c3-6 39-6 42 0 4 8 2 16-3 20-8 5-28 5-36 0-5-4-7-12-3-20z" fill={FOCINHO} />
      <Olhos oculos={oculos} />
      <ellipse cx="55" cy="104" rx="3" ry="4.3" transform="rotate(-16 55 104)" fill={AMEIXA} />
      <ellipse cx="73" cy="104" rx="3" ry="4.3" transform="rotate(16 73 104)" fill={AMEIXA} />
      <path d="M57 114.5c6 3 12 2 17.5-2.5" fill="none" stroke={AMEIXA} strokeWidth="2.8" strokeLinecap="round" />
      <g transform="rotate(12 75 27)" fill={OURO}>
        <path d="M64 33l1.4-13 4.6 6 5-10 5 10 4.6-6L86 33z" />
        <rect x="64" y="32" width="22" height="4.6" rx="1.4" />
        <circle cx="65.4" cy="19" r="2" />
        <circle cx="75" cy="15" r="2" />
        <circle cx="84.6" cy="19" r="2" />
      </g>
    </svg>
  )
}

/** "Burrolândia" em Fraunces, com a coroa sobre o a. O leitor de tela ouve o nome com acento. */
export function Assinatura({ className = '' }: { className?: string }) {
  return (
    <span className={`assinatura ${className}`}>
      <span className="so-leitor-de-tela">Burrolândia</span>
      <span aria-hidden="true">
        Burrol
        <span className="assinatura-a">
          a
          <Coroa className="assinatura-coroa" />
        </span>
        ndia
      </span>
    </span>
  )
}
