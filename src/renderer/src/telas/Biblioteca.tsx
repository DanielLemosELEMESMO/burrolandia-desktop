// A biblioteca: ao abrir, o livro que você está lendo vem primeiro, a um clique.

import { useEffect, useState } from 'react'
import type { Livro } from '@nucleo/tipos'
import { saudacao } from '@nucleo/tempo'
import { api } from '../api'
import { Capa } from '../componentes/Capa'
import { Dialogo } from '../componentes/Dialogo'
import { Icone } from '../componentes/Icone'
import { DialogosDeImportacao, useImportacao } from '../componentes/Importacao'
import { MenuDeAcoes } from '../componentes/MenuDeAcoes'

const porcentagem = (livro: Livro) => Math.round(livro.progresso * 100)
const autores = (livro: Livro) => livro.autores.join(', ')

/** Continuar lendo: o aberto mais recentemente que ainda não terminou. Senão, o mais novo para começar. */
function escolherDestaque(livros: Livro[]): { livro: Livro; continuar: boolean } | null {
  const emLeitura = livros.find(l => l.abertoEm && l.progresso < 0.995)
  if (emLeitura) return { livro: emLeitura, continuar: true }
  const nuncaAbertos = livros.filter(l => !l.abertoEm).sort((a, b) => b.adicionadoEm.localeCompare(a.adicionadoEm))
  return nuncaAbertos[0] ? { livro: nuncaAbertos[0], continuar: false } : null
}

function Destaque({ livro, continuar, aoAbrir }: { livro: Livro; continuar: boolean; aoAbrir: () => void }) {
  return (
    <section className="destaque" aria-labelledby="titulo-destaque">
      <h2 id="titulo-destaque" className="sobretitulo">
        {continuar ? 'Continuar lendo' : 'Para começar'}
      </h2>
      <div className="destaque-livro">
        <button type="button" className="destaque-capa" onClick={aoAbrir} tabIndex={-1} aria-hidden="true">
          <Capa livro={livro} tamanho="grande" />
        </button>
        <div className="destaque-texto">
          <h3>{livro.titulo}</h3>
          {livro.autores.length > 0 && <p className="destaque-autor">{autores(livro)}</p>}
          {continuar && (
            <>
              {livro.posicao?.title && <p className="destaque-onde">Você está em “{livro.posicao.title}”</p>}
              <div className="barra-livro" aria-hidden="true">
                <i style={{ width: `${Math.max(2, porcentagem(livro))}%` }} />
              </div>
              <p className="destaque-quanto">{porcentagem(livro)}% lido</p>
            </>
          )}
          <button type="button" className="botao principal destaque-botao" onClick={aoAbrir}>
            <Icone nome="livro" />
            {continuar ? 'Continuar a leitura' : 'Começar a ler'}
          </button>
        </div>
      </div>
    </section>
  )
}

export function TelaBiblioteca({
  livros,
  aoAbrir,
  aoMudarBiblioteca,
  abrirAjustes,
}: {
  livros: Livro[]
  aoAbrir: (id: string) => void
  aoMudarBiblioteca: () => void
  abrirAjustes: () => void
}) {
  const importacao = useImportacao(aoMudarBiblioteca)
  const [removendo, setRemovendo] = useState<Livro | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const destaque = escolherDestaque(livros)

  // Arrastar um arquivo para qualquer lugar da janela.
  useEffect(() => {
    let profundidade = 0
    const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const entrar = (e: DragEvent) => {
      if (!temArquivo(e)) return
      e.preventDefault()
      profundidade++
      setArrastando(true)
    }
    const sobre = (e: DragEvent) => {
      if (temArquivo(e)) e.preventDefault()
    }
    const sair = () => {
      profundidade = Math.max(0, profundidade - 1)
      if (!profundidade) setArrastando(false)
    }
    const soltar = (e: DragEvent) => {
      e.preventDefault()
      profundidade = 0
      setArrastando(false)
      const arquivo = e.dataTransfer?.files[0]
      if (arquivo) void importacao.importar(api.biblioteca.caminhoDoArquivo(arquivo))
    }
    window.addEventListener('dragenter', entrar)
    window.addEventListener('dragover', sobre)
    window.addEventListener('dragleave', sair)
    window.addEventListener('drop', soltar)
    return () => {
      window.removeEventListener('dragenter', entrar)
      window.removeEventListener('dragover', sobre)
      window.removeEventListener('dragleave', sair)
      window.removeEventListener('drop', soltar)
    }
  }, [importacao.importar])

  const remover = async () => {
    if (!removendo) return
    await api.biblioteca.remover(removendo.id)
    setRemovendo(null)
    aoMudarBiblioteca()
  }

  return (
    <div className="tela-biblioteca">
      <header className="topo">
        <div className="marca">
          <Icone nome="livro" />
          <span>Burrolândia</span>
        </div>
        <div className="topo-acoes">
          <button type="button" className="botao-icone botao-aa" aria-label="Ajustes de leitura" onClick={abrirAjustes}>
            Aa
          </button>
          <button type="button" className="botao principal" onClick={() => void importacao.adicionar()}>
            <Icone nome="mais" />
            Adicionar livro
          </button>
        </div>
      </header>

      <main className="biblioteca" aria-label="Biblioteca">
        {livros.length === 0 ? (
          <div className="vazio">
            <Icone nome="livro" className="vazio-icone" />
            <h1>{saudacao(new Date())}.</h1>
            <h2>Sua biblioteca está vazia</h2>
            <p>Adicione um EPUB ou PDF que você tenha no computador. Você também pode arrastar o arquivo para esta janela.</p>
            <button type="button" className="botao principal" onClick={() => void importacao.adicionar()}>
              <Icone nome="mais" />
              Adicionar livro
            </button>
          </div>
        ) : (
          <>
            <h1 className="saudacao">{saudacao(new Date())}.</h1>
            {destaque && (
              <Destaque livro={destaque.livro} continuar={destaque.continuar} aoAbrir={() => aoAbrir(destaque.livro.id)} />
            )}
            <section className="estante" aria-labelledby="titulo-estante">
              <h2 id="titulo-estante" className="sobretitulo">
                Sua biblioteca <span className="contagem">{livros.length}</span>
              </h2>
              <ul className="grade" aria-label="Sua biblioteca">
                {livros.map(livro => (
                  <li key={livro.id} className="cartao">
                    <button type="button" className="cartao-abrir" onClick={() => aoAbrir(livro.id)}>
                      <Capa livro={livro} />
                      <span className="cartao-titulo">{livro.titulo}</span>
                      {livro.autores.length > 0 && <span className="cartao-autor">{autores(livro)}</span>}
                      {livro.progresso > 0 && (
                        <span className="cartao-progresso">
                          <span className="barra-livro" aria-hidden="true">
                            <i style={{ width: `${Math.max(2, porcentagem(livro))}%` }} />
                          </span>
                          <span className="so-leitor-de-tela">{porcentagem(livro)}% lido</span>
                        </span>
                      )}
                    </button>
                    <MenuDeAcoes
                      rotulo={`Mais ações para ${livro.titulo}`}
                      acoes={[{ rotulo: 'Remover da biblioteca', perigosa: true, aoEscolher: () => setRemovendo(livro) }]}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>

      {arrastando && (
        <div className="soltar" aria-hidden="true">
          <div>
            <Icone nome="mais" />
            <p>Solte o arquivo para adicioná-lo à sua biblioteca</p>
          </div>
        </div>
      )}

      <DialogosDeImportacao
        estado={importacao.estado}
        aoFechar={importacao.fechar}
        aoLer={livro => {
          importacao.fechar()
          aoAbrir(livro.id)
        }}
      />

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
