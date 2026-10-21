// "Trocar a capa": três caminhos. Do livro (uma página do PDF, com a imagem da capa já marcada, ou
// uma imagem de dentro do EPUB), do catálogo (as capas da obra e das edições no Open Library) ou do
// computador (uma imagem sua, escolhida ou arrastada). O que vem do livro e do computador passa
// pelo recorte. O conteúdo só existe com o diálogo aberto: cada abertura começa do zero, e o que já
// foi carregado (páginas, imagens, capas) fica até fechar, sem carregar de novo ao trocar de aba.

import { useCallback, useEffect, useRef, useState } from 'react'
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

type Carga = 'carregando' | 'pronto' | 'falhou'

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

/** As primeiras páginas e a última de um PDF, em miniatura; o PDF fica aberto para preparar a escolhida. */
function usarPaginasDoPdf(livro: Livro, querer: boolean) {
  const [miniaturas, setMiniaturas] = useState<{ numero: number; url: string }[]>([])
  const [carga, setCarga] = useState<Carga>('carregando')
  const pdf = useRef<PdfAberto | null>(null)

  useEffect(() => {
    if (!querer) return
    let ativo = true
    let aberto: PdfAberto | null = null
    const urls: string[] = []
    setMiniaturas([])
    setCarga('carregando')
    void (async () => {
      try {
        aberto = await abrirPdf(urlDoArquivo(livro, livro.arquivoOriginal))
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
        setCarga('pronto')
      } catch (erro) {
        console.warn('Não deu para abrir as páginas do PDF', erro)
        if (ativo) setCarga('falhou')
      }
    })()
    return () => {
      ativo = false
      for (const url of urls) URL.revokeObjectURL(url)
      pdf.current = null
      void aberto?.fechar()
    }
  }, [livro, querer])

  return { miniaturas, carga, pdf }
}

/** As imagens de dentro do EPUB (a capa declarada primeiro). */
function usarImagensDoEpub(livro: Livro, querer: boolean) {
  const [imagens, setImagens] = useState<{ nome: string; blob: Blob; url: string }[]>([])
  const [carga, setCarga] = useState<Carga>('carregando')

  useEffect(() => {
    if (!querer) return
    let ativo = true
    const urls: string[] = []
    setCarga('carregando')
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
        setCarga('pronto')
      })
      .catch(erro => {
        console.warn('Não deu para ler as imagens do livro', erro)
        if (ativo) setCarga('falhou')
      })
    return () => {
      ativo = false
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [livro.id, querer])

  return { imagens, carga }
}

/** As capas da obra e das edições no catálogo, com as miniaturas chegando aos poucos. */
function usarCapasDoCatalogo(livro: Livro, querer: boolean) {
  const [capas, setCapas] = useState<CapaDaObra[] | 'sem-conexao' | null>(null)
  const [miniaturas, setMiniaturas] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!querer || !livro.obraId) return
    let ativo = true
    const urls: string[] = []
    setCapas(null)
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
  }, [livro.id, livro.obraId, querer])

  return { capas, miniaturas }
}

/** Um botão de opção que não perde o foco enquanto o diálogo está ocupado (só não faz nada). */
function Opcao({ rotulo, imagem, ocupado, pressionado, aoEscolher }: {
  rotulo: string
  imagem: string | undefined
  ocupado: boolean
  pressionado?: boolean
  aoEscolher: () => void
}) {
  return (
    <button
      type="button"
      className="trocar-capa-opcao"
      aria-disabled={ocupado || undefined}
      aria-pressed={pressionado}
      onClick={() => !ocupado && aoEscolher()}
    >
      {imagem ? <img src={imagem} alt="" /> : <span className="trocar-capa-vazia" />}
      <span>{rotulo}</span>
    </button>
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
  return (
    <Dialogo aberto={!!livro} titulo="Trocar a capa" aoFechar={aoFechar} comFechar>
      {livro && <Conteudo livro={livro} aoFechar={aoFechar} aoTrocar={aoTrocar} />}
    </Dialogo>
  )
}

function Conteudo({ livro, aoFechar, aoTrocar }: { livro: Livro; aoFechar: () => void; aoTrocar: (livro: Livro) => void }) {
  const [origem, setOrigem] = useState<Origem>('livro')
  // As abas já abertas continuam carregadas até o diálogo fechar.
  const [vistas, setVistas] = useState<Origem[]>(['livro'])
  const [fonte, setFonte] = useState<Fonte | null>(null)
  const [selecao, setSelecao] = useState<Retangulo>(INTEIRO)
  const [preparando, setPreparando] = useState(false)
  const [andamento, setAndamento] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [escolhidaNoCatalogo, setEscolhidaNoCatalogo] = useState<number | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  // Cada preparação tem um número; uma que termina depois de outra escolha (ou de trocar de aba) não vale.
  const pedido = useRef(0)
  const ocupado = useRef(false)
  const voltou = useRef(false)

  const ehPdf = livro.formatoOriginal === 'pdf'
  // O livro que está só na nuvem ainda não tem o arquivo neste computador: as páginas vêm depois de abrir.
  const comArquivo = livro.estado !== 'na-nuvem'
  const paginas = usarPaginasDoPdf(livro, comArquivo && ehPdf && vistas.includes('livro'))
  const imagens = usarImagensDoEpub(livro, comArquivo && !ehPdf && vistas.includes('livro'))
  const catalogo = usarCapasDoCatalogo(livro, vistas.includes('catalogo'))

  // A imagem do recorte é um blob: sai da memória quando troca ou fecha.
  useEffect(
    () => () => {
      if (fonte) URL.revokeObjectURL(fonte.url)
    },
    [fonte],
  )

  // Entrando no recorte, o foco vai para a seleção (as setas já funcionam); voltando, para a aba.
  useEffect(() => {
    if (fonte) raiz.current?.querySelector<HTMLElement>('.recorte-selecao')?.focus()
    else if (voltou.current) raiz.current?.querySelector<HTMLInputElement>('input[name="origem-da-capa"]:checked')?.focus()
    voltou.current = false
  }, [fonte])

  const preparar = useCallback(async (carregar: () => Promise<Fonte>, falha: string) => {
    if (ocupado.current) return
    const meu = ++pedido.current
    ocupado.current = true
    setPreparando(true)
    setErro(null)
    try {
      const nova = await carregar()
      if (meu !== pedido.current) return URL.revokeObjectURL(nova.url)
      setSelecao(nova.selecao)
      setFonte(nova)
    } catch (falhou) {
      console.warn('Não deu para preparar a imagem', falhou)
      if (meu === pedido.current) setErro(falha)
    } finally {
      if (meu === pedido.current) {
        ocupado.current = false
        setPreparando(false)
      }
    }
  }, [])

  const abrirArquivo = useCallback(
    (arquivo: File | undefined) => {
      if (!arquivo) return
      if (!TIPOS_ACEITOS.includes(arquivo.type)) return setErro('Use uma imagem JPEG, PNG ou WebP.')
      void preparar(() => fonteDeBlob(arquivo), 'Não deu para abrir esta imagem.')
    },
    [preparar],
  )

  // Uma imagem arrastada para qualquer parte do diálogo vira a capa; não vai para a importação de livros.
  useEffect(() => {
    const dialogo = raiz.current?.closest('dialog')
    if (!dialogo) return
    const arrasto = (evento: DragEvent) => {
      if (!Array.from(evento.dataTransfer?.types ?? []).includes('Files')) return
      evento.stopPropagation()
      evento.preventDefault()
      if (evento.type === 'drop') abrirArquivo(evento.dataTransfer?.files[0])
    }
    const tipos = ['dragenter', 'dragover', 'dragleave', 'drop'] as const
    for (const tipo of tipos) dialogo.addEventListener(tipo, arrasto)
    return () => {
      for (const tipo of tipos) dialogo.removeEventListener(tipo, arrasto)
    }
  }, [abrirArquivo])

  const mudarOrigem = (valor: Origem) => {
    // Uma página que estava sendo preparada para outra aba não abre mais.
    pedido.current++
    ocupado.current = false
    setPreparando(false)
    setErro(null)
    setOrigem(valor)
    setVistas(atuais => (atuais.includes(valor) ? atuais : [...atuais, valor]))
  }

  /** Guarda a capa nova. A mesma imagem de antes já é a capa: só fecha. */
  const trocar = async (mensagem: string, acao: () => Promise<Livro | null | undefined>, falha: string) => {
    setAndamento(mensagem)
    setErro(null)
    try {
      const depois = await acao()
      if (!depois) return setErro(falha)
      if (depois.capa !== livro.capa) aoTrocar(depois)
      aoFechar()
    } catch (falhou) {
      console.warn('Não deu para trocar a capa', falhou)
      setErro('Algo deu errado ao trocar a capa. Tente de novo.')
    } finally {
      setAndamento(null)
    }
  }

  const status = andamento ?? (preparando ? 'Preparando a imagem…' : '')
  const ocupadoAgora = preparando || !!andamento

  return (
    <div ref={raiz} className="trocar-capa">
      <p className="so-leitor-de-tela" role="status">
        {status}
      </p>
      {fonte ? (
        <>
          <Recorte imagem={fonte} selecao={selecao} aoMudar={setSelecao} />
          <div className="trocar-capa-acoes">
            <button
              type="button"
              className="botao"
              onClick={() => {
                voltou.current = true
                setFonte(null)
              }}
            >
              Voltar
            </button>
            <button
              type="button"
              className="botao principal"
              aria-disabled={!!andamento || undefined}
              onClick={() =>
                !andamento &&
                void trocar(
                  'Guardando a capa…',
                  async () => api.biblioteca.salvarCapa(livro.id, await recortarEmJpeg(fonte, selecao)),
                  'Não deu para usar esta imagem como capa. Tente outra.',
                )
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
                <input type="radio" name="origem-da-capa" checked={origem === valor} onChange={() => mudarOrigem(valor)} />
                <span>{rotulo}</span>
              </label>
            ))}
          </div>

          {origem === 'livro' && !comArquivo && (
            <p>Este livro ainda está só na nuvem. Abra-o uma vez para ele descer; depois as páginas e imagens dele aparecem aqui.</p>
          )}

          {origem === 'livro' && comArquivo && ehPdf && (
            <>
              <p>Escolha a página onde está a capa. Se ela for uma imagem dentro da página, o recorte já começa nela.</p>
              {paginas.carga === 'falhou' ? (
                <p>Não deu para abrir as páginas deste PDF.</p>
              ) : (
                <ul className="trocar-capa-grade" aria-label="Páginas do livro" aria-busy={paginas.carga === 'carregando'}>
                  {paginas.miniaturas.map(({ numero, url }) => (
                    <li key={numero}>
                      <Opcao
                        rotulo={`Página ${numero}`}
                        imagem={url}
                        ocupado={ocupadoAgora}
                        aoEscolher={() => {
                          const pdf = paginas.pdf.current?.pdf
                          if (pdf) void preparar(() => paginaParaRecortar(pdf, numero), 'Não deu para abrir esta página.')
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {paginas.carga === 'carregando' && <p className="dica">Abrindo as páginas…</p>}
            </>
          )}

          {origem === 'livro' &&
            comArquivo &&
            !ehPdf &&
            (imagens.carga === 'carregando' ? (
              <p className="dica">Procurando as imagens do livro…</p>
            ) : imagens.carga === 'falhou' ? (
              <p>Não deu para ler as imagens deste livro.</p>
            ) : !imagens.imagens.length ? (
              <p>Este livro não tem imagens que sirvam de capa. Tente o catálogo ou uma imagem sua.</p>
            ) : (
              <ul className="trocar-capa-grade" aria-label="Imagens do livro">
                {imagens.imagens.map(({ nome, blob, url }, i) => (
                  <li key={nome}>
                    <Opcao
                      rotulo={`Imagem ${i + 1}`}
                      imagem={url}
                      ocupado={ocupadoAgora}
                      aoEscolher={() => void preparar(() => fonteDeBlob(blob), 'Não deu para abrir esta imagem.')}
                    />
                  </li>
                ))}
              </ul>
            ))}

          {origem === 'catalogo' &&
            (!livro.obraId ? (
              <p>
                Este livro ainda não foi reconhecido no catálogo. Em “Sobre este livro” você procura a obra; depois as capas das
                edições aparecem aqui.
              </p>
            ) : catalogo.capas === null ? (
              <p className="dica">Procurando as capas no Open Library…</p>
            ) : catalogo.capas === 'sem-conexao' ? (
              <p>Não deu para falar com o Open Library agora. Confira a internet e abra de novo.</p>
            ) : !catalogo.capas.length ? (
              <p>O catálogo não tem capas desta obra. Tente uma imagem sua.</p>
            ) : (
              <>
                <ul className="trocar-capa-grade" aria-label="Capas do catálogo">
                  {catalogo.capas.map(({ capaId, legenda }) => (
                    <li key={capaId}>
                      <Opcao
                        rotulo={legenda}
                        imagem={catalogo.miniaturas[capaId]}
                        ocupado={false}
                        pressionado={escolhidaNoCatalogo === capaId}
                        aoEscolher={() => setEscolhidaNoCatalogo(capaId)}
                      />
                    </li>
                  ))}
                </ul>
                <div className="trocar-capa-acoes">
                  <button
                    type="button"
                    className="botao principal"
                    disabled={escolhidaNoCatalogo === null}
                    aria-disabled={!!andamento || undefined}
                    onClick={() =>
                      escolhidaNoCatalogo !== null &&
                      !andamento &&
                      void trocar(
                        'Baixando a capa…',
                        async () => (await api.catalogo.usarCapa(livro.id, escolhidaNoCatalogo))?.livro,
                        'Não deu para baixar esta capa do catálogo. Confira a internet e tente de novo.',
                      )
                    }
                  >
                    Usar esta capa
                  </button>
                </div>
              </>
            ))}

          {origem === 'computador' && (
            <div className="trocar-capa-computador">
              <p>Escolha uma imagem do computador (JPEG, PNG ou WebP), ou arraste uma para cá. Depois você recorta.</p>
              <label className="botao principal trocar-capa-arquivo">
                Escolher uma imagem
                <input
                  type="file"
                  accept={TIPOS_ACEITOS.join(',')}
                  className="so-leitor-de-tela"
                  onChange={evento => {
                    abrirArquivo(evento.target.files?.[0])
                    evento.target.value = ''
                  }}
                />
              </label>
            </div>
          )}
        </>
      )}
      {status && (
        <p className="sobre-andamento" aria-hidden="true">
          <span className="girando" />
          {status}
        </p>
      )}
      {erro && (
        <p className="trocar-capa-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
