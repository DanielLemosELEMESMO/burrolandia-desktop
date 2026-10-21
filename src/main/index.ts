import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeTheme, net, screen, shell } from 'electron'
import { ClienteOpenLibrary, ENDERECOS_DO_OPEN_LIBRARY } from '@nucleo/catalogo/cliente'
import { MARCA, TEMAS } from '@nucleo/cores'
import type { Remoto } from '@nucleo/nuvem/remoto'
import type { Preferencias } from '@nucleo/tipos'
import { Banco } from './banco'
import { Biblioteca } from './biblioteca'
import { Catalogo } from './catalogo'
import { converterEmProcessoSeparado } from './conversorPdf'
import { lerPreferencias, lerSessao, registrarIpc } from './ipc'
import { Nuvem } from './nuvem'
import { ORIGEM, caminhoDaInterface, registrarEsquema, tratarProtocolo, urlDaInterface } from './protocolo'
import { sessaoCifrada } from './sessaoCifrada'
import { PROJETO_DA_NUVEM, RemotoSupabase } from './supabase'

// Nome sem acento para a pasta de dados (%APPDATA%\Burrolandia); as janelas mostram "Burrolândia".
app.setName('Burrolandia')
// Nos testes, cada execução usa uma pasta de dados própria.
if (process.env.BURROLANDIA_DADOS) app.setPath('userData', process.env.BURROLANDIA_DADOS)

registrarEsquema()

interface EstadoDaJanela {
  x?: number
  y?: number
  width: number
  height: number
  maximizada: boolean
}

// O fundo da janela antes da primeira pintura: ameixa nas telas da biblioteca, a página do tema no leitor.

const temaEfetivo = (preferencias: Preferencias) =>
  preferencias.tema === 'automatico' ? (nativeTheme.shouldUseDarkColors ? 'noite' : 'papel') : preferencias.tema

function aparencia(banco: Banco, biblioteca: Biblioteca) {
  const tema = temaEfetivo(lerPreferencias(banco))
  const noLeitor = !!lerSessao(banco, biblioteca).livroAberto
  return { tema, tela: noLeitor ? 'leitor' : 'marca', fundo: noLeitor ? TEMAS[tema].pagina : MARCA.ameixa }
}

/** Mapas de caracteres e fontes padrão do pdf.js, copiados junto com a interface (pdfjs/). */
function recursosDoPdfjs(pastaInterface: string) {
  const empacotados = join(pastaInterface, 'pdfjs')
  const pasta = existsSync(empacotados) ? empacotados : join(app.getAppPath(), 'src/renderer/public/pdfjs')
  return { pastaDeCmaps: join(pasta, 'cmaps'), pastaDeFontes: join(pasta, 'standard_fonts') }
}

/**
 * O cliente do catálogo, pela rede do Chromium (respeita o proxy do sistema). Nos testes,
 * BURROLANDIA_SEM_INTERNET desliga o catálogo e BURROLANDIA_CATALOGO aponta para um de mentira.
 */
function clienteDoCatalogo(): ClienteOpenLibrary | null {
  if (process.env.BURROLANDIA_SEM_INTERNET) return null
  const falso = process.env.BURROLANDIA_CATALOGO
  return new ClienteOpenLibrary(
    (url, init) => net.fetch(url, init),
    falso ? { openLibrary: falso, capas: falso } : ENDERECOS_DO_OPEN_LIBRARY,
    falso ? 0 : undefined,
    undefined,
    falso ? 0 : undefined,
  )
}

/**
 * A nuvem: o projeto do Supabase, pela rede do Chromium. Nos testes, BURROLANDIA_NUVEM aponta para
 * uma nuvem de mentira, ou é "desligada" (nenhum teste fala com a nuvem de verdade).
 */
function remotoDaNuvem(banco: Banco): Remoto | null {
  const endereco = process.env.BURROLANDIA_NUVEM
  if (endereco === 'desligada') return null
  const projeto = endereco ? { url: endereco, chave: 'sb_publishable_de_teste' } : PROJETO_DA_NUVEM
  const buscar: typeof fetch = (url, init) => net.fetch(url instanceof URL ? url.href : url, init)
  return new RemotoSupabase(projeto, sessaoCifrada(banco), buscar)
}

// Os livros ainda não procurados no catálogo são procurados um pouco depois de abrir, sem atrapalhar.
const ESPERA_PARA_RECONHECER = 4000

/** Só reaproveita a posição antiga se ela ainda cabe numa tela conectada. */
function estadoValido(estado: EstadoDaJanela | undefined): EstadoDaJanela {
  const padrao = { width: 1280, height: 860, maximizada: false }
  if (!estado || estado.width < 600 || estado.height < 400) return padrao
  if (estado.x === undefined || estado.y === undefined) return estado
  const { x, y, width } = estado
  const visivel = screen.getAllDisplays().some(({ workArea: a }) =>
    x < a.x + a.width - 100 && x + width > a.x + 100 && y >= a.y - 10 && y < a.y + a.height - 100,
  )
  return visivel ? estado : { ...estado, x: undefined, y: undefined }
}

function criarJanela(banco: Banco, biblioteca: Biblioteca) {
  const estado = estadoValido(banco.lerPreferencia<EstadoDaJanela>('janela'))
  const { tema, tela, fundo } = aparencia(banco, biblioteca)
  const janela = new BrowserWindow({
    x: estado.x,
    y: estado.y,
    width: estado.width,
    height: estado.height,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'Burrolândia',
    backgroundColor: fundo,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  if (estado.maximizada) janela.maximize()
  janela.once('ready-to-show', () => janela.show())

  janela.on('close', () => {
    const { x, y, width, height } = janela.getNormalBounds()
    banco.salvarPreferencia('janela', { x, y, width, height, maximizada: janela.isMaximized() } satisfies EstadoDaJanela)
  })

  // Links externos abrem no navegador; a janela nunca sai do app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (evento, url) => {
    const daInterface = url.startsWith(ORIGEM) || (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL))
    if (!daInterface) evento.preventDefault()
  })

  // O tema e a tela vão na URL para a primeira pintura já sair na cor certa.
  void janela.loadURL(`${urlDaInterface()}?tema=${tema}&tela=${tela}`)
  return janela
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let banco: Banco | undefined
  let nuvem: Nuvem | undefined

  app.on('second-instance', () => {
    const janela = BrowserWindow.getAllWindows()[0]
    if (janela?.isMinimized()) janela.restore()
    janela?.focus()
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('br.com.burrolandia.desktop')
    if (app.isPackaged && process.platform !== 'darwin') Menu.setApplicationMenu(null)

    const pastaDados = app.getPath('userData')
    try {
      mkdirSync(pastaDados, { recursive: true })
      banco = new Banco(join(pastaDados, 'burrolandia.db'))
    } catch (erro) {
      // Sem isso, um banco corrompido deixaria o app aberto sem janela nenhuma.
      dialog.showErrorBox(
        'Não deu para abrir a sua biblioteca',
        `O arquivo da biblioteca não abriu (${(erro as Error).message}).\n\nOs seus livros continuam em:\n${pastaDados}\n\nFeche outras cópias do app e tente de novo.`,
      )
      app.quit()
      return
    }
    const pastaInterface = caminhoDaInterface(__dirname)
    const biblioteca = new Biblioteca(pastaDados, banco, (bytes, opcoes) =>
      converterEmProcessoSeparado(bytes, { ...opcoes, recursos: recursosDoPdfjs(pastaInterface) }),
    )
    const bancoAberto = banco
    void biblioteca.limparPastasOrfas()
    const avisarJanelas = (canal: string, ...argumentos: unknown[]) => {
      for (const janela of BrowserWindow.getAllWindows()) {
        if (!janela.isDestroyed() && !janela.webContents.isDestroyed()) janela.webContents.send(canal, ...argumentos)
      }
    }
    const catalogo = new Catalogo(banco, biblioteca, clienteDoCatalogo(), livroId => avisarJanelas('catalogo:mudou', livroId))
    const sincronia = new Nuvem(banco, biblioteca, remotoDaNuvem(banco), (estado, livros) =>
      avisarJanelas('nuvem:mudou', estado, livros),
    )
    nuvem = sincronia
    // Cada mudança daqui (posição, capa, livro novo, removido) sobe uns segundos depois.
    banco.quandoMudar(() => sincronia.agendar())

    tratarProtocolo(biblioteca, pastaInterface)
    registrarIpc(banco, biblioteca, catalogo, sincronia, () => {
      const { fundo } = aparencia(bancoAberto, biblioteca)
      for (const janela of BrowserWindow.getAllWindows()) janela.setBackgroundColor(fundo)
    })
    criarJanela(banco, biblioteca)
    void sincronia.iniciar()
    setTimeout(() => void catalogo.reconhecerPendentes(), ESPERA_PARA_RECONHECER)
    // Voltando para a janela (depois de ler no celular, por exemplo), vê o que mudou.
    app.on('browser-window-focus', () => sincronia.aoVoltar())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela(bancoAberto, biblioteca)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Fechando, a última posição sobe antes (no máximo 3 segundos; o resto vai na próxima abertura).
  let subiuAntesDeSair = false
  app.on('before-quit', evento => {
    if (subiuAntesDeSair || !nuvem) return
    subiuAntesDeSair = true
    evento.preventDefault()
    void nuvem.enviarAntesDeSair().finally(() => app.quit())
  })

  app.on('will-quit', () => {
    void nuvem?.parar()
    banco?.fechar()
  })
}
