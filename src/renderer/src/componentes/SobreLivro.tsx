// O painel "Sobre este livro": a obra e a sua edição no catálogo (Open Library), com o que dá para
// fazer quando o reconhecimento errou: escolher a edição, procurar a obra, ou dizer que não é nenhuma.
// Cada livro abre o seu painel (quem usa passa key={id}): a resposta atrasada de um livro nunca
// aparece no painel de outro.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { autoresValidos, consultaDeTexto } from '@nucleo/catalogo/correspondencia'
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

/** Por que o livro não tem obra: a pessoa recusou, o arquivo não diz o autor, ou o catálogo não achou. */
function semObra({ reconhecimento, autores, identificadores }: Sobre['livro']) {
  if (reconhecimento === 'recusado') return 'Você disse que nenhuma das sugestões era este livro.'
  if (!autoresValidos(autores).length && !identificadores.isbn.length) {
    return 'O arquivo não diz quem é o autor, então não procurei sozinho: só o título não basta.'
  }
  return 'Não achei esta obra no Open Library.'
}

/** A capa do catálogo, para ver antes de trocar (a imagem vem pelo processo principal). */
function CapaDoCatalogo({ livroId, aoUsar }: { livroId: string; aoUsar: () => void }) {
  const [endereco, setEndereco] = useState<string | null>(null)
  useEffect(() => {
    let url: string | null = null
    let ativo = true
    api.catalogo
      .capa(livroId)
      .then(capa => {
        // A que já é a capa do livro não precisa de prévia.
        if (!ativo || !capa || capa.emUso) return
        url = URL.createObjectURL(new Blob([capa.imagem as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
        setEndereco(url)
      })
      .catch(() => {})
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
  /** A ação que não deu certo (sem conexão), para o "Tentar de novo" repetir só ela. */
  const [repetir, setRepetir] = useState<(() => void) | null>(null)
  const [edicoes, setEdicoes] = useState<Edicao[] | null>(null)
  const [busca, setBusca] = useState('')
  const [achadas, setAchadas] = useState<ObraEncontrada[] | null>(null)
  const campoDeBusca = useRef<HTMLInputElement>(null)
  const primeiraVista = useRef(true)

  /**
   * Roda uma ação do catálogo mostrando o andamento. Se o catálogo não respondeu (`falhou`, ou um
   * erro), o aviso oferece `deNovo`: repetir só esta ação, sem desfazer nada do que já foi escolhido.
   */
  const executar = useCallback(
    async <T,>(mensagem: string, acao: () => Promise<T>, falhou: (resultado: T) => boolean, deNovo: () => void) => {
      setAndamento(mensagem)
      setRepetir(null)
      try {
        const resultado = await acao()
        if (falhou(resultado)) setRepetir(() => deNovo)
        return resultado
      } catch (erro) {
        console.warn('O catálogo não respondeu', erro)
        setRepetir(() => deNovo)
        return null
      } finally {
        setAndamento(null)
      }
    },
    [],
  )

  const reconhecer: (id: string) => Promise<void> = useCallback(
    async (id: string) => {
      const depois = await executar(
        'Procurando a obra no Open Library…',
        () => api.catalogo.reconhecer(id),
        resultado => resultado?.livro.reconhecimento === 'pendente',
        () => void reconhecer(id),
      )
      if (depois) setSobre(depois)
    },
    [executar],
  )

  // Ao abrir: mostra o que já se sabe; se o livro ainda não foi procurado, procura.
  useEffect(() => {
    if (!livroId) return
    let ativo = true
    setVista('detalhes')
    setRepetir(null)
    api.catalogo
      .sobre(livroId)
      .then(atual => {
        if (!ativo || !atual) return
        setSobre(atual)
        setBusca(consultaDeTexto({ titulo: atual.livro.titulo, autores: atual.livro.autores }))
        if (atual.livro.reconhecimento === 'pendente') void reconhecer(livroId)
      })
      .catch(erro => console.warn('Não deu para abrir o "Sobre este livro"', erro))
    return () => {
      ativo = false
    }
  }, [livroId, reconhecer])

  // O reconhecimento que começou na importação (ou a descrição da obra) pode chegar com o painel aberto.
  useEffect(
    () =>
      api.catalogo.aoMudar(id => {
        if (id !== livroId) return
        api.catalogo
          .sobre(id)
          .then(atual => atual && setSobre(atual))
          .catch(() => {})
      }),
    [livroId],
  )

  // Ao trocar de vista, o foco vai junto: para o título da vista, ou para a busca.
  useEffect(() => {
    if (primeiraVista.current) {
      primeiraVista.current = false
      return
    }
    if (vista === 'busca') campoDeBusca.current?.focus()
    else document.getElementById(vista === 'edicoes' ? 'sobre-edicoes' : 'sobre-obra')?.focus()
  }, [vista])

  if (!livroId) return <Dialogo aberto={false} titulo="Sobre este livro" aoFechar={aoFechar}>{null}</Dialogo>

  const mudarVista = (nova: Vista) => {
    setRepetir(null)
    setVista(nova)
  }

  const abrirEdicoes = async (): Promise<void> => {
    mudarVista('edicoes')
    setEdicoes(null)
    const lista = await executar(
      'Buscando as edições…',
      () => api.catalogo.edicoes(livroId),
      resultado => resultado === null,
      () => void abrirEdicoes(),
    )
    setEdicoes(lista ?? [])
  }

  const procurar = async (evento?: FormEvent): Promise<void> => {
    evento?.preventDefault()
    if (!busca.trim()) return
    const resultado = await executar(
      'Procurando no Open Library…',
      () => api.catalogo.buscar(busca),
      lista => lista === null,
      () => void procurar(),
    )
    setAchadas(resultado ?? [])
  }

  /** Ações que mudam o livro: mostram o resultado e voltam para os detalhes. */
  const guardar = async (mensagem: string, acao: () => Promise<Sobre | null>): Promise<void> => {
    const depois = await executar(mensagem, acao, () => false, () => void guardar(mensagem, acao))
    if (depois) {
      setSobre(depois)
      mudarVista('detalhes')
    }
  }

  const { livro, obra, edicao } = sobre ?? { livro: null, obra: null, edicao: null }

  return (
    <Dialogo aberto titulo="Sobre este livro" aoFechar={aoFechar} variante="lateral-direita" comFechar>
      {/* Sempre na página, para o leitor de tela anunciar cada andamento (a versão visível vem abaixo). */}
      <p className="so-leitor-de-tela" role="status">
        {andamento ?? (livro ? '' : 'Abrindo…')}
      </p>
      {!livro ? (
        <p className="sobre-andamento" aria-hidden="true">
          <span className="girando" />
          Abrindo…
        </p>
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
            <p className="sobre-andamento" aria-hidden="true">
              <span className="girando" />
              {andamento}
            </p>
          )}

          {repetir && (
            <div className="sobre-aviso" role="alert">
              <p>Não deu para falar com o Open Library agora. Confira a internet e tente de novo.</p>
              <button type="button" className="botao" onClick={repetir}>
                Tentar de novo
              </button>
            </div>
          )}

          {vista === 'detalhes' && (
            <>
              {obra ? (
                <section className="sobre-secao" aria-labelledby="sobre-obra">
                  <h3 id="sobre-obra" className="sobretitulo" tabIndex={-1}>
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
                    <button type="button" className="botao-texto" onClick={() => mudarVista('busca')}>
                      Não é esta obra
                    </button>
                  </div>
                </section>
              ) : (
                !andamento &&
                livro.reconhecimento !== 'pendente' && (
                  <section className="sobre-secao" aria-labelledby="sobre-obra">
                    <h3 id="sobre-obra" className="sobretitulo" tabIndex={-1}>
                      A obra
                    </h3>
                    <p>{semObra(livro)}</p>
                    <button type="button" className="botao" onClick={() => mudarVista('busca')}>
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
                  key={`${edicao?.capaId ?? obra?.capaId}:${livro.capa}`}
                  livroId={livroId}
                  aoUsar={() => void guardar('Trocando a capa…', () => api.catalogo.usarCapa(livroId))}
                />
              )}
            </>
          )}

          {vista === 'edicoes' && (
            <section className="sobre-secao" aria-labelledby="sobre-edicoes">
              <button type="button" className="botao-texto sobre-voltar" onClick={() => mudarVista('detalhes')}>
                <Icone nome="voltar" />
                Voltar
              </button>
              <h3 id="sobre-edicoes" className="sobretitulo" tabIndex={-1}>
                Escolha a sua edição
              </h3>
              {edicoes && edicoes.length === 0 && !repetir && <p>O catálogo não conhece edições desta obra.</p>}
              {edicoes && edicoes.length > 0 && (
                <ul className="sobre-lista" aria-label="Edições">
                  {edicoes.map(e => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="sobre-opcao"
                        aria-current={e.id === edicao?.id || undefined}
                        onClick={() => void guardar('Guardando…', () => api.catalogo.escolherEdicao(livroId, e.id))}
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
              <button type="button" className="botao-texto sobre-voltar" onClick={() => mudarVista('detalhes')}>
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
                    ref={campoDeBusca}
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
              {achadas && achadas.length === 0 && !repetir && <p>Nada encontrado com essa busca.</p>}
              {achadas && achadas.length > 0 && (
                <ul className="sobre-lista" aria-label="Obras encontradas">
                  {achadas.map(({ obra: achada, edicao: comoEdicao }) => (
                    <li key={achada.id}>
                      <button
                        type="button"
                        className="sobre-opcao"
                        onClick={() => void guardar('Guardando…', () => api.catalogo.escolherObra(livroId, achada.id))}
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
                  onClick={() => void guardar('Guardando…', () => api.catalogo.nenhuma(livroId))}
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
