// Adicionar livro com início, meio e fim: "Preparando seu livro" → "Seu livro está na biblioteca".

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AndamentoImportacao, Livro, ResultadoImportacao } from '@nucleo/tipos'
import { api } from '../api'
import { Capa } from './Capa'
import { Dialogo } from './Dialogo'
import { Icone } from './Icone'

type Estado =
  | { fase: 'ocioso' }
  | { fase: 'andamento'; andamento: AndamentoImportacao }
  | { fase: 'fim'; livro: Livro }
  | { fase: 'repetido'; livro: Livro }
  | { fase: 'erro'; mensagem: string }

const FALHA_INESPERADA = 'Algo deu errado ao adicionar o livro. Tente de novo; se continuar, reinicie o app.'

export function useImportacao(aoMudarBiblioteca: () => void) {
  const [estado, setEstado] = useState<Estado>({ fase: 'ocioso' })
  const importando = useRef(false)

  useEffect(
    () =>
      api.biblioteca.aoAndamento(andamento => {
        if (importando.current) setEstado({ fase: 'andamento', andamento })
      }),
    [],
  )

  const concluir = useCallback(
    (resultado: ResultadoImportacao | null) => {
      importando.current = false
      if (!resultado) return setEstado({ fase: 'ocioso' })
      if (resultado.tipo === 'adicionado') {
        aoMudarBiblioteca()
        setEstado({ fase: 'fim', livro: resultado.livro })
      } else if (resultado.tipo === 'repetido') setEstado({ fase: 'repetido', livro: resultado.livro })
      else setEstado({ fase: 'erro', mensagem: resultado.mensagem })
    },
    [aoMudarBiblioteca],
  )

  const executar = useCallback(
    async (acao: () => Promise<ResultadoImportacao | null>) => {
      if (importando.current) return
      importando.current = true
      try {
        concluir(await acao())
      } catch (e) {
        console.error(e)
        importando.current = false
        setEstado({ fase: 'erro', mensagem: FALHA_INESPERADA })
      }
    },
    [concluir],
  )

  const adicionar = useCallback(() => executar(() => api.biblioteca.adicionar()), [executar])
  const importar = useCallback(
    (caminho: string) => {
      if (importando.current) return Promise.resolve()
      setEstado({ fase: 'andamento', andamento: { etapa: 'lendo' } })
      return executar(() => api.biblioteca.importar(caminho))
    },
    [executar],
  )
  const fechar = useCallback(() => setEstado({ fase: 'ocioso' }), [])

  return { estado, adicionar, importar, fechar }
}

const ETAPAS: { etapa: AndamentoImportacao['etapa']; rotulo: string }[] = [
  { etapa: 'lendo', rotulo: 'Lendo o arquivo' },
  { etapa: 'adaptando', rotulo: 'Adaptando o texto para qualquer tela' },
  { etapa: 'guardando', rotulo: 'Guardando na sua biblioteca' },
]

function Andamento({ andamento }: { andamento: AndamentoImportacao }) {
  const atual = ETAPAS.findIndex(e => e.etapa === andamento.etapa)
  const comContagem = andamento.total ? Math.round(((andamento.atual ?? 0) / andamento.total) * 100) : null
  return (
    <>
      <ol className="etapas">
        {ETAPAS.filter(e => e.etapa !== 'adaptando' || andamento.etapa === 'adaptando').map(e => {
          const indice = ETAPAS.indexOf(e)
          const situacao = indice < atual ? 'feita' : indice === atual ? 'atual' : 'depois'
          return (
            <li key={e.etapa} data-situacao={situacao} aria-current={situacao === 'atual' ? 'step' : undefined}>
              {e.rotulo}
              {situacao === 'atual' && andamento.total ? ` — página ${andamento.atual} de ${andamento.total}` : ''}
            </li>
          )
        })}
      </ol>
      <div
        className={comContagem === null ? 'barra-andamento indeterminada' : 'barra-andamento'}
        role="progressbar"
        aria-label="Andamento"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={comContagem ?? undefined}
      >
        <i style={comContagem === null ? undefined : { width: `${comContagem}%` }} />
      </div>
    </>
  )
}

function LivroResumo({ livro }: { livro: Livro }) {
  return (
    <div className="livro-resumo">
      <Capa livro={livro} tamanho="pequena" />
      <div>
        <strong>{livro.titulo}</strong>
        {livro.autores.length > 0 && <span className="livro-resumo-autor">{livro.autores.join(', ')}</span>}
      </div>
    </div>
  )
}

export function DialogosDeImportacao({
  estado,
  aoFechar,
  aoLer,
}: {
  estado: Estado
  aoFechar: () => void
  aoLer: (livro: Livro) => void
}) {
  return (
    <>
      <Dialogo aberto={estado.fase === 'andamento'} titulo="Preparando seu livro" aoFechar={() => {}} travado>
        {estado.fase === 'andamento' && <Andamento andamento={estado.andamento} />}
      </Dialogo>

      <Dialogo aberto={estado.fase === 'fim'} titulo="Seu livro está na biblioteca" aoFechar={aoFechar}>
        {estado.fase === 'fim' && (
          <div className="fim" role="status">
            <span className="selo">
              <Icone nome="check" />
            </span>
            <LivroResumo livro={estado.livro} />
            <ol className="proximos">
              <li className="feito">Guardado na sua biblioteca, neste computador</li>
              <li>Quando você ler, o app lembra sozinho onde parou</li>
            </ol>
            <div className="botoes">
              <button type="button" className="botao principal" onClick={() => aoLer(estado.livro)}>
                Começar a ler
              </button>
              <button type="button" className="botao" onClick={aoFechar}>
                Voltar à biblioteca
              </button>
            </div>
          </div>
        )}
      </Dialogo>

      <Dialogo aberto={estado.fase === 'repetido'} titulo="Esse livro já está na sua biblioteca" aoFechar={aoFechar}>
        {estado.fase === 'repetido' && (
          <>
            <LivroResumo livro={estado.livro} />
            <div className="botoes">
              <button type="button" className="botao principal" onClick={() => aoLer(estado.livro)}>
                Abrir o livro
              </button>
              <button type="button" className="botao" onClick={aoFechar}>
                Voltar à biblioteca
              </button>
            </div>
          </>
        )}
      </Dialogo>

      <Dialogo aberto={estado.fase === 'erro'} titulo="Não deu para adicionar este arquivo" aoFechar={aoFechar} alerta>
        {estado.fase === 'erro' && (
          <>
            <p className="mensagem-erro">{estado.mensagem}</p>
            <div className="botoes">
              <button type="button" className="botao principal" onClick={aoFechar}>
                Entendi
              </button>
            </div>
          </>
        )}
      </Dialogo>
    </>
  )
}
