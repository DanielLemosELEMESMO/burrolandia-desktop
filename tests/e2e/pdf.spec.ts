import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { abrirApp, escolherArquivo, novaPastaDeDados } from './app'

const pdfDeTeste = (dados: string, nome: string) => {
  const origem = join(dados, 'origem')
  mkdirSync(origem, { recursive: true })
  const destino = join(origem, nome)
  copyFileSync(join(__dirname, '../fixtures/pdf', nome), destino)
  return destino
}

test('adiciona um PDF, lê o texto adaptado e alterna com a página original sem perder a página', async () => {
  const dados = novaPastaDeDados()
  const { app, janela } = await abrirApp(dados)

  await escolherArquivo(app, pdfDeTeste(dados, 'dom-casmurro-uma-coluna.pdf'))
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  const fim = janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' })
  await expect(fim).toBeVisible({ timeout: 30_000 })
  await expect(fim.locator('strong', { hasText: 'Dom Casmurro' })).toBeVisible()
  await expect(fim.locator('img.capa')).toBeVisible()
  await fim.getByRole('button', { name: 'Começar a ler' }).click()

  const leitor = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  await expect(leitor).toHaveAttribute('data-pagina', '1')

  await janela.getByRole('radio', { name: 'Página original' }).check()
  await expect(janela.locator('.pagina-original canvas').first()).toBeVisible()
  await janela.keyboard.press('ArrowRight')
  await expect(leitor).toHaveAttribute('data-pagina', '2')

  await janela.getByRole('radio', { name: 'Texto adaptado' }).check()
  await expect(leitor).toHaveAttribute('data-modo', 'texto')
  await expect(leitor).toHaveAttribute('data-pagina', '2')
  await app.close()
})

test('um PDF digitalizado abre direto na página original, com um aviso', async () => {
  const dados = novaPastaDeDados()
  const { app, janela } = await abrirApp(dados)

  await escolherArquivo(app, pdfDeTeste(dados, 'digitalizado.pdf'))
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()

  const leitor = janela.getByRole('main', { name: 'Lendo Digitalizado' })
  await expect(leitor).toHaveAttribute('data-modo', 'original')
  await expect(janela.locator('.pagina-original canvas').first()).toBeVisible()
  await expect(janela.getByText('Este PDF é uma imagem digitalizada')).toBeVisible()
  await expect(janela.getByRole('radio', { name: 'Texto adaptado' })).toHaveCount(0)
  await app.close()
})
