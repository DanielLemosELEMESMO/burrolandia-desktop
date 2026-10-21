// Os canais entre a interface e o processo principal. Tudo que chega é validado antes de usar.

import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { PREFERENCIAS_PADRAO, type Preferencias, type Sessao } from '@nucleo/tipos'
import { validarLocator, validarPreferencias } from '@nucleo/validacao'
import type { Banco } from './banco'
import type { Biblioteca } from './biblioteca'
import type { Catalogo } from './catalogo'

const ID = /^[0-9a-f-]{36}$/i
const idValido = (id: unknown): id is string => typeof id === 'string' && ID.test(id)
const obraValida = (id: unknown): id is string => typeof id === 'string' && /^OL\d{1,12}W$/.test(id)
const edicaoValida = (id: unknown): id is string => typeof id === 'string' && /^OL\d{1,12}M$/.test(id)
const buscaValida = (texto: unknown): texto is string =>
  typeof texto === 'string' && texto.trim().length > 0 && texto.length <= 200

export function lerPreferencias(banco: Banco): Preferencias {
  return { ...PREFERENCIAS_PADRAO, ...validarPreferencias(banco.lerPreferencia('leitura')) }
}

export function lerSessao(banco: Banco, biblioteca: Biblioteca): Sessao {
  const sessao = banco.lerPreferencia<Sessao>('sessao')
  const livroAberto = sessao?.livroAberto
  return { livroAberto: idValido(livroAberto) && biblioteca.obter(livroAberto) ? livroAberto : null }
}

/** aoMudarAparencia: o tema ou a tela (biblioteca ou leitor) mudou, e o fundo da janela acompanha. */
export function registrarIpc(
  banco: Banco,
  biblioteca: Biblioteca,
  catalogo: Catalogo,
  aoMudarAparencia: () => void,
) {
  const importar = (caminho: string, destino: WebContents) =>
    biblioteca.importar(caminho, andamento => {
      if (!destino.isDestroyed()) destino.send('importacao:andamento', andamento)
    })

  ipcMain.handle('biblioteca:listar', () => biblioteca.listar())

  ipcMain.handle('biblioteca:adicionar', async evento => {
    const janela = BrowserWindow.fromWebContents(evento.sender)
    const opcoes: Electron.OpenDialogOptions = {
      title: 'Importar livro',
      buttonLabel: 'Importar',
      properties: ['openFile'],
      filters: [{ name: 'Livros (EPUB e PDF)', extensions: ['epub', 'pdf'] }],
    }
    const escolha = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes)
    if (escolha.canceled || !escolha.filePaths[0]) return null
    return importar(escolha.filePaths[0], evento.sender)
  })

  ipcMain.handle('biblioteca:importar', (evento, caminho: unknown) => {
    if (typeof caminho !== 'string' || !caminho) throw new Error('Caminho inválido')
    return importar(caminho, evento.sender)
  })

  ipcMain.handle('biblioteca:remover', async (_, id: unknown) => {
    if (!idValido(id)) return
    if (lerSessao(banco, biblioteca).livroAberto === id) banco.salvarPreferencia('sessao', { livroAberto: null })
    await biblioteca.remover(id)
  })

  ipcMain.handle('biblioteca:salvar-capa', (_, id: unknown, imagem: unknown) => {
    if (!idValido(id) || !(imagem instanceof Uint8Array)) return null
    return biblioteca.salvarCapa(id, imagem)
  })

  ipcMain.handle('leitura:abrir', (_, id: unknown) => {
    if (!idValido(id) || !biblioteca.obter(id)) return null
    biblioteca.marcarAberto(id)
    banco.salvarPreferencia('sessao', { livroAberto: id } satisfies Sessao)
    aoMudarAparencia()
    return biblioteca.obter(id)
  })

  ipcMain.handle('leitura:fechar', () => {
    banco.salvarPreferencia('sessao', { livroAberto: null } satisfies Sessao)
    aoMudarAparencia()
  })

  ipcMain.handle('leitura:salvar-posicao', (_, id: unknown, posicao: unknown) => {
    const locator = validarLocator(posicao)
    if (idValido(id) && locator) biblioteca.salvarPosicao(id, locator)
  })

  ipcMain.on('leitura:salvar-posicao-agora', (evento, id: unknown, posicao: unknown) => {
    const locator = validarLocator(posicao)
    if (idValido(id) && locator) biblioteca.salvarPosicao(id, locator)
    evento.returnValue = true
  })

  ipcMain.handle('preferencias:ler', () => lerPreferencias(banco))

  ipcMain.handle('preferencias:salvar', (_, parcial: unknown) => {
    const preferencias = { ...lerPreferencias(banco), ...validarPreferencias(parcial) }
    banco.salvarPreferencia('leitura', preferencias)
    aoMudarAparencia()
    return preferencias
  })

  ipcMain.handle('sessao:ler', () => lerSessao(banco, biblioteca))

  // Catálogo (etapa 3): só ids, ids do Open Library e textos curtos passam.
  ipcMain.handle('catalogo:sobre', (_, id: unknown) => {
    if (!idValido(id)) return null
    // O que já se sabe vai na hora; a descrição da obra, se faltar, chega depois (catalogo:mudou).
    catalogo.completarDescricao(id).catch(erro => console.warn('Não deu para buscar a descrição da obra', erro))
    return catalogo.sobre(id)
  })
  ipcMain.handle('catalogo:reconhecer', (_, id: unknown) => (idValido(id) ? catalogo.reconhecer(id) : null))
  ipcMain.handle('catalogo:buscar', (_, texto: unknown) => (buscaValida(texto) ? catalogo.buscarObras(texto.trim()) : []))
  ipcMain.handle('catalogo:edicoes', (_, id: unknown) => (idValido(id) ? catalogo.edicoes(id) : []))
  ipcMain.handle('catalogo:escolher-obra', (_, id: unknown, obraId: unknown) =>
    idValido(id) && obraValida(obraId) ? catalogo.escolherObra(id, obraId) : null,
  )
  ipcMain.handle('catalogo:escolher-edicao', (_, id: unknown, edicaoId: unknown) =>
    idValido(id) && edicaoValida(edicaoId) ? catalogo.escolherEdicao(id, edicaoId) : null,
  )
  ipcMain.handle('catalogo:nenhuma', (_, id: unknown) => (idValido(id) ? catalogo.nenhuma(id) : null))
  ipcMain.handle('catalogo:capa', (_, id: unknown) => (idValido(id) ? catalogo.capaDoCatalogo(id) : null))
  ipcMain.handle('catalogo:usar-capa', (_, id: unknown) => (idValido(id) ? catalogo.usarCapaDoCatalogo(id) : null))
}
