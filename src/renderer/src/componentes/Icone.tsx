// Ícones de traço, desenhados à mão (24×24). Sempre acompanhados de texto ou de aria-label.

const CAMINHOS = {
  mais: 'M12 5v14M5 12h14',
  voltar: 'M15 18l-6-6 6-6',
  avancar: 'M9 18l6-6-6-6',
  sumario: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  fechar: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lixeira: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  maisAcoes: 'M5 12h.01M12 12h.01M19 12h.01',
  livro: 'M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2zM12 6.5v13',
  pagina: 'M7 3h7l5 5v13H7zM14 3v5h5',
  aviso: 'M12 8v5M12 16.5h.01M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  casa: 'M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  estante: 'M4.5 4h3.5v16H4.5zM10 4h3.5v16H10zM15.6 6.2l3.3-.9 3.6 14-3.3.9z',
  lupa: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.3 15.3L20 20',
  ajustes: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
  grade: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  lista: 'M4 5h3v3H4zM4 10.5h3v3H4zM4 16h3v3H4zM10.5 6.5H20M10.5 12H20M10.5 17.5H20',
  computador: 'M4 5h16v11H4zM9 20h6M12 16v4',
  recolher: 'M6 9l6 6 6-6',
  mostrar: 'M6 15l6-6 6 6',
  nuvem: 'M7.5 18.5h9.6a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 10.1a4.2 4.2 0 0 0 1.5 8.4z',
  pessoa: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  sincronizar: 'M19.5 11A7.6 7.6 0 0 0 6 7.2L4.5 8.6M4.5 4.5v4.1h4.1M4.5 13A7.6 7.6 0 0 0 18 16.8l1.5-1.4M19.5 19.5v-4.1h-4.1',
} as const

export type NomeDoIcone = keyof typeof CAMINHOS

export function Icone({ nome, className = 'icone' }: { nome: NomeDoIcone; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={nome === 'maisAcoes' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  )
}
