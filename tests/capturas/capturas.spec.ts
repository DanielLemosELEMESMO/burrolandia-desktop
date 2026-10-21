// Capturas de tela das telas principais, para acompanhar o visual. Rode com:
//   npx electron-vite build && xvfb-run -a npx playwright test --config tests/capturas/playwright.config.ts

import { join } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, irPara, novaPastaDeDados } from '../e2e/app'
import { abrirCatalogoFalso } from '../e2e/catalogo-falso'
import { abrirNuvemFalsa } from '../e2e/nuvem-falsa'

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
  const nuvem = await abrirNuvemFalsa()
  const { app, janela } = await abrirApp(dados, { catalogo: catalogo.url, nuvem: nuvem.url })
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
  await sobre.getByRole('button', { name: 'Fechar' }).click()

  // Trocar a capa: as páginas do PDF, o recorte e as capas do catálogo.
  await janela.getByRole('button', { name: 'Mais ações para Notas sobre a leitura' }).click()
  await janela.getByRole('menuitem', { name: 'Trocar a capa' }).click()
  const trocar = janela.getByRole('dialog', { name: 'Trocar a capa' })
  await trocar.getByRole('list', { name: 'Páginas do livro' }).getByRole('button').first().waitFor()
  await janela.waitForTimeout(800)
  await foto('17-trocar-capa-paginas')
  await trocar.getByRole('button', { name: 'Página 1' }).click()
  await trocar.getByRole('group', { name: /Área do recorte/ }).waitFor()
  await janela.waitForTimeout(400)
  await foto('18-trocar-capa-recorte')
  await trocar.getByRole('button', { name: 'Fechar' }).click()

  await janela.getByRole('button', { name: 'Mais ações para Dom Casmurro' }).click()
  await janela.getByRole('menuitem', { name: 'Trocar a capa' }).click()
  await trocar.getByRole('radio', { name: 'Do catálogo' }).check()
  await trocar.getByRole('list', { name: 'Capas do catálogo' }).locator('img').first().waitFor()
  await janela.waitForTimeout(800)
  await foto('19-trocar-capa-catalogo')
  await trocar.getByRole('button', { name: 'Fechar' }).click()

  // Sua conta: entrar (criar a conta) e como está a nuvem.
  await janela.getByRole('banner').getByRole('button', { name: 'Entrar' }).click()
  const conta = janela.getByRole('dialog', { name: 'Sua conta' })
  await conta.getByRole('radio', { name: 'Criar conta' }).check()
  await conta.getByLabel('E-mail').fill('ana@burrolandia.test')
  await janela.waitForTimeout(300)
  await foto('20-sua-conta-criar')
  await conta.getByLabel('Senha').fill('senha-de-teste-123')
  await conta.getByRole('button', { name: 'Criar conta' }).click()
  await expect(conta.getByRole('status')).toHaveText(/Tudo sincronizado/, { timeout: 30_000 })
  await janela.waitForTimeout(300)
  await foto('21-sua-conta-sincronizada')
  await app.close()

  // Outro aparelho na mesma conta: os livros chegam "na nuvem" e descem ao abrir.
  const outro = await abrirApp(novaPastaDeDados(), { nuvem: nuvem.url })
  await outro.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 820))
  await outro.janela.getByRole('banner').getByRole('button', { name: 'Entrar' }).click()
  const contaDoOutro = outro.janela.getByRole('dialog', { name: 'Sua conta' })
  await contaDoOutro.getByLabel('E-mail').fill('ana@burrolandia.test')
  await contaDoOutro.getByLabel('Senha').fill('senha-de-teste-123')
  await contaDoOutro.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(contaDoOutro.getByRole('status')).toHaveText(/Tudo sincronizado/, { timeout: 30_000 })
  await outro.janela.keyboard.press('Escape')
  await irPara(outro.janela, 'Biblioteca')
  await outro.janela.getByRole('main').locator('img.capa').first().waitFor()
  await outro.janela.waitForTimeout(600)
  await outro.janela.screenshot({ path: join(destino, '22-outro-aparelho-na-nuvem.png') })
  await outro.app.close()
  await catalogo.fechar()
  await nuvem.fechar()
})
