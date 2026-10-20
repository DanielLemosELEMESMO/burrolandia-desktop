// Abre o app de verdade (build de produção em out/) com uma pasta de dados descartável.

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

const raiz = resolve(__dirname, '../..')

export const novaPastaDeDados = () => mkdtempSync(join(tmpdir(), 'burrolandia-e2e-'))

export async function abrirApp(pastaDados: string): Promise<{ app: ElectronApplication; janela: Page }> {
  // Em contêiner (root) e no CI do Linux, o sandbox do Chromium não tem as permissões de que precisa.
  const semSandbox = process.getuid?.() === 0 || process.env.CI ? ['--no-sandbox'] : []
  // BURROLANDIA_EXECUTAVEL testa o app empacotado (por exemplo, release/linux-unpacked/burrolandia-desktop).
  const executavel = process.env.BURROLANDIA_EXECUTAVEL
  const app = await electron.launch({
    ...(executavel ? { executablePath: executavel, args: semSandbox } : { args: [join(raiz, 'out/main/index.js'), ...semSandbox] }),
    env: { ...process.env, BURROLANDIA_DADOS: pastaDados },
  })
  const janela = await app.firstWindow()
  await janela.waitForLoadState('domcontentloaded')
  return { app, janela }
}

/** Faz o diálogo "Abrir arquivo" do sistema devolver este caminho. */
export async function escolherArquivo(app: ElectronApplication, caminho: string) {
  await app.evaluate(({ dialog }, arquivo) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [arquivo] })) as typeof dialog.showOpenDialog
  }, caminho)
}
