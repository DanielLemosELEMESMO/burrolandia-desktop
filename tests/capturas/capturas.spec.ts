// Capturas de tela das telas principais, para acompanhar o visual. Rode com:
//   npx electron-vite build && xvfb-run -a npx playwright test --config tests/capturas/playwright.config.ts

import { join } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, irPara, novaPastaDeDados } from '../e2e/app'
import { abrirCatalogoFalso } from '../e2e/catalogo-falso'

const destino = process.env.CAPTURAS ?? join(__dirname, '../../test-results/capturas')

/** As faixas do leitor somem enquanto você lê; mexer o mouse traz de volta. */
async function mostrarFaixas(janela: Page) {
  await janela.mouse.move(640, 400)
  await janela.mouse.move(650, 410)
  await janela.waitForTimeout(500)
}

test('capturas das telas', async () => {
  mkdirSync(destino, { recursive: true })
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const pdf = join(dados, 'origem', 'notas-duas-colunas.pdf')
  copyFileSync(join(__dirname, '../fixtures/pdf/notas-duas-colunas.pdf'), pdf)
  const catalogo = await abrirCatalogoFalso()
  const { app, janela } = await abrirApp(dados, { catalogo: catalogo.url })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 820))
  const foto = (nome: string) => janela.screenshot({ path: join(destino, `${nome}.png`) })

  await janela.getByText('Sua biblioteca está vazia').waitFor()
  await janela.waitForTimeout(500)
  await foto('01-inicio-vazio')

  await escolherArquivo(app, livros.memorias)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('button', { name: 'Agora não' }).click()
  await escolherArquivo(app, pdf)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await expect(janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' })).toBeVisible()
  await janela.waitForTimeout(400)
  await foto('02-pdf-importado')
  await janela.getByRole('button', { name: 'Agora não' }).click()

  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  const leitor = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  for (let i = 0; i < 2; i++) {
    await janela.keyboard.press('ArrowRight')
    await janela.waitForTimeout(300)
  }
  await mostrarFaixas(janela)
  await foto('03-leitor-creme')
  await janela.waitForTimeout(3200)
  await foto('04-leitor-imersivo')

  await mostrarFaixas(janela)
  await janela.getByRole('button', { name: 'Voltar ao início' }).click()
  await expect(janela.getByRole('region', { name: 'Continuar lendo' })).toBeVisible()
  await janela.waitForTimeout(500)
  await foto('05-inicio-continuar')

  await irPara(janela, 'Biblioteca')
  await janela.waitForTimeout(500)
  await foto('06-biblioteca-grade')
  await janela.getByRole('button', { name: 'Ver em lista' }).click()
  await janela.waitForTimeout(300)
  await foto('07-biblioteca-lista')
  await janela.getByRole('button', { name: 'Ver em grade' }).click()

  await janela.getByRole('button', { name: 'Ajustes de leitura' }).click()
  await janela.waitForTimeout(400)
  await foto('08-ajustes')
  await janela.getByRole('radio', { name: 'Noite' }).check()
  await janela.waitForTimeout(300)
  await janela.keyboard.press('Escape')

  await janela.getByRole('button', { name: /Dom Casmurro/ }).first().click()
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  await mostrarFaixas(janela)
  await foto('09-leitor-noite')
  await janela.getByRole('button', { name: 'Sumário' }).click()
  await janela.waitForTimeout(400)
  await foto('10-sumario-noite')
  await janela.keyboard.press('Escape')
  await mostrarFaixas(janela)
  await janela.getByRole('button', { name: 'Voltar à biblioteca' }).click()

  await janela.getByRole('button', { name: 'Ajustes de leitura' }).click()
  await janela.getByRole('radio', { name: 'Creme' }).check()
  await janela.keyboard.press('Escape')
  await janela.getByRole('button', { name: /Notas sobre a leitura/ }).first().click()
  await expect(janela.getByRole('main', { name: 'Lendo Notas sobre a leitura' })).toHaveAttribute('data-cfi', /^epubcfi/)
  await mostrarFaixas(janela)
  await foto('11-pdf-texto-adaptado')
  await janela.getByRole('radio', { name: 'Página original' }).check()
  await expect(janela.locator('.pagina-original canvas').first()).toBeVisible()
  await mostrarFaixas(janela)
  await janela.waitForTimeout(300)
  await foto('12-pdf-pagina-original')
  await janela.getByRole('button', { name: 'Voltar à biblioteca' }).click()

  // Com o mouse perto do dock, o botão de recolher aparece ao lado.
  const dock = janela.getByRole('navigation', { name: 'Navegação principal' })
  await expect(dock).toBeVisible()
  const caixa = (await dock.boundingBox())!
  await janela.mouse.move(caixa.x + caixa.width + 24, caixa.y + caixa.height / 2)
  await janela.waitForTimeout(300)
  await foto('13a-dock-com-recolher')
  await janela.getByRole('button', { name: 'Recolher a navegação' }).click()
  await janela.waitForTimeout(300)
  await foto('13-dock-recolhido')
  await janela.getByRole('button', { name: 'Mostrar a navegação' }).click()

  // Etapa 3: o catálogo.
  await janela.getByRole('button', { name: 'Mais ações para Dom Casmurro' }).click()
  await janela.getByRole('menuitem', { name: 'Sobre este livro' }).click()
  const sobre = janela.getByRole('dialog', { name: 'Sobre este livro' })
  await expect(sobre.getByRole('region', { name: 'A obra' })).toContainText('90 edições')
  await janela.waitForTimeout(500)
  await foto('14-sobre-o-livro')
  await sobre.getByRole('button', { name: 'Escolher a edição' }).click()
  await expect(sobre.getByRole('list', { name: 'Edições' })).toBeVisible()
  await janela.waitForTimeout(300)
  await foto('15-escolher-a-edicao')
  await sobre.getByRole('list', { name: 'Edições' }).getByRole('button', { name: /9788582850350/ }).click()
  await expect(sobre.getByRole('region', { name: 'Sua edição' })).toContainText('Penguin-Companhia')
  await sobre.locator('.sobre-capa img').waitFor()
  await sobre.evaluate(painel => painel.scrollTo(0, painel.scrollHeight))
  await janela.waitForTimeout(400)
  await foto('16-sua-edicao')
  await app.close()
  await catalogo.fechar()
})
