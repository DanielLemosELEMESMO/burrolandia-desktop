// "Trocar a capa": três caminhos. Do livro (uma página do PDF, com a imagem da capa já marcada, ou
// uma imagem de dentro do EPUB), do catálogo (as capas da obra e das edições no Open Library) ou do
// computador (uma imagem sua, escolhida ou arrastada). O que vem do livro e do computador passa
// pelo recorte. Quem usa passa key={id do livro}: cada livro abre o seu diálogo.

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { INTEIRO, type Retangulo } from '@nucleo/recorte'
import type { CapaDaObra, Livro } from '@nucleo/tipos'
import { api, urlDoArquivo } from '../api'
import { abrirPdf, miniaturaDaPagina, paginaParaRecortar, type PdfAberto } from '../leitor/pdf'
import { Dialogo } from './Dialogo'
import { Recorte, recortarEmJpeg, type ImagemParaRecortar } from './Recorte'

type Origem = 'livro' | 'catalogo' | 'computador'

const ORIGENS: [Origem, string][] = [
  ['livro', 'Do livro'],
  ['catalogo', 'Do catálogo'],
  ['computador', 'Do computador'],
]

/** Uma imagem pronta para o recorte, com a seleção inicial. */
interface Fonte extends ImagemParaRecortar {
  selecao: Retangulo
}

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']

/** Uma imagem (bytes ou arquivo) pronta para o recorte, com o tamanho de verdade. */
async function fonteDeBlob(blob: Blob): Promise<Fonte> {
  const url = URL.createObjectURL(blob)
  const imagem = new Image()
  imagem.src = url
  try {
    await imagem.decode()
  } catch (erro) {
    URL.revokeObjectURL(url)
    throw erro
  }
  return { url, largura: imagem.naturalWidth, altura: imagem.naturalHeight, selecao: INTEIRO }
}

type AoEscolher = (fonte: Fonte) => void
type AoFalhar = (mensagem: string) => void

/** As primeiras páginas e a última de um PDF; a escolhida abre no recorte com a capa já marcada. */
function PaginasDoPdf({ livro, aoEscolher, aoFalhar }: { livro: Livro; aoEscolher: AoEscolher; aoFalhar: AoFalhar }) {
  const [miniaturas, setMiniaturas] = useState<{ numero: number; url: string }[]>([])
  const [pronto, setPronto] = useState(false)
  const pdf = useRef<PdfAberto | null>(null)

  useEffect(() => {
    let ativo = true
    const urls: string[] = []
    void (async () => {
      try {
        const aberto = await abrirPdf(urlDoArquivo(livro, livro.arquivoOriginal))
        if (!ativo) return void aberto.fechar()
        pdf.current = aberto
        const total = aberto.pdf.numPages
        const numeros = [...new Set([...Array.from({ length: Math.min(6, total) }, (_, i) => i + 1), total])]
        for (const numero of numeros) {
          const url = await miniaturaDaPagina(aberto.pdf, numero)
          if (!ativo) return URL.revokeObjectURL(url)
          urls.push(url)
          setMiniaturas(atuais => [...atuais, { numero, url }])
        }
      } catch (erro) {
        console.warn('Não deu para abrir as páginas do PDF', erro)
        if (ativo) aoFalhar('Não deu para abrir as páginas deste PDF.')
      } finally {
        if (ativo) setPronto(true)
      }
    })()
    return () => {
      ativo = false
      for (const url of urls) URL.revokeObjectURL(url)
      void pdf.current?.fechar()
      pdf.current = null
    }
  }, [livro, aoFalhar])

  const escolher = async (numero: number) => {
    if (!pdf.current) return
    try {
      aoEscolher(await paginaParaRecortar(pdf.current.pdf, numero))
    } catch (erro) {
      console.warn('Não deu para preparar a página', erro)
      aoFalhar('Não deu para abrir esta página.')
    }
  }

  return (
    <>
      <p>Escolha a página onde está a capa. Se ela for uma imagem dentro da página, o recorte já começa nela.</p>
      <ul className="trocar-capa-grade" aria-label="Páginas do livro" aria-busy={!pronto}>
        {miniaturas.map(({ numero, url }) => (
          <li key={numero}>
            <button type="button" className="trocar-capa-opcao" onClick={() => void escolher(numero)}>
              <img src={url} alt="" />
              <span>Página {numero}</span>
            </button>
          </li>
        ))}
      </ul>
      {!pronto && <p className="dica">Abrindo as páginas…</p>}
    </>
  )
}

/** As imagens de dentro do EPUB (a capa declarada primeiro). */
function ImagensDoEpub({ livro, aoEscolher, aoFalhar }: { livro: Livro; aoEscolher: AoEscolher; aoFalhar: AoFalhar }) {
  const [imagens, setImagens] = useState<{ nome: string; blob: Blob; url: string }[] | null>(null)

  useEffect(() => {
    let ativo = true
    const urls: string[] = []
    api.biblioteca
      .imagens(livro.id)
      .then(lista => {
        if (!ativo) return
        setImagens(
          lista.map(({ nome, tipo, bytes }) => {
            const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo })
            const url = URL.createObjectURL(blob)
            urls.push(url)
            return { nome, blob, url }
          }),
        )
      })
      .catch(erro => {
        console.warn('Não deu para ler as imagens do livro', erro)
        if (ativo) aoFalhar('Não deu para ler as imagens deste livro.')
      })
    return () => {
      ativo = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [livro.id, aoFalhar])

  if (!imagens) return <p className="dica">Procurando as imagens do livro…</p>
  if (!imagens.length) return <p>Este livro não tem imagens que sirvam de capa. Tente o catálogo ou uma imagem sua.</p>
  return (
    <ul className="trocar-capa-grade" aria-label="Imagens do livro">
      {imagens.map(({ nome, blob, url }, i) => (
        <li key={nome}>
          <button
            type="button"
            className="trocar-capa-opcao"
            onClick={() =>
              void fonteDeBlob(blob)
                .then(aoEscolher)
                .catch(() => aoFalhar('Não deu para abrir esta imagem.'))
            }
          >
            <img src={url} alt="" />
            <span>Imagem {i + 1}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** As capas da obra e das edições no catálogo; a escolhida vai inteira. */
function DoCatalogo({ livro, ocupado, aoUsar }: { livro: Livro; ocupado: boolean; aoUsar: (capaId: number) => void }) {
  const [capas, setCapas] = useState<CapaDaObra[] | 'sem-conexao' | null>(null)
  const [miniaturas, setMiniaturas] = useState<Record<number, string>>({})
  const [escolhida, setEscolhida] = useState<number | null>(null)

  useEffect(() => {
    if (!livro.obraId) return
    let ativo = true
    const urls: string[] = []
    void (async () => {
      const lista = await api.catalogo.capas(livro.id).catch(() => null)
      if (!ativo) return
      setCapas(lista ?? 'sem-conexao')
      for (const { capaId } of lista ?? []) {
        const bytes = await api.catalogo.miniatura(capaId).catch(() => null)
        if (!ativo) return
        if (!bytes) continue
        const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
        urls.push(url)
        setMiniaturas(atuais => ({ ...atuais, [capaId]: url }))
      }
    })()
    return () => {
      ativo = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [livro.id, livro.obraId])

  if (!livro.obraId) {
    return <p>Este livro ainda não foi reconhecido no catálogo. Em “Sobre este livro” você procura a obra; depois as capas das edições aparecem aqui.</p>
  }
  if (capas === null) return <p className="dica">Procurando as capas no Open Library…</p>
  if (capas === 'sem-conexao') return <p>Não deu para falar com o Open Library agora. Confira a internet e abra de novo.</p>
  if (!capas.length) return <p>O catálogo não tem capas desta obra. Tente uma imagem sua.</p>
  return (
    <>
      <ul className="trocar-capa-grade" aria-label="Capas do catálogo">
        {capas.map(({ capaId, legenda }) => (
          <li key={capaId}>
            <button
              type="button"
              className="trocar-capa-opcao"
              aria-pressed={escolhida === capaId}
              onClick={() => setEscolhida(capaId)}
            >
              {miniaturas[capaId] ? <img src={miniaturas[capaId]} alt="" /> : <span className="trocar-capa-vazia" />}
              <span>{legenda}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="trocar-capa-acoes">
        <button
          type="button"
          className="botao principal"
          disabled={escolhida === null || ocupado}
          onClick={() => escolhida !== null && aoUsar(escolhida)}
        >
          Usar esta capa
        </button>
      </div>
    </>
  )
}

function DoComputador({ aoAbrir }: { aoAbrir: (arquivo: File | undefined) => void }) {
  return (
    <div className="trocar-capa-computador">
      <p>Escolha uma imagem do computador (JPEG, PNG ou WebP), ou arraste uma para cá. Depois você recorta.</p>
      <label className="botao principal trocar-capa-arquivo">
        Escolher uma imagem
        <input
          type="file"
          accept={TIPOS_ACEITOS.join(',')}
          className="so-leitor-de-tela"
          onChange={evento => {
            aoAbrir(evento.target.files?.[0])
            evento.target.value = ''
          }}
        />
      </label>
    </div>
  )
}

export function TrocarCapa({
  livro,
  aoFechar,
  aoTrocar,
}: {
  livro: Livro | null
  aoFechar: () => void
  aoTrocar: (livro: Livro) => void
}) {
  const [origem, setOrigem] = useState<Origem>('livro')
  const [fonte, setFonte] = useState<Fonte | null>(null)
  const [selecao, setSelecao] = useState<Retangulo>(INTEIRO)
  const [andamento, setAndamento] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // A imagem do recorte é um blob: sai da memória quando troca ou fecha.
  useEffect(
    () => () => {
      if (fonte) URL.revokeObjectURL(fonte.url)
    },
    [fonte],
  )

  if (!livro) return <Dialogo aberto={false} titulo="Trocar a capa" aoFechar={aoFechar}>{null}</Dialogo>

  const escolher = (nova: Fonte) => {
    setErro(null)
    setSelecao(nova.selecao)
    setFonte(nova)
  }

  const abrirArquivo = (arquivo: File | undefined) => {
    if (!arquivo) return
    if (!TIPOS_ACEITOS.includes(arquivo.type)) return setErro('Use uma imagem JPEG, PNG ou WebP.')
    fonteDeBlob(arquivo)
      .then(escolher)
      .catch(() => setErro('Não deu para abrir esta imagem.'))
  }

  /** Guarda a capa nova; null ou a mesma capa de antes quer dizer que não deu. */
  const trocar = async (mensagem: string, acao: () => Promise<Livro | null | undefined>) => {
    setAndamento(mensagem)
    setErro(null)
    try {
      const depois = await acao()
      if (!depois || depois.capa === livro.capa) return setErro('Não deu para usar esta imagem como capa. Tente outra.')
      aoTrocar(depois)
      aoFechar()
    } catch (falha) {
      console.warn('Não deu para trocar a capa', falha)
      setErro('Algo deu errado ao trocar a capa. Tente de novo.')
    } finally {
      setAndamento(null)
    }
  }

  // Uma imagem arrastada para o diálogo vira a capa; não vai para a importação de livros.
  const arrasto = (evento: DragEvent) => {
    evento.stopPropagation()
    evento.preventDefault()
    if (evento.type === 'drop') abrirArquivo(evento.dataTransfer.files[0])
  }

  return (
    <Dialogo aberto titulo="Trocar a capa" aoFechar={aoFechar} comFechar>
      <div
        className="trocar-capa"
        onDragEnter={arrasto}
        onDragOver={arrasto}
        onDragLeave={arrasto}
        onDrop={arrasto}
      >
        <p className="so-leitor-de-tela" role="status">
          {andamento ?? ''}
        </p>
        {fonte ? (
          <>
            <Recorte imagem={fonte} selecao={selecao} aoMudar={setSelecao} />
            <div className="trocar-capa-acoes">
              <button type="button" className="botao" onClick={() => setFonte(null)}>
                Voltar
              </button>
              <button
                type="button"
                className="botao principal"
                disabled={!!andamento}
                onClick={() =>
                  void trocar('Guardando a capa…', async () => api.biblioteca.salvarCapa(livro.id, await recortarEmJpeg(fonte, selecao)))
                }
              >
                Usar como capa
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="trocar-capa-titulo">{livro.titulo}</p>
            <div className="segmentos" role="radiogroup" aria-label="De onde vem a capa">
              {ORIGENS.map(([valor, rotulo]) => (
                <label key={valor} className="segmento">
                  <input
                    type="radio"
                    name="origem-da-capa"
                    checked={origem === valor}
                    onChange={() => {
                      setErro(null)
                      setOrigem(valor)
                    }}
                  />
                  <span>{rotulo}</span>
                </label>
              ))}
            </div>
            {origem === 'livro' &&
              (livro.formatoOriginal === 'pdf' ? (
                <PaginasDoPdf livro={livro} aoEscolher={escolher} aoFalhar={setErro} />
              ) : (
                <ImagensDoEpub livro={livro} aoEscolher={escolher} aoFalhar={setErro} />
              ))}
            {origem === 'catalogo' && (
              <DoCatalogo
                livro={livro}
                ocupado={!!andamento}
                aoUsar={capaId =>
                  void trocar('Baixando a capa…', async () => (await api.catalogo.usarCapa(livro.id, capaId))?.livro)
                }
              />
            )}
            {origem === 'computador' && <DoComputador aoAbrir={abrirArquivo} />}
          </>
        )}
        {andamento && (
          <p className="sobre-andamento" aria-hidden="true">
            <span className="girando" />
            {andamento}
          </p>
        )}
        {erro && (
          <p className="trocar-capa-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Dialogo>
  )
}
