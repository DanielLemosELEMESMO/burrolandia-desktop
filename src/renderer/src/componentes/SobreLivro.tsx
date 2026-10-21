// O painel "Sobre este livro": a obra e a sua edição no catálogo (Open Library), com o que dá para
// fazer quando o reconhecimento errou: escolher a edição, procurar a obra, ou dizer que não é nenhuma.

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Edicao, ObraEncontrada, Reconhecimento, SobreLivro as Sobre } from '@nucleo/tipos'
import { api } from '../api'
import { Capa } from './Capa'
import { Dialogo } from './Dialogo'
import { Icone } from './Icone'

type Vista = 'detalhes' | 'edicoes' | 'busca'

const IDIOMAS: Record<string, string> = {
  por: 'português',
  eng: 'inglês',
  spa: 'espanhol',
  fre: 'francês',
  ger: 'alemão',
  ita: 'italiano',
  lat: 'latim',
}

const COMO_ACHOU: Partial<Record<Reconhecimento, string>> = {
  isbn: 'Reconhecida pelo ISBN do arquivo.',
  titulo: 'Reconhecida pelo título e pelo autor.',
  escolhido: 'Você escolheu esta obra.',
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function descricaoDaEdicao(e: Edicao) {
  return [
    e.ano ?? e.publicadaEm,
    e.paginas && `${e.paginas} páginas`,
    e.idiomas[0] && (IDIOMAS[e.idiomas[0]] ?? e.idiomas[0]),
    e.isbn[0] && `ISBN ${e.isbn[0]}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** A capa do catálogo, para ver antes de trocar (a imagem vem pelo processo principal). */
function CapaDoCatalogo({ livroId, aoUsar }: { livroId: string; aoUsar: () => void }) {
  const [endereco, setEndereco] = useState<string | null>(null)
  useEffect(() => {
    let url: string | null = null
    let ativo = true
    void api.catalogo.capa(livroId).then(imagem => {
      if (!ativo || !imagem) return
      url = URL.createObjectURL(new Blob([imagem as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
      setEndereco(url)
    })
    return () => {
      ativo = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [livroId])
  if (!endereco) return null
  return (
    <section className="sobre-secao sobre-capa" aria-labelledby="sobre-capa">
      <img src={endereco} alt="" className="capa capa-pequena" />
      <div>
        <h3 id="sobre-capa" className="sobretitulo">
          Capa do catálogo
        </h3>
        <button type="button" className="botao" onClick={aoUsar}>
          Usar esta capa
        </button>
      </div>
    </section>
  )
}

export function SobreLivro({ livroId, aoFechar }: { livroId: string | null; aoFechar: () => void }) {
  const [sobre, setSobre] = useState<Sobre | null>(null)
  const [vista, setVista] = useState<Vista>('detalhes')
  const [andamento, setAndamento] = useState<string | null>(null)
  const [semConexao, setSemConexao] = useState(false)
  const [edicoes, setEdicoes] = useState<Edicao[] | null>(null)
  const [busca, setBusca] = useState('')
  const [achadas, setAchadas] = useState<ObraEncontrada[] | null>(null)

  /** Roda uma ação do catálogo mostrando o andamento; null na resposta quer dizer sem conexão. */
  const comAndamento = useCallback(async <T,>(mensagem: string, acao: () => Promise<T>) => {
    setAndamento(mensagem)
    setSemConexao(false)
    try {
      return await acao()
    } finally {
      setAndamento(null)
    }
  }, [])

  const reconhecer = useCallback(
    async (id: string, deNovo = false) => {
      const depois = await comAndamento('Procurando a obra no Open Library…', () => api.catalogo.reconhecer(id, deNovo))
      if (depois) setSobre(depois)
      if (depois?.livro.reconhecimento === 'pendente') setSemConexao(true)
    },
    [comAndamento],
  )

  // Ao abrir: mostra o que já se sabe; se o livro ainda não foi procurado, procura.
  useEffect(() => {
    if (!livroId) return
    let ativo = true
    setSobre(null)
    setVista('detalhes')
    setSemConexao(false)
    setEdicoes(null)
    setAchadas(null)
    void api.catalogo.sobre(livroId).then(atual => {
      if (!ativo || !atual) return
      setSobre(atual)
      setBusca([atual.livro.titulo, atual.livro.autores[0]].filter(Boolean).join(' '))
      if (atual.livro.reconhecimento === 'pendente') void reconhecer(livroId)
    })
    return () => {
      ativo = false
    }
  }, [livroId, reconhecer])

  // O reconhecimento que começou na importação pode terminar com o painel aberto.
  useEffect(
    () =>
      api.catalogo.aoMudar(id => {
        if (id === livroId) void api.catalogo.sobre(id).then(atual => atual && setSobre(atual))
      }),
    [livroId],
  )

  if (!livroId) return <Dialogo aberto={false} titulo="Sobre este livro" aoFechar={aoFechar}>{null}</Dialogo>

  const abrirEdicoes = async () => {
    setVista('edicoes')
    setEdicoes(null)
    const lista = await comAndamento('Buscando as edições…', () => api.catalogo.edicoes(livroId))
    if (lista === null) setSemConexao(true)
    setEdicoes(lista ?? [])
  }

  const procurar = async (evento?: FormEvent) => {
    evento?.preventDefault()
    if (!busca.trim()) return
    const resultado = await comAndamento('Procurando no Open Library…', () => api.catalogo.buscar(busca))
    if (resultado === null) setSemConexao(true)
    setAchadas(resultado ?? [])
  }

  const atualizar = (depois: Sobre | null) => {
    if (depois) setSobre(depois)
    setVista('detalhes')
  }

  const { livro, obra, edicao } = sobre ?? { livro: null, obra: null, edicao: null }

  return (
    <Dialogo aberto titulo="Sobre este livro" aoFechar={aoFechar} variante="lateral-direita" comFechar>
      {!livro ? (
        <p className="dica">Abrindo…</p>
      ) : (
        <div className="sobre">
          <div className="sobre-livro">
            <Capa livro={livro} tamanho="pequena" />
            <div>
              <strong>{livro.titulo}</strong>
              {livro.autores.length > 0 && <span>{livro.autores.join(', ')}</span>}
            </div>
          </div>

          {andamento && (
            <p className="sobre-andamento" role="status">
              <span className="girando" aria-hidden="true" />
              {andamento}
            </p>
          )}
          {semConexao && (
            <div className="sobre-aviso" role="alert">
              <p>Não deu para falar com o Open Library agora. Confira a internet e tente de novo.</p>
              <button
                type="button"
                className="botao"
                onClick={() => void (vista === 'edicoes' ? abrirEdicoes() : vista === 'busca' ? procurar() : reconhecer(livro.id, true))}
              >
                Tentar de novo
              </button>
            </div>
          )}

          {vista === 'detalhes' && (
            <>
              {obra ? (
                <section className="sobre-secao" aria-labelledby="sobre-obra">
                  <h3 id="sobre-obra" className="sobretitulo">
                    A obra
                  </h3>
                  <p className="sobre-titulo">{obra.titulo}</p>
                  <p className="sobre-dados">
                    {[
                      obra.autores.join(', '),
                      obra.primeiroAno && `primeira edição em ${obra.primeiroAno}`,
                      plural(obra.edicoes, 'edição no catálogo', 'edições no catálogo'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {obra.descricao && <p className="sobre-descricao">{obra.descricao}</p>}
                  {obra.assuntos.length > 0 && (
                    <ul className="sobre-assuntos" aria-label="Assuntos">
                      {obra.assuntos.slice(0, 8).map(assunto => (
                        <li key={assunto}>{assunto}</li>
                      ))}
                    </ul>
                  )}
                  {COMO_ACHOU[livro.reconhecimento] && <p className="dica">{COMO_ACHOU[livro.reconhecimento]}</p>}
                  <div className="sobre-acoes">
                    <a className="botao-texto" href={`https://openlibrary.org/works/${obra.id}`} target="_blank" rel="noreferrer">
                      Ver no Open Library
                      <Icone nome="avancar" />
                    </a>
                    <button type="button" className="botao-texto" onClick={() => setVista('busca')}>
                      Não é esta obra
                    </button>
                  </div>
                </section>
              ) : (
                !andamento &&
                livro.reconhecimento !== 'pendente' && (
                  <section className="sobre-secao" aria-labelledby="sobre-obra">
                    <h3 id="sobre-obra" className="sobretitulo">
                      A obra
                    </h3>
                    <p>
                      {livro.reconhecimento === 'recusado'
                        ? 'Você disse que nenhuma das sugestões era este livro.'
                        : 'Não achei esta obra no Open Library.'}
                    </p>
                    <button type="button" className="botao" onClick={() => setVista('busca')}>
                      Procurar a obra
                    </button>
                  </section>
                )
              )}

              {obra && (
                <section className="sobre-secao" aria-labelledby="sobre-edicao">
                  <h3 id="sobre-edicao" className="sobretitulo">
                    Sua edição
                  </h3>
                  {edicao ? (
                    <>
                      <p className="sobre-titulo">{edicao.editoras.join(', ') || edicao.titulo}</p>
                      <p className="sobre-dados">{descricaoDaEdicao(edicao)}</p>
                      <button type="button" className="botao-texto" onClick={() => void abrirEdicoes()}>
                        Trocar a edição
                      </button>
                    </>
                  ) : (
                    <>
                      <p>Ainda não sei qual é a sua edição.</p>
                      <button type="button" className="botao" onClick={() => void abrirEdicoes()}>
                        Escolher a edição
                      </button>
                    </>
                  )}
                </section>
              )}

              {(edicao?.capaId ?? obra?.capaId) && (
                <CapaDoCatalogo
                  key={edicao?.capaId ?? obra?.capaId}
                  livroId={livro.id}
                  aoUsar={() => void comAndamento('Trocando a capa…', () => api.catalogo.usarCapa(livro.id)).then(atualizar)}
                />
              )}
            </>
          )}

          {vista === 'edicoes' && (
            <section className="sobre-secao" aria-labelledby="sobre-edicoes">
              <button type="button" className="botao-texto sobre-voltar" onClick={() => setVista('detalhes')}>
                <Icone nome="voltar" />
                Voltar
              </button>
              <h3 id="sobre-edicoes" className="sobretitulo">
                Escolha a sua edição
              </h3>
              {edicoes && edicoes.length === 0 && !semConexao && <p>O catálogo não conhece edições desta obra.</p>}
              {edicoes && edicoes.length > 0 && (
                <ul className="sobre-lista" aria-label="Edições">
                  {edicoes.map(e => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="sobre-opcao"
                        aria-current={e.id === edicao?.id || undefined}
                        onClick={() =>
                          void comAndamento('Guardando…', () => api.catalogo.escolherEdicao(livro.id, e.id)).then(atualizar)
                        }
                      >
                        <strong>{e.editoras.join(', ') || 'Editora não informada'}</strong>
                        <span>{descricaoDaEdicao(e) || e.titulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {vista === 'busca' && (
            <section className="sobre-secao" aria-labelledby="sobre-busca">
              <button type="button" className="botao-texto sobre-voltar" onClick={() => setVista('detalhes')}>
                <Icone nome="voltar" />
                Voltar
              </button>
              <h3 id="sobre-busca" className="sobretitulo">
                Procurar a obra
              </h3>
              <form className="sobre-procurar" onSubmit={evento => void procurar(evento)}>
                <label className="busca">
                  <Icone nome="lupa" />
                  <input
                    type="search"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    aria-label="Título e autor"
                    placeholder="Título e autor"
                    maxLength={200}
                  />
                </label>
                <button type="submit" className="botao principal">
                  Procurar
                </button>
              </form>
              {achadas && achadas.length === 0 && !semConexao && <p>Nada encontrado com essa busca.</p>}
              {achadas && achadas.length > 0 && (
                <ul className="sobre-lista" aria-label="Obras encontradas">
                  {achadas.map(({ obra: achada, edicao: comoEdicao }) => (
                    <li key={achada.id}>
                      <button
                        type="button"
                        className="sobre-opcao"
                        onClick={() =>
                          void comAndamento('Guardando…', () => api.catalogo.escolherObra(livro.id, achada.id)).then(atualizar)
                        }
                      >
                        <strong>{achada.titulo}</strong>
                        <span>
                          {[
                            achada.autores.join(', '),
                            achada.primeiroAno,
                            plural(achada.edicoes, 'edição', 'edições'),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {comoEdicao && comoEdicao.titulo !== achada.titulo && (
                          <span className="sobre-tambem">também como “{comoEdicao.titulo}”</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {achadas && (
                <button
                  type="button"
                  className="botao-texto"
                  onClick={() => void api.catalogo.nenhuma(livro.id).then(atualizar)}
                >
                  Não é nenhuma destas
                </button>
              )}
            </section>
          )}

          <p className="dica sobre-privacidade">
            Os dados vêm do Open Library, um catálogo aberto de livros. Do seu computador só saem o título, o autor e o
            ISBN; o arquivo, nunca.
          </p>
        </div>
      )}
    </Dialogo>
  )
}
