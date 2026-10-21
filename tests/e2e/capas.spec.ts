import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { epubDomCasmurroComCapa, gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, irPara, novaPastaDeDados } from './app'
import { abrirCatalogoFalso } from './catalogo-falso'

const VERMELHA = join(__dirname, '../fixtures/capa-vermelha.jpg')

async function importar(app: ElectronApplication, janela: Page, caminho: string) {
  await escolherArquivo(app, caminho)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Agora não' }).click()
}

async function trocarCapa(janela: Page, titulo: string) {
  await irPara(janela, 'Biblioteca')
  await janela.getByRole('button', { name: `Mais ações para ${titulo}` }).click()
  await janela.getByRole('menuitem', { name: 'Trocar a capa' }).click()
  return janela.getByRole('dialog', { name: 'Trocar a capa' })
}

/** Largura e altura da imagem que a tela mostra de fato. */
const tamanho = (imagem: Locator) =>
  imagem.evaluate(img => {
    const { naturalWidth, naturalHeight } = img as unknown as { naturalWidth: number; naturalHeight: number }
    return { largura: naturalWidth, altura: naturalHeight }
  })

/** A capa do livro na estante (só há um livro nestes testes). */
const capaNaEstante = (janela: Page) => janela.getByRole('main').locator('img.capa').first()

const proporcao = async (imagem: Locator) => {
  const { largura, altura } = await tamanho(imagem)
  return largura ? altura / largura : 0
}

test('a capa do PDF que vem no meio de uma página branca vira só a imagem', async () => {
  const dados = novaPastaDeDados()
  mkdirSync(join(dados, 'origem'), { recursive: true })
  const pdf = join(dados, 'origem', 'capa-com-margem.pdf')
  copyFileSync(join(__dirname, '../fixtures/pdf/capa-com-margem.pdf'), pdf)
  const { app, janela } = await abrirApp(dados)
  await importar(app, janela, pdf)
  await irPara(janela, 'Biblioteca')
  // A imagem tem 300 × 450 (1,5); a página, 420 × 595 (1,42).
  await expect.poll(() => proporcao(capaNaEstante(janela))).toBeCloseTo(1.5, 2)
  await app.close()
})

test('trocar a capa por uma página do livro: o recorte começa na imagem da capa', async () => {
  const dados = novaPastaDeDados()
  mkdirSync(join(dados, 'origem'), { recursive: true })
  const pdf = join(dados, 'origem', 'capa-com-margem.pdf')
  copyFileSync(join(__dirname, '../fixtures/pdf/capa-com-margem.pdf'), pdf)
  const { app, janela } = await abrirApp(dados)
  await importar(app, janela, pdf)

  const dialogo = await trocarCapa(janela, 'Capa com Margem')
  const paginas = dialogo.getByRole('list', { name: 'Páginas do livro' })
  await paginas.getByRole('button', { name: 'Página 1' }).click()
  const recorte = dialogo.getByRole('group', { name: /Área do recorte/ })
  // A imagem fica em x = 60 de 420 (14,3%), com 300 de largura (71,4%).
  await expect(recorte).toHaveAttribute('style', /left: 14\.28\d*%.*width: 71\.42\d*%/)
  await dialogo.getByRole('button', { name: 'Voltar' }).click()

  // A página 2 (só texto) começa inteira; usar troca a capa pela página.
  await paginas.getByRole('button', { name: 'Página 2' }).click()
  await expect(recorte).toHaveAttribute('style', /left: 0%.*width: 100%/)
  const antes = await capaNaEstante(janela).getAttribute('src')
  await dialogo.getByRole('button', { name: 'Usar como capa' }).click()
  await expect(dialogo).toBeHidden()
  await expect(capaNaEstante(janela)).not.toHaveAttribute('src', antes!)
  await expect.poll(() => proporcao(capaNaEstante(janela))).toBeCloseTo(595 / 420, 1)
  await app.close()
})

test('trocar a capa por uma imagem do computador, recortada pelo teclado', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)
  await importar(app, janela, livros.domCasmurro)

  const dialogo = await trocarCapa(janela, 'Dom Casmurro')
  // O EPUB de teste tem capa em SVG, que não serve para recortar.
  await expect(dialogo).toContainText('Este livro não tem imagens que sirvam de capa.')
  await dialogo.getByRole('radio', { name: 'Do computador' }).check()
  await dialogo.locator('input[type="file"]').setInputFiles(VERMELHA)
  const recorte = dialogo.getByRole('group', { name: /Área do recorte/ })
  await expect(recorte).toHaveAttribute('aria-label', /300 por 450 pixels/)
  await recorte.focus()
  // Shift + seta para a esquerda tira 1% da largura a cada toque: 300 viram 270.
  for (let i = 0; i < 10; i++) await janela.keyboard.press('Shift+ArrowLeft')
  await expect(recorte).toHaveAttribute('aria-label', /270 por 450 pixels/)
  await dialogo.getByRole('button', { name: 'Usar como capa' }).click()
  await expect(dialogo).toBeHidden()
  await expect.poll(() => tamanho(capaNaEstante(janela))).toEqual({ largura: 270, altura: 450 })
  await app.close()
})

test('um EPUB com imagem de capa oferece a imagem de dentro do livro', async () => {
  const dados = novaPastaDeDados()
  mkdirSync(join(dados, 'origem'), { recursive: true })
  const caminho = join(dados, 'origem', 'dom-casmurro-com-capa.epub')
  writeFileSync(caminho, epubDomCasmurroComCapa(readFileSync(VERMELHA)))
  const { app, janela } = await abrirApp(dados)
  await importar(app, janela, caminho)

  const dialogo = await trocarCapa(janela, 'Dom Casmurro')
  await dialogo.getByRole('list', { name: 'Imagens do livro' }).getByRole('button', { name: 'Imagem 1' }).click()
  await expect(dialogo.getByRole('group', { name: /Área do recorte: 300 por 450 pixels/ })).toBeVisible()
  await app.close()
})

test('trocar a capa por uma das capas do catálogo', async () => {
  const catalogo = await abrirCatalogoFalso()
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados, { catalogo: catalogo.url })
  await importar(app, janela, livros.domCasmurro)
  // Espera o reconhecimento da obra (a capa SVG do livro continua até a pessoa trocar).
  await expect.poll(() => catalogo.pedidos.some(p => p.startsWith('/works/OL1003040W.json'))).toBe(true)

  const dialogo = await trocarCapa(janela, 'Dom Casmurro')
  await dialogo.getByRole('radio', { name: 'Do catálogo' }).check()
  const capas = dialogo.getByRole('list', { name: 'Capas do catálogo' })
  await capas.getByRole('button', { name: /Penguin-Companhia · 2016/ }).first().click()
  const antes = await capaNaEstante(janela).getAttribute('src')
  await dialogo.getByRole('button', { name: 'Usar esta capa' }).click()
  await expect(dialogo).toBeHidden()
  await expect(capaNaEstante(janela)).not.toHaveAttribute('src', antes!)
  expect(catalogo.pedidos.some(p => /^\/b\/id\/\d+-M\.jpg/.test(p))).toBe(true)
  await app.close()
  await catalogo.fechar()
})
