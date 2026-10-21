import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PREFERENCIAS_PADRAO, type EstadoDaNuvem, type Livro, type Preferencias } from '@nucleo/tipos'
import { api, temaEfetivo } from './api'
import { AjustesLeitura } from './componentes/AjustesLeitura'
import { DialogoDeDownload, type Baixando } from './componentes/BaixarDaNuvem'
import { DialogoDaConta } from './componentes/Conta'
import { Dock, type Destino, type Navegacao } from './componentes/Dock'
import { Icone } from './componentes/Icone'
import { comCapa, DialogosDeImportacao, useImportacao } from './componentes/Importacao'
import { TelaBiblioteca } from './telas/Biblioteca'
import { TelaInicio } from './telas/Inicio'
import { TelaLeitor } from './telas/Leitor'
import { usarMidia } from './usarMidia'

type Tela = { tipo: 'carregando' } | { tipo: Destino } | { tipo: 'leitor'; livro: Livro; origem: Destino }

/** Arrastar um arquivo para qualquer lugar da janela adiciona o livro. */
function usarArrastar(aoSoltar: (arquivos: FileList) => void) {
  const [arrastando, setArrastando] = useState(false)
  useEffect(() => {
    let profundidade = 0
    const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    // Com um diálogo aberto, o arquivo não vira livro por trás dele (o de capa trata o seu).
    const comDialogo = () => !!document.querySelector('dialog[open]')
    const entrar = (e: DragEvent) => {
      if (!temArquivo(e)) return
      e.preventDefault()
      if (comDialogo()) return
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
      profundidade = 0
      setArrastando(false)
      // Texto arrastado (para a busca, por exemplo) segue o caminho normal; só arquivos viram livro.
      if (!temArquivo(e)) return
      e.preventDefault()
      if (e.dataTransfer?.files.length && !comDialogo()) aoSoltar(e.dataTransfer.files)
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
  }, [aoSoltar])
  return arrastando
}

export function App() {
  const [preferencias, setPreferencias] = useState<Preferencias>(PREFERENCIAS_PADRAO)
  const [livros, setLivros] = useState<Livro[]>([])
  const [tela, setTela] = useState<Tela>({ tipo: 'carregando' })
  const [ajustesAbertos, setAjustesAbertos] = useState(false)
  const [nuvem, setNuvem] = useState<EstadoDaNuvem | null>(null)
  const [contaAberta, setContaAberta] = useState(false)
  const [baixando, setBaixando] = useState<(Baixando & { origem: Destino }) | null>(null)
  /** O livro cujo download está na tela (fechado o diálogo, ele continua descendo, mas não abre sozinho). */
  const downloadNaTela = useRef<string | null>(null)
  const livrosAtuais = useRef<Livro[]>([])
  livrosAtuais.current = livros
  // Buscar, no dock, pede o cursor no campo de busca da biblioteca; a biblioteca avisa quando atendeu.
  const [focarBusca, setFocarBusca] = useState(false)
  const escuroNoSistema = usarMidia('(prefers-color-scheme: dark)')
  const tema = temaEfetivo(preferencias, escuroNoSistema)

  useLayoutEffect(() => {
    document.documentElement.dataset.tema = tema
  }, [tema])

  useLayoutEffect(() => {
    if (tela.tipo !== 'carregando') document.documentElement.dataset.tela = tela.tipo === 'leitor' ? 'leitor' : 'marca'
  }, [tela.tipo])

  // Ao trocar de tela, quem estava num botão que sumiu (o voltar do leitor, por exemplo) não fica
  // perdido no <body>: o foco vai para a tela nova, e o leitor de tela anuncia onde você chegou.
  useEffect(() => {
    if (tela.tipo === 'carregando') return
    const ativo = document.activeElement
    if (!ativo || ativo === document.body) document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true })
  }, [tela])

  const recarregar = useCallback(async () => setLivros(await api.biblioteca.listar()), [])
  const importacao = useImportacao(recarregar)

  // Quando o catálogo reconhece um livro (ou troca a capa), a lista se atualiza; vários avisos juntos viram um.
  useEffect(() => {
    let espera: number | undefined
    const parar = api.catalogo.aoMudar(() => {
      window.clearTimeout(espera)
      espera = window.setTimeout(() => void recarregar(), 300)
    })
    return () => {
      parar()
      window.clearTimeout(espera)
    }
  }, [recarregar])

  // A nuvem: o botão da conta acompanha, e a biblioteca se atualiza quando chega algo de outro aparelho.
  useEffect(() => {
    void api.nuvem.estado().then(setNuvem)
    let espera: number | undefined
    const pararNuvem = api.nuvem.aoMudar((estado, livrosMudaram) => {
      setNuvem(estado)
      if (!livrosMudaram) return
      window.clearTimeout(espera)
      espera = window.setTimeout(() => void recarregar(), 300)
    })
    const pararAndamento = api.nuvem.aoAndamento((id, andamento) =>
      setBaixando(atual => (atual && atual.livro.id === id ? { ...atual, andamento } : atual)),
    )
    return () => {
      pararNuvem()
      pararAndamento()
      window.clearTimeout(espera)
    }
  }, [recarregar])

  // Ao abrir: se você fechou o app dentro de um livro, ele reabre dentro do livro.
  useEffect(() => {
    void (async () => {
      const [salvas, sessao, lista] = await Promise.all([
        api.preferencias.ler(),
        api.sessao.ler(),
        api.biblioteca.listar(),
      ])
      setPreferencias(salvas)
      setLivros(lista)
      const livro = sessao.livroAberto ? await api.leitura.abrir(sessao.livroAberto) : null
      setTela(livro ? { tipo: 'leitor', livro, origem: 'inicio' } : { tipo: 'inicio' })
    })()
  }, [])

  /** Um livro que está só na nuvem desce primeiro; depois abre onde você parou. */
  const baixarEAbrir = useCallback(
    async (livro: Livro, origem: Destino) => {
      downloadNaTela.current = livro.id
      setBaixando({ livro, andamento: null, erro: null, origem })
      const resultado = await api.nuvem.baixar(livro.id)
      const naTela = downloadNaTela.current === livro.id
      if (!resultado.ok) {
        if (naTela) setBaixando({ livro, andamento: null, erro: resultado.mensagem, origem })
        return
      }
      // Sem capa na nuvem (um PDF de outro aparelho que não gerou a sua), a primeira página vira capa.
      await comCapa(resultado.livro)
      await recarregar()
      // Fechou o diálogo no meio: o livro fica pronto na biblioteca, sem abrir sozinho.
      if (downloadNaTela.current !== livro.id) return
      const aberto = await api.leitura.abrir(livro.id)
      downloadNaTela.current = null
      setBaixando(null)
      if (aberto) setTela({ tipo: 'leitor', livro: aberto, origem })
    },
    [recarregar],
  )

  const abrir = useCallback(
    async (id: string, origem: Destino) => {
      const daLista = livrosAtuais.current.find(l => l.id === id)
      if (daLista?.estado === 'na-nuvem') return baixarEAbrir(daLista, origem)
      const livro = await api.leitura.abrir(id)
      if (livro) setTela({ tipo: 'leitor', livro, origem })
    },
    [baixarEAbrir],
  )

  const irPara = useCallback(
    async (destino: Destino) => {
      if (tela.tipo === 'leitor') {
        await api.leitura.fechar()
        await recarregar()
      }
      setTela({ tipo: destino })
    },
    [tela.tipo, recarregar],
  )

  const navegacao: Navegacao = {
    aoIr: destino => void irPara(destino),
    aoImportar: () => void importacao.adicionar(),
    aoBuscar: () => {
      void irPara('biblioteca')
      setFocarBusca(true)
    },
  }

  const soltarArquivos = useCallback(
    (arquivos: FileList) => {
      const aviso = arquivos.length > 1 ? 'Os livros entram um por vez: adicionei só o primeiro arquivo.' : undefined
      void importacao.importar(api.biblioteca.caminhoDoArquivo(arquivos[0]), aviso)
    },
    [importacao.importar],
  )
  const arrastando = usarArrastar(soltarArquivos)

  const mudarPreferencias = useCallback((parcial: Partial<Preferencias>) => {
    setPreferencias(atuais => ({ ...atuais, ...parcial }))
    void api.preferencias.salvar(parcial)
  }, [])

  const origemAtual: Destino = tela.tipo === 'leitor' ? tela.origem : tela.tipo === 'biblioteca' ? 'biblioteca' : 'inicio'

  return (
    <>
      {tela.tipo === 'inicio' && (
        <TelaInicio
          livros={livros}
          nuvem={nuvem}
          aoAbrirConta={() => setContaAberta(true)}
          aoAbrir={id => void abrir(id, 'inicio')}
          aoVerBiblioteca={() => void irPara('biblioteca')}
          aoImportar={navegacao.aoImportar}
        />
      )}
      {tela.tipo === 'biblioteca' && (
        <TelaBiblioteca
          livros={livros}
          nuvem={nuvem}
          aoAbrirConta={() => setContaAberta(true)}
          focarBusca={focarBusca}
          aoFocarBusca={() => setFocarBusca(false)}
          aoAbrir={id => void abrir(id, 'biblioteca')}
          aoMudarBiblioteca={() => void recarregar()}
          aoImportar={navegacao.aoImportar}
        />
      )}
      {(tela.tipo === 'inicio' || tela.tipo === 'biblioteca') && (
        <>
          <Dock atual={tela.tipo} navegacao={navegacao} aoAjustes={() => setAjustesAbertos(true)} />
          <AjustesLeitura
            aberto={ajustesAbertos}
            aoFechar={() => setAjustesAbertos(false)}
            preferencias={preferencias}
            aoMudar={mudarPreferencias}
          />
        </>
      )}
      {tela.tipo === 'leitor' && (
        <TelaLeitor
          key={tela.livro.id}
          livro={tela.livro}
          origem={tela.origem}
          navegacao={navegacao}
          preferencias={preferencias}
          tema={tema}
          aoMudarPreferencias={mudarPreferencias}
        />
      )}

      <DialogoDaConta aberto={contaAberta} estado={nuvem} aoFechar={() => setContaAberta(false)} />

      <DialogoDeDownload
        estado={baixando}
        aoFechar={() => {
          downloadNaTela.current = null
          setBaixando(null)
        }}
        aoTentarDeNovo={() => baixando && void baixarEAbrir(baixando.livro, baixando.origem)}
      />

      <DialogosDeImportacao
        estado={importacao.estado}
        aoFechar={importacao.fechar}
        aoLer={livro => {
          importacao.fechar()
          void abrir(livro.id, origemAtual)
        }}
      />

      {arrastando && (
        <div className="soltar" aria-hidden="true">
          <div>
            <Icone nome="mais" />
            <p>Solte o arquivo para adicioná-lo à sua biblioteca</p>
          </div>
        </div>
      )}
    </>
  )
}
