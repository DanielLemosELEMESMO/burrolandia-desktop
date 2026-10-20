// A biblioteca inteira: busca, ordem, formato e duas vistas — grade para passear, lista para arrumar.

import { useEffect, useRef, useState } from 'react'
import type { Livro } from '@nucleo/tipos'
import { organizarLivros, type FiltroDeFormato, type Ordem } from '@nucleo/organizar'
import { haQuantoTempo } from '@nucleo/tempo'
import { api } from '../api'
import { Capa } from '../componentes/Capa'
import { Dialogo } from '../componentes/Dialogo'
import { EstadoVazio } from '../componentes/EstadoVazio'
import { Icone } from '../componentes/Icone'
import { Assinatura } from '../componentes/Marca'
import { MenuDeAcoes } from '../componentes/MenuDeAcoes'

type Vista = 'grade' | 'lista'

const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'recentes', rotulo: 'Mais recentes' },
  { valor: 'titulo', rotulo: 'Título' },
  { valor: 'autor', rotulo: 'Autor' },
  { valor: 'progresso', rotulo: 'Progresso' },
]

const FORMATOS: { valor: FiltroDeFormato; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'epub', rotulo: 'EPUB' },
  { valor: 'pdf', rotulo: 'PDF' },
]

const porcentagem = (livro: Livro) => Math.round(livro.progresso * 100)
const autores = (livro: Livro) => livro.autores.join(', ')
const ultimaLeitura = (livro: Livro) =>
  livro.abertoEm ? `Lido ${haQuantoTempo(livro.abertoEm)}` : `Adicionado ${haQuantoTempo(livro.adicionadoEm)}`

/** O que o arquivo virou: EPUB, PDF com texto adaptado, ou PDF que só abre como foi impresso. */
const comoLe = (livro: Livro) =>
  livro.formatoOriginal === 'epub' ? null : livro.arquivoLeitura ? 'Texto adaptado' : 'Digitalizado'

// Ordem e vista ficam lembradas neste computador; a busca e o filtro, não.
function lembrado<T extends string>(chave: string, opcoes: readonly T[], padrao: T): T {
  try {
    const valor = localStorage.getItem(`burrolandia:${chave}`) as T | null
    return valor && opcoes.includes(valor) ? valor : padrao
  } catch {
    return padrao
  }
}

function lembrar(chave: string, valor: string) {
  try {
    localStorage.setItem(`burrolandia:${chave}`, valor)
  } catch {
    // Sem armazenamento local, a escolha só não fica lembrada.
  }
}

function Progresso({ livro }: { livro: Livro }) {
  if (livro.progresso <= 0) return null
  return (
    <span className="cartao-progresso">
      <span className="barra-livro" aria-hidden="true">
        <i style={{ width: `${Math.max(2, porcentagem(livro))}%` }} />
      </span>
      <span className="cartao-porcentagem">{porcentagem(livro)}% lido</span>
    </span>
  )
}

export function TelaBiblioteca({
  livros,
  focarBusca,
  aoFocarBusca,
  aoAbrir,
  aoMudarBiblioteca,
  aoImportar,
}: {
  livros: Livro[]
  /** Buscar, no dock: põe o cursor no campo de busca e avisa que atendeu (para não repetir na próxima visita). */
  focarBusca: boolean
  aoFocarBusca: () => void
  aoAbrir: (id: string) => void
  aoMudarBiblioteca: () => void
  aoImportar: () => void
}) {
  const [busca, setBusca] = useState('')
  const [formato, setFormato] = useState<FiltroDeFormato>('todos')
  const [ordem, setOrdem] = useState<Ordem>(() => lembrado('ordem', ORDENS.map(o => o.valor), 'recentes'))
  const [vista, setVista] = useState<Vista>(() => lembrado('vista', ['grade', 'lista'] as const, 'grade'))
  const [removendo, setRemovendo] = useState<Livro | null>(null)
  const campoDeBusca = useRef<HTMLInputElement>(null)
  const visiveis = organizarLivros(livros, { busca, ordem, formato })

  useEffect(() => {
    if (!focarBusca) return
    campoDeBusca.current?.focus()
    aoFocarBusca()
  }, [focarBusca, aoFocarBusca])

  // "/" ou Ctrl+F levam à busca, como nos navegadores.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const digitando = (e.target as Element | null)?.closest?.('input, select, textarea')
      const atalho = (e.key === '/' && !digitando) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')
      if (!atalho || document.querySelector('dialog[open]')) return
      e.preventDefault()
      campoDeBusca.current?.focus()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  const mudarOrdem = (valor: Ordem) => {
    setOrdem(valor)
    lembrar('ordem', valor)
  }

  const mudarVista = (valor: Vista) => {
    setVista(valor)
    lembrar('vista', valor)
  }

  const remover = async () => {
    if (!removendo) return
    await api.biblioteca.remover(removendo.id)
    setRemovendo(null)
    aoMudarBiblioteca()
  }

  const acoes = (livro: Livro) => (
    <MenuDeAcoes
      rotulo={`Mais ações para ${livro.titulo}`}
      acoes={[{ rotulo: 'Remover da biblioteca', perigosa: true, aoEscolher: () => setRemovendo(livro) }]}
    />
  )

  return (
    <div className="tela superficie-escura">
      <header className="tela-topo">
        <Assinatura />
      </header>
      <main className="tela-conteudo" aria-label="Biblioteca" tabIndex={-1}>
        {livros.length === 0 ? (
          <EstadoVazio titulo="Sua biblioteca" aoImportar={aoImportar} />
        ) : (
          <>
            <div className="biblioteca-cabeca">
              <h1>
                Sua biblioteca <span className="contagem">{livros.length}</span>
              </h1>
              <p className="onde-estao">
                <Icone nome="computador" />
                Todos os livros estão guardados neste computador.
              </p>
            </div>

            <div className="ferramentas">
              <label className="busca">
                <Icone nome="lupa" />
                <input
                  ref={campoDeBusca}
                  type="search"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por título ou autor"
                  aria-label="Buscar na biblioteca"
                />
              </label>
              <div className="filtro" role="radiogroup" aria-label="Formato">
                {FORMATOS.map(opcao => (
                  <label key={opcao.valor} className="segmento">
                    <input
                      type="radio"
                      name="formato"
                      checked={formato === opcao.valor}
                      onChange={() => setFormato(opcao.valor)}
                    />
                    <span>{opcao.rotulo}</span>
                  </label>
                ))}
              </div>
              <label className="ordem">
                <span>Ordenar por</span>
                <select value={ordem} onChange={e => mudarOrdem(e.target.value as Ordem)}>
                  {ORDENS.map(opcao => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <div className="vista" role="group" aria-label="Exibição">
                <button
                  type="button"
                  className="botao-icone"
                  aria-label="Ver em grade"
                  aria-pressed={vista === 'grade'}
                  onClick={() => mudarVista('grade')}
                >
                  <Icone nome="grade" />
                </button>
                <button
                  type="button"
                  className="botao-icone"
                  aria-label="Ver em lista"
                  aria-pressed={vista === 'lista'}
                  onClick={() => mudarVista('lista')}
                >
                  <Icone nome="lista" />
                </button>
              </div>
            </div>

            {visiveis.length === 0 ? (
              <div className="sem-resultado" role="status">
                <p>Nenhum livro por aqui com essa busca.</p>
                <button
                  type="button"
                  className="botao"
                  onClick={() => {
                    setBusca('')
                    setFormato('todos')
                  }}
                >
                  Mostrar todos os livros
                </button>
              </div>
            ) : vista === 'grade' ? (
              <ul className="grade" aria-label="Sua biblioteca">
                {visiveis.map(livro => (
                  <li key={livro.id} className="cartao">
                    <button type="button" className="cartao-abrir" onClick={() => aoAbrir(livro.id)}>
                      <span className="cartao-capa">
                        <Capa livro={livro} />
                        <span className="selo-formato" aria-hidden="true">
                          {livro.formatoOriginal.toUpperCase()}
                        </span>
                      </span>
                      <span className="cartao-titulo">{livro.titulo}</span>
                      {livro.autores.length > 0 && <span className="cartao-autor">{autores(livro)}</span>}
                      <span className="so-leitor-de-tela">{livro.formatoOriginal.toUpperCase()}</span>
                      <Progresso livro={livro} />
                      <span className="cartao-quando">{ultimaLeitura(livro)}</span>
                    </button>
                    {acoes(livro)}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="lista" aria-label="Sua biblioteca">
                {visiveis.map(livro => (
                  <li key={livro.id} className="linha">
                    <button type="button" className="linha-abrir" onClick={() => aoAbrir(livro.id)}>
                      <Capa livro={livro} tamanho="pequena" />
                      <span className="linha-nome">
                        <span className="cartao-titulo">{livro.titulo}</span>
                        {livro.autores.length > 0 && <span className="cartao-autor">{autores(livro)}</span>}
                      </span>
                      <span className="linha-selos">
                        <span className="selo-info">{livro.formatoOriginal.toUpperCase()}</span>
                        {comoLe(livro) && <span className="selo-info">{comoLe(livro)}</span>}
                      </span>
                      <span className="linha-progresso">
                        {livro.progresso > 0 ? <Progresso livro={livro} /> : <span className="cartao-quando">Não começado</span>}
                      </span>
                      <span className="cartao-quando linha-quando">{ultimaLeitura(livro)}</span>
                      <span className="selo-info linha-onde">
                        <Icone nome="computador" />
                        Neste computador
                      </span>
                    </button>
                    {acoes(livro)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <Dialogo aberto={!!removendo} titulo="Remover este livro?" aoFechar={() => setRemovendo(null)} alerta>
        {removendo && (
          <>
            <p>
              <strong>{removendo.titulo}</strong> sai da sua biblioteca, junto com a posição de leitura. O arquivo
              original no seu computador continua onde estava.
            </p>
            <div className="botoes">
              <button type="button" className="botao" onClick={() => setRemovendo(null)}>
                Cancelar
              </button>
              <button type="button" className="botao perigo" onClick={() => void remover()}>
                Remover
              </button>
            </div>
          </>
        )}
      </Dialogo>
    </div>
  )
}
