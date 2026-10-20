// Capturas de tela das telas principais, para acompanhar o visual. Rode com:
//   npx electron-vite build && xvfb-run -a npx playwright test --config tests/capturas/playwright.config.ts

import { join } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'
import { test } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, novaPastaDeDados } from '../e2e/app'

const destino = process.env.CAPTURAS ?? join(__dirname, '../../test-results/capturas')

test('capturas das telas', async () => {
  mkdirSync(destino, { recursive: true })
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)
  await janela.setViewportSize({ width: 1280, height: 820 })
  const foto = (nome: string) => janela.screenshot({ path: join(destino, `${nome}.png`) })

  await janela.getByText('Sua biblioteca está vazia').waitFor()
  await foto('01-biblioteca-vazia')

  await escolherArquivo(app, livros.memorias)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).waitFor()
  await janela.waitForTimeout(300)
  await foto('02-livro-adicionado')
  await janela.getByRole('button', { name: 'Voltar à biblioteca' }).click()

  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  const leitor = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await leitor.waitFor()
  await janela.waitForTimeout(1200)
  await foto('03-leitor-papel')
  await janela.keyboard.press('ArrowRight')
  await janela.keyboard.press('ArrowRight')
  await janela.waitForTimeout(3200)
  await foto('04-leitor-sem-barras')

  await janela.mouse.move(640, 300)
  await janela.getByRole('button', { name: 'Ajustes de leitura' }).click()
  await janela.waitForTimeout(400)
  await foto('05-ajustes')
  await janela.getByRole('radio', { name: 'Sépia' }).check()
  await janela.waitForTimeout(600)
  await foto('06-ajustes-sepia')
  await janela.getByRole('radio', { name: 'Noite' }).check()
  await janela.getByRole('radio', { name: 'Atkinson' }).check()
  await janela.waitForTimeout(600)
  await janela.keyboard.press('Escape')
  await janela.waitForTimeout(400)
  await foto('07-leitor-noite-atkinson')

  await janela.getByRole('button', { name: 'Sumário' }).click()
  await janela.waitForTimeout(400)
  await foto('08-sumario')
  await janela.keyboard.press('Escape')

  await janela.getByRole('button', { name: 'Ajustes de leitura' }).click()
  await janela.getByRole('radio', { name: 'Papel' }).check()
  await janela.getByRole('radio', { name: 'Literata' }).check()
  await janela.keyboard.press('Escape')
  await janela.getByRole('button', { name: 'Voltar à biblioteca' }).click()
  await janela.getByRole('region', { name: 'Continuar lendo' }).waitFor()
  await janela.waitForTimeout(500)
  await foto('09-biblioteca-continuar')

  const pdf = join(dados, 'origem', 'dom-casmurro.pdf')
  copyFileSync(join(__dirname, '../fixtures/pdf/dom-casmurro-uma-coluna.pdf'), pdf)
  await escolherArquivo(app, pdf)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  const fim = janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' })
  await fim.waitFor()
  await janela.waitForTimeout(400)
  await foto('10-pdf-adicionado')
  await fim.getByRole('button', { name: 'Começar a ler' }).click()
  await janela.getByRole('main', { name: 'Lendo Dom Casmurro' }).and(janela.locator('[data-cfi]')).waitFor()
  await janela.waitForTimeout(1000)
  await foto('11-pdf-texto-adaptado')
  await janela.getByRole('radio', { name: 'Página original' }).check()
  await janela.locator('.pagina-original canvas').first().waitFor()
  await janela.waitForTimeout(800)
  await foto('12-pdf-pagina-original')
  await app.close()
})
