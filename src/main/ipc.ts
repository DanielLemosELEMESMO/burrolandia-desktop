// Os canais entre a interface e o processo principal. Tudo que chega é validado antes de usar.

import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { PREFERENCIAS_PADRAO, type Preferencias, type Sessao } from '@nucleo/tipos'
import { validarLocator, validarPreferencias } from '@nucleo/validacao'
import type { Banco } from './banco'
import type { Biblioteca } from './biblioteca'

const ID = /^[0-9a-f-]{36}$/i
const idValido = (id: unknown): id is string => typeof id === 'string' && ID.test(id)

export function lerPreferencias(banco: Banco): Preferencias {
  return { ...PREFERENCIAS_PADRAO, ...validarPreferencias(banco.lerPreferencia('leitura')) }
}

function lerSessao(banco: Banco, biblioteca: Biblioteca): Sessao {
  const sessao = banco.lerPreferencia<Sessao>('sessao')
  const livroAberto = sessao?.livroAberto
  return { livroAberto: idValido(livroAberto) && biblioteca.obter(livroAberto) ? livroAberto : null }
}

export function registrarIpc(banco: Banco, biblioteca: Biblioteca, aoMudarPreferencias: (p: Preferencias) => void) {
  const importar = (caminho: string, destino: WebContents) =>
    biblioteca.importar(caminho, andamento => {
      if (!destino.isDestroyed()) destino.send('importacao:andamento', andamento)
    })

  ipcMain.handle('biblioteca:listar', () => biblioteca.listar())

  ipcMain.handle('biblioteca:adicionar', async evento => {
    const janela = BrowserWindow.fromWebContents(evento.sender)
    const opcoes: Electron.OpenDialogOptions = {
      title: 'Adicionar livro',
      buttonLabel: 'Adicionar',
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

  ipcMain.handle('leitura:abrir', (_, id: unknown) => {
    if (!idValido(id) || !biblioteca.obter(id)) return null
    biblioteca.marcarAberto(id)
    banco.salvarPreferencia('sessao', { livroAberto: id } satisfies Sessao)
    return biblioteca.obter(id)
  })

  ipcMain.handle('leitura:fechar', () => {
    banco.salvarPreferencia('sessao', { livroAberto: null } satisfies Sessao)
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
    aoMudarPreferencias(preferencias)
    return preferencias
  })

  ipcMain.handle('sessao:ler', () => lerSessao(banco, biblioteca))
}
