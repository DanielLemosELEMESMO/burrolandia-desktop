import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
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

/** Adiciona um PDF de teste e abre o leitor nele. */
async function adicionarEAbrir(app: Parameters<typeof escolherArquivo>[0], janela: import('@playwright/test').Page, caminho: string) {
  await escolherArquivo(app, caminho)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
}

test('na página original, a página atual não muda ao reabrir (páginas baixas, como slides)', async () => {
  const dados = novaPastaDeDados()
  const primeira = await abrirApp(dados)
  await adicionarEAbrir(primeira.app, primeira.janela, pdfDeTeste(dados, 'paisagem.pdf'))
  const leitor = primeira.janela.getByRole('main', { name: 'Lendo Slides de teste' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)

  await primeira.janela.getByRole('radio', { name: 'Página original' }).check()
  for (let i = 0; i < 4; i++) await primeira.janela.getByRole('button', { name: 'Diminuir a página' }).click()
  await expect(leitor).toHaveAttribute('data-pagina', '1')
  await primeira.janela.keyboard.press('ArrowRight')
  await expect(leitor).toHaveAttribute('data-pagina', '2')
  await primeira.janela.waitForTimeout(600)
  await primeira.app.close()

  for (let vez = 0; vez < 2; vez++) {
    const { app, janela } = await abrirApp(dados)
    const deNovo = janela.getByRole('main', { name: 'Lendo Slides de teste' })
    await expect(deNovo).toHaveAttribute('data-modo', 'original')
    await expect(janela.locator('.pagina-original canvas').first()).toBeVisible()
    await janela.waitForTimeout(600)
    await expect(deNovo).toHaveAttribute('data-pagina', '2')
    await app.close()
  }
})

test('trocar para a página original logo ao reabrir leva à página onde você estava', async () => {
  const dados = novaPastaDeDados()
  const primeira = await abrirApp(dados)
  await adicionarEAbrir(primeira.app, primeira.janela, pdfDeTeste(dados, 'dom-casmurro-uma-coluna.pdf'))
  const leitor = primeira.janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  await primeira.janela.getByRole('button', { name: 'Sumário' }).click()
  await primeira.janela.getByRole('button', { name: 'III. A denúncia' }).click()
  await expect(leitor).toHaveAttribute('data-pagina', '3')
  await primeira.janela.waitForTimeout(600)
  await primeira.app.close()

  const { app, janela } = await abrirApp(dados)
  await janela.getByRole('radio', { name: 'Página original' }).check()
  const deNovo = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(deNovo).toHaveAttribute('data-modo', 'original')
  await expect(janela.locator('.pagina-original canvas').first()).toBeVisible()
  await janela.waitForTimeout(600)
  await expect(deNovo).toHaveAttribute('data-pagina', '3')
  await app.close()
})

test('um PDF com caracteres de controle no título abre normalmente', async () => {
  const dados = novaPastaDeDados()
  const { app, janela } = await abrirApp(dados)
  await adicionarEAbrir(app, janela, pdfDeTeste(dados, 'titulo-com-nulo.pdf'))
  const leitor = janela.getByRole('main', { name: 'Lendo Livro de Teste' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  await expect(leitor).toHaveAttribute('data-modo', 'texto')
  await app.close()
})

test('se o texto adaptado não abrir, o PDF abre na página original com um aviso', async () => {
  const dados = novaPastaDeDados()
  const primeira = await abrirApp(dados)
  await adicionarEAbrir(primeira.app, primeira.janela, pdfDeTeste(dados, 'dom-casmurro-uma-coluna.pdf'))
  await expect(primeira.janela.getByRole('main', { name: 'Lendo Dom Casmurro' })).toHaveAttribute('data-cfi', /^epubcfi/)
  await primeira.app.close()

  const [pasta] = readdirSync(join(dados, 'livros'))
  writeFileSync(join(dados, 'livros', pasta, 'leitura.epub'), 'isto não é mais um EPUB')

  const { app, janela } = await abrirApp(dados)
  const leitor = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitor).toHaveAttribute('data-modo', 'original')
  await expect(janela.locator('.pagina-original canvas').first()).toBeVisible()
  await expect(janela.getByText('Não deu para abrir o texto adaptado deste PDF')).toBeVisible()
  await expect(janela.getByText('Não consegui abrir este livro')).toHaveCount(0)
  await app.close()
})
