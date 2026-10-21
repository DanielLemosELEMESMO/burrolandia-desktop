// O Início: o livro que você está lendo vem primeiro, a um clique; logo abaixo, os mexidos por último.

import type { EstadoDaNuvem, Livro } from '@nucleo/tipos'
import { escolherDestaque, livrosRecentes } from '@nucleo/organizar'
import { saudacao } from '@nucleo/tempo'
import { Capa } from '../componentes/Capa'
import { BotaoDaConta } from '../componentes/Conta'
import { EstadoVazio } from '../componentes/EstadoVazio'
import { Icone } from '../componentes/Icone'
import { Assinatura } from '../componentes/Marca'

const RECENTES = 6

const porcentagem = (livro: Livro) => Math.round(livro.progresso * 100)
const autores = (livro: Livro) => livro.autores.join(', ')

function Destaque({ livro, continuar, aoAbrir }: { livro: Livro; continuar: boolean; aoAbrir: () => void }) {
  return (
    <section className="destaque" aria-labelledby="titulo-destaque">
      <h2 id="titulo-destaque" className="sobretitulo">
        {continuar ? 'Continuar lendo' : 'Para começar'}
      </h2>
      <div className="destaque-livro superficie-tema">
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

export function TelaInicio({
  livros,
  nuvem,
  aoAbrirConta,
  aoAbrir,
  aoVerBiblioteca,
  aoImportar,
}: {
  livros: Livro[]
  nuvem: EstadoDaNuvem | null
  aoAbrirConta: () => void
  aoAbrir: (id: string) => void
  aoVerBiblioteca: () => void
  aoImportar: () => void
}) {
  const destaque = escolherDestaque(livros)
  const recentes = livrosRecentes(livros, destaque?.livro.id ?? null, RECENTES)
  const ola = `${saudacao(new Date())}, ser questionável.`

  return (
    <div className="tela superficie-escura">
      <header className="tela-topo">
        <Assinatura />
        <BotaoDaConta estado={nuvem} aoAbrir={aoAbrirConta} />
      </header>
      <main className="tela-conteudo" aria-label="Início" tabIndex={-1}>
        {livros.length === 0 ? (
          <EstadoVazio titulo={ola} aoImportar={aoImportar} />
        ) : (
          <>
            <h1 className="saudacao">{ola}</h1>
            {destaque && (
              <Destaque livro={destaque.livro} continuar={destaque.continuar} aoAbrir={() => aoAbrir(destaque.livro.id)} />
            )}
            {recentes.length > 0 && (
              <section className="recentes" aria-labelledby="titulo-recentes">
                <div className="secao-cabeca">
                  <h2 id="titulo-recentes" className="sobretitulo">
                    Na sua estante
                  </h2>
                  <button type="button" className="botao-texto" onClick={aoVerBiblioteca}>
                    Ver a biblioteca inteira
                    <Icone nome="avancar" />
                  </button>
                </div>
                <ul className="fileira" aria-label="Na sua estante">
                  {recentes.map(livro => (
                    <li key={livro.id}>
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
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
