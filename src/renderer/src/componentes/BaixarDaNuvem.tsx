// Um livro que está só na nuvem desce ao abrir: "Baixando o livro" (e, num PDF, "Adaptando"), e ele
// abre na página onde você parou no outro aparelho.

import type { AndamentoDoDownload, Livro } from '@nucleo/tipos'
import { Dialogo } from './Dialogo'
import { LivroResumo } from './Importacao'

export interface Baixando {
  livro: Livro
  andamento: AndamentoDoDownload | null
  erro: string | null
}

function texto(andamento: AndamentoDoDownload | null): string {
  if (andamento?.etapa === 'adaptando') {
    return andamento.total ? `Adaptando o PDF — página ${andamento.atual} de ${andamento.total}…` : 'Adaptando o PDF…'
  }
  if (andamento?.etapa === 'guardando') return 'Guardando neste computador…'
  return 'Baixando da nuvem…'
}

export function DialogoDeDownload({
  estado,
  aoFechar,
  aoTentarDeNovo,
}: {
  estado: Baixando | null
  aoFechar: () => void
  aoTentarDeNovo: () => void
}) {
  const erro = estado?.erro
  return (
    <Dialogo
      aberto={!!estado}
      titulo={erro ? 'Não deu para baixar o livro' : 'Baixando o livro'}
      aoFechar={aoFechar}
      travado={!erro}
      alerta={!!erro}
    >
      {estado && (
        <>
          <LivroResumo livro={estado.livro} />
          {erro ? (
            <>
              <p className="mensagem-erro">{erro}</p>
              <div className="botoes">
                <button type="button" className="botao principal" onClick={aoTentarDeNovo}>
                  Tentar de novo
                </button>
                <button type="button" className="botao" onClick={aoFechar}>
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="sobre-andamento" role="status">
                <span className="girando" aria-hidden="true" />
                {texto(estado.andamento)}
              </p>
              <div className="barra-andamento indeterminada" role="progressbar" aria-label="Andamento">
                <i />
              </div>
            </>
          )}
        </>
      )}
    </Dialogo>
  )
}
