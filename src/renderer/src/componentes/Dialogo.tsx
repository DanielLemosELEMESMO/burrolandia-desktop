// Diálogo modal com o <dialog> nativo: foco preso, Esc fecha e o foco volta para quem abriu.

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Icone } from './Icone'

interface Props {
  aberto: boolean
  titulo: string
  aoFechar: () => void
  /** Diálogos que pedem atenção (erro, confirmação) usam role="alertdialog". */
  alerta?: boolean
  /** Enquanto true, Esc e o clique fora não fecham (por exemplo, durante a importação). */
  travado?: boolean
  /** 'central' (padrão) ou um painel lateral. */
  variante?: 'central' | 'lateral-esquerda' | 'lateral-direita'
  /** Mostra o botão de fechar no canto. */
  comFechar?: boolean
  /** Uma figura ao lado do título (por exemplo, o burro no sucesso da importação). */
  icone?: ReactNode
  children: ReactNode
}

export function Dialogo({
  aberto,
  titulo,
  aoFechar,
  alerta,
  travado,
  variante = 'central',
  comFechar,
  icone,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (aberto && !dialogo.open) dialogo.showModal()
    if (!aberto && dialogo.open) dialogo.close()
  }, [aberto])

  return (
    <dialog
      ref={ref}
      className={`dialogo dialogo-${variante} superficie-tema`}
      role={alerta ? 'alertdialog' : undefined}
      aria-labelledby={idTitulo}
      onCancel={evento => {
        evento.preventDefault()
        if (!travado) aoFechar()
      }}
      onClick={evento => {
        if (evento.target === ref.current && !travado) aoFechar()
      }}
    >
      <div className="dialogo-conteudo">
        <div className="dialogo-cabeca">
          {icone && (
            <span className="dialogo-icone" aria-hidden="true">
              {icone}
            </span>
          )}
          <h2 id={idTitulo}>{titulo}</h2>
          {comFechar && (
            <button type="button" className="botao-icone" aria-label="Fechar" onClick={aoFechar}>
              <Icone nome="fechar" />
            </button>
          )}
        </div>
        {children}
      </div>
    </dialog>
  )
}
