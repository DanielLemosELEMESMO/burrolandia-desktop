import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { PREFERENCIAS_PADRAO, type Livro, type Preferencias } from '@nucleo/tipos'
import { api, temaEfetivo } from './api'
import { AjustesLeitura } from './componentes/AjustesLeitura'
import { Dock, type Destino, type Navegacao } from './componentes/Dock'
import { Icone } from './componentes/Icone'
import { DialogosDeImportacao, useImportacao } from './componentes/Importacao'
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
      profundidade = 0
      setArrastando(false)
      // Texto arrastado (para a busca, por exemplo) segue o caminho normal; só arquivos viram livro.
      if (!temArquivo(e)) return
      e.preventDefault()
      if (e.dataTransfer?.files.length) aoSoltar(e.dataTransfer.files)
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

  const abrir = useCallback(async (id: string, origem: Destino) => {
    const livro = await api.leitura.abrir(id)
    if (livro) setTela({ tipo: 'leitor', livro, origem })
  }, [])

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
          aoAbrir={id => void abrir(id, 'inicio')}
          aoVerBiblioteca={() => void irPara('biblioteca')}
          aoImportar={navegacao.aoImportar}
        />
      )}
      {tela.tipo === 'biblioteca' && (
        <TelaBiblioteca
          livros={livros}
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
