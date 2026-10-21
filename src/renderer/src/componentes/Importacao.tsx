// Adicionar livro com início, meio e fim: "Preparando seu livro" → "Seu livro está na biblioteca".

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AndamentoImportacao, Livro, ResultadoImportacao } from '@nucleo/tipos'
import { api, urlDoArquivo } from '../api'
import { gerarCapaDoPdf } from '../leitor/pdf'
import { Capa } from './Capa'
import { Dialogo } from './Dialogo'
import { Burro } from './Marca'

type Estado =
  | { fase: 'ocioso' }
  | { fase: 'andamento'; andamento: AndamentoImportacao; adaptou: boolean }
  | { fase: 'fim'; livro: Livro; aviso?: string }
  | { fase: 'repetido'; livro: Livro; aviso?: string }
  | { fase: 'erro'; mensagem: string; aviso?: string }

const FALHA_INESPERADA = 'Algo deu errado ao adicionar o livro. Tente de novo; se continuar, reinicie o app.'
// Arquivo arrastado de outro app (um anexo, um download em andamento) pode não ter caminho no disco.
const SEM_CAMINHO =
  'Não deu para saber onde esse arquivo está no computador. Salve-o numa pasta e arraste de lá, ou use Importar livro.'

/** PDFs chegam sem capa: a primeira página vira a capa. Se falhar, fica a capa tipográfica. */
export async function comCapa(livro: Livro): Promise<Livro> {
  if (livro.formatoOriginal !== 'pdf' || livro.capa) return livro
  try {
    const imagem = await gerarCapaDoPdf(urlDoArquivo(livro, livro.arquivoOriginal))
    return (await api.biblioteca.salvarCapa(livro.id, imagem)) ?? livro
  } catch (e) {
    console.warn('Não deu para gerar a capa do PDF', e)
    return livro
  }
}

export function useImportacao(aoMudarBiblioteca: () => void) {
  const [estado, setEstado] = useState<Estado>({ fase: 'ocioso' })
  const importando = useRef(false)
  // O passo "Adaptando" continua na lista depois que termina (só aparece para PDF).
  const adaptou = useRef(false)
  const aviso = useRef<string | undefined>(undefined)

  useEffect(
    () =>
      api.biblioteca.aoAndamento(andamento => {
        if (!importando.current) return
        if (andamento.etapa === 'adaptando') adaptou.current = true
        setEstado({ fase: 'andamento', andamento, adaptou: adaptou.current })
      }),
    [],
  )

  const concluir = useCallback(
    async (resultado: ResultadoImportacao | null) => {
      if (!resultado) {
        importando.current = false
        return setEstado({ fase: 'ocioso' })
      }
      if (resultado.tipo === 'adicionado') {
        const livro = await comCapa(resultado.livro)
        importando.current = false
        aoMudarBiblioteca()
        setEstado({ fase: 'fim', livro, aviso: aviso.current })
        // Depois da capa (a do PDF vem da primeira página), procura a obra no catálogo, sem esperar.
        void api.catalogo.reconhecer(livro.id).catch(() => {})
        return
      }
      importando.current = false
      if (resultado.tipo === 'repetido') setEstado({ fase: 'repetido', livro: resultado.livro, aviso: aviso.current })
      else setEstado({ fase: 'erro', mensagem: resultado.mensagem, aviso: aviso.current })
    },
    [aoMudarBiblioteca],
  )

  const executar = useCallback(
    async (acao: () => Promise<ResultadoImportacao | null>) => {
      if (importando.current) return
      importando.current = true
      adaptou.current = false
      try {
        await concluir(await acao())
      } catch (e) {
        console.error(e)
        importando.current = false
        setEstado({ fase: 'erro', mensagem: FALHA_INESPERADA })
      }
    },
    [concluir],
  )

  const adicionar = useCallback(() => {
    aviso.current = undefined
    return executar(() => api.biblioteca.adicionar())
  }, [executar])
  /** Importa um arquivo arrastado; o aviso aparece no fim (por exemplo, quando vieram vários). */
  const importar = useCallback(
    (caminho: string, avisoNoFim?: string) => {
      if (importando.current) return Promise.resolve()
      if (!caminho) {
        setEstado({ fase: 'erro', mensagem: SEM_CAMINHO })
        return Promise.resolve()
      }
      aviso.current = avisoNoFim
      setEstado({ fase: 'andamento', andamento: { etapa: 'lendo' }, adaptou: false })
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

function Andamento({ andamento, adaptou }: { andamento: AndamentoImportacao; adaptou: boolean }) {
  const atual = ETAPAS.findIndex(e => e.etapa === andamento.etapa)
  const comContagem = andamento.total ? Math.round(((andamento.atual ?? 0) / andamento.total) * 100) : null
  return (
    <>
      <ol className="etapas">
        {ETAPAS.filter(e => e.etapa !== 'adaptando' || adaptou).map(e => {
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

export function LivroResumo({ livro }: { livro: Livro }) {
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
        {estado.fase === 'andamento' && <Andamento andamento={estado.andamento} adaptou={estado.adaptou} />}
      </Dialogo>

      <Dialogo aberto={estado.fase === 'fim'} titulo="Seu livro está na biblioteca" aoFechar={aoFechar} icone={<Burro />}>
        {estado.fase === 'fim' && (
          <div className="fim" role="status">
            <LivroResumo livro={estado.livro} />
            <ol className="proximos">
              <li className="feito">Guardado na sua biblioteca, neste computador</li>
              {estado.livro.formatoOriginal === 'pdf' &&
                (estado.livro.arquivoLeitura ? (
                  <li className="feito">PDF desamassado: o texto se ajusta a qualquer tela, e a página original fica a um clique</li>
                ) : (
                  <li>Este PDF é uma imagem digitalizada: ele abre como foi impresso</li>
                ))}
              <li>Quando você ler, o app lembra sozinho onde parou</li>
            </ol>
            {estado.aviso && <p className="dica aviso-importacao">{estado.aviso}</p>}
            <div className="botoes">
              <button type="button" className="botao principal" onClick={() => aoLer(estado.livro)}>
                Começar a ler
              </button>
              <button type="button" className="botao" onClick={aoFechar}>
                Agora não
              </button>
            </div>
          </div>
        )}
      </Dialogo>

      <Dialogo aberto={estado.fase === 'repetido'} titulo="Esse livro já está na sua biblioteca" aoFechar={aoFechar}>
        {estado.fase === 'repetido' && (
          <>
            <LivroResumo livro={estado.livro} />
            {estado.aviso && <p className="dica aviso-importacao">{estado.aviso}</p>}
            <div className="botoes">
              <button type="button" className="botao principal" onClick={() => aoLer(estado.livro)}>
                Abrir o livro
              </button>
              <button type="button" className="botao" onClick={aoFechar}>
                Agora não
              </button>
            </div>
          </>
        )}
      </Dialogo>

      <Dialogo aberto={estado.fase === 'erro'} titulo="Não deu para adicionar este arquivo" aoFechar={aoFechar} alerta>
        {estado.fase === 'erro' && (
          <>
            <p className="mensagem-erro">{estado.mensagem}</p>
            {estado.aviso && <p className="dica aviso-importacao">{estado.aviso}</p>}
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
