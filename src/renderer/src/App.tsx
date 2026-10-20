import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { PREFERENCIAS_PADRAO, type Livro, type Preferencias } from '@nucleo/tipos'
import { api, temaEfetivo } from './api'
import { AjustesLeitura } from './componentes/AjustesLeitura'
import { TelaBiblioteca } from './telas/Biblioteca'
import { TelaLeitor } from './telas/Leitor'
import { usarMidia } from './usarMidia'

type Tela = { tipo: 'carregando' } | { tipo: 'biblioteca' } | { tipo: 'leitor'; livro: Livro }

export function App() {
  const [preferencias, setPreferencias] = useState<Preferencias>(PREFERENCIAS_PADRAO)
  const [livros, setLivros] = useState<Livro[]>([])
  const [tela, setTela] = useState<Tela>({ tipo: 'carregando' })
  const [ajustesAbertos, setAjustesAbertos] = useState(false)
  const escuroNoSistema = usarMidia('(prefers-color-scheme: dark)')
  const tema = temaEfetivo(preferencias, escuroNoSistema)

  useLayoutEffect(() => {
    document.documentElement.dataset.tema = tema
  }, [tema])

  const recarregar = useCallback(async () => setLivros(await api.biblioteca.listar()), [])

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
      setTela(livro ? { tipo: 'leitor', livro } : { tipo: 'biblioteca' })
    })()
  }, [])

  const abrir = useCallback(async (id: string) => {
    const livro = await api.leitura.abrir(id)
    if (livro) setTela({ tipo: 'leitor', livro })
  }, [])

  const voltar = useCallback(async () => {
    await api.leitura.fechar()
    await recarregar()
    setTela({ tipo: 'biblioteca' })
  }, [recarregar])

  const mudarPreferencias = useCallback((parcial: Partial<Preferencias>) => {
    setPreferencias(atuais => ({ ...atuais, ...parcial }))
    void api.preferencias.salvar(parcial)
  }, [])

  return (
    <>
      {tela.tipo === 'biblioteca' && (
        <TelaBiblioteca
          livros={livros}
          aoAbrir={id => void abrir(id)}
          aoMudarBiblioteca={() => void recarregar()}
          abrirAjustes={() => setAjustesAbertos(true)}
        />
      )}
      {tela.tipo === 'leitor' && (
        <TelaLeitor
          key={tela.livro.id}
          livro={tela.livro}
          preferencias={preferencias}
          tema={tema}
          aoMudarPreferencias={mudarPreferencias}
          aoVoltar={() => void voltar()}
        />
      )}
      {tela.tipo === 'biblioteca' && (
        <AjustesLeitura
          aberto={ajustesAbertos}
          aoFechar={() => setAjustesAbertos(false)}
          preferencias={preferencias}
          aoMudar={mudarPreferencias}
        />
      )}
    </>
  )
}
