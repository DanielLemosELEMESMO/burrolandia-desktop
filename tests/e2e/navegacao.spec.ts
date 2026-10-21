import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, irPara, novaPastaDeDados } from './app'

test('a biblioteca busca, filtra pelo formato e alterna entre grade e lista', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const pdf = join(dados, 'origem', 'notas-duas-colunas.pdf')
  copyFileSync(join(__dirname, '../fixtures/pdf/notas-duas-colunas.pdf'), pdf)
  const { app, janela } = await abrirApp(dados)

  for (const arquivo of [livros.memorias, livros.domCasmurro, pdf]) {
    await escolherArquivo(app, arquivo)
    await janela.getByRole('button', { name: 'Importar livro' }).first().click()
    await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Agora não' }).click()
  }

  // Buscar, no dock, leva à biblioteca com o cursor no campo de busca.
  await janela.getByRole('button', { name: 'Buscar na biblioteca' }).click()
  const busca = janela.getByRole('searchbox', { name: 'Buscar na biblioteca' })
  await expect(busca).toBeFocused()
  const estante = janela.getByRole('list', { name: 'Sua biblioteca' })
  await expect(estante.getByRole('listitem')).toHaveCount(3)

  await busca.fill('memorias bras')
  await expect(estante.getByRole('listitem')).toHaveCount(1)
  await expect(estante).toContainText('Memórias Póstumas de Brás Cubas')
  await busca.fill('')

  await janela.getByRole('radio', { name: 'PDF' }).check()
  await expect(estante.getByRole('listitem')).toHaveCount(1)
  await janela.getByRole('radio', { name: 'Todos' }).check()

  await janela.getByRole('button', { name: 'Ver em lista' }).click()
  await expect(janela.getByRole('button', { name: 'Ver em lista' })).toHaveAttribute('aria-pressed', 'true')
  await expect(estante).toHaveClass(/lista/)
  await expect(estante.getByText('Neste computador')).toHaveCount(3)
  await app.close()
})

/** O centro horizontal de um elemento na tela. */
async function centro(elemento: Locator) {
  const caixa = (await elemento.boundingBox())!
  return caixa.x + caixa.width / 2
}

test('o dock é simétrico: Importar no meio, dois de cada lado, e o recolher fica de fora', async () => {
  const { app, janela } = await abrirApp(novaPastaDeDados())
  const dock = janela.getByRole('navigation', { name: 'Navegação principal' })
  await expect(dock.getByRole('button')).toHaveText([/Início/, /Biblioteca/, /Importar/, /Buscar/, /Ajustes/])
  expect(Math.abs((await centro(dock.getByRole('button', { name: 'Importar livro' }))) - (await centro(dock)))).toBeLessThan(1)

  // O recolher não é um item do dock: flutua ao lado e só aparece com o mouse perto (ou com o foco).
  const recolher = janela.getByRole('button', { name: 'Recolher a navegação' })
  await expect(dock.getByRole('button', { name: 'Recolher a navegação' })).toHaveCount(0)
  await janela.mouse.move(20, 20)
  await expect(recolher).toHaveCSS('opacity', '0')
  const caixa = (await dock.boundingBox())!
  await janela.mouse.move(caixa.x + caixa.width + 24, caixa.y + caixa.height / 2)
  await expect(recolher).toHaveCSS('opacity', '1')
  await janela.mouse.move(20, 20)
  await expect(recolher).toHaveCSS('opacity', '0')
  await dock.getByRole('button', { name: 'Ajustes de leitura' }).focus()
  await janela.keyboard.press('Tab')
  await expect(recolher).toBeFocused()
  await expect(recolher).toHaveCSS('opacity', '1')
  await app.close()
})

test('o dock recolhe, volta e lembra como você deixou', async () => {
  const dados = novaPastaDeDados()
  const { app, janela } = await abrirApp(dados)
  const dock = janela.getByRole('navigation', { name: 'Navegação principal' })
  await expect(dock).toBeVisible()

  // O botão de recolher aparece quando o mouse chega perto do dock.
  const caixa = (await dock.boundingBox())!
  await janela.mouse.move(caixa.x + caixa.width + 24, caixa.y + caixa.height / 2)
  await janela.getByRole('button', { name: 'Recolher a navegação' }).click()
  await expect(dock).toHaveCount(0)
  await expect(janela.getByRole('button', { name: 'Mostrar a navegação' })).toBeFocused()
  await app.close()

  const segunda = await abrirApp(dados)
  await expect(segunda.janela.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0)
  await segunda.janela.getByRole('button', { name: 'Mostrar a navegação' }).click()
  await expect(segunda.janela.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
  await segunda.app.close()
})

test('na lista, "Remover" com o mouse remove o livro escolhido, não o de baixo', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)
  for (const arquivo of [livros.memorias, livros.domCasmurro]) {
    await escolherArquivo(app, arquivo)
    await janela.getByRole('button', { name: 'Importar livro' }).first().click()
    await janela.getByRole('button', { name: 'Agora não' }).click()
  }
  await irPara(janela, 'Biblioteca')
  await janela.getByRole('button', { name: 'Ver em lista' }).click()
  await janela.getByRole('combobox').selectOption('titulo')
  const estante = janela.getByRole('list', { name: 'Sua biblioteca' })
  await expect(estante.getByRole('listitem').first()).toContainText('Dom Casmurro')

  // O clique do Playwright é de mouse, e ele recusa clicar se outro elemento estiver por cima.
  await janela.getByRole('button', { name: 'Mais ações para Dom Casmurro' }).click()
  await janela.getByRole('menuitem', { name: 'Remover da biblioteca' }).click()
  await janela.getByRole('alertdialog', { name: 'Remover este livro?' }).getByRole('button', { name: 'Remover' }).click()
  await expect(estante.getByRole('listitem')).toHaveCount(1)
  await expect(estante).toContainText('Memórias Póstumas de Brás Cubas')
  await expect(janela.getByRole('main', { name: 'Biblioteca' })).toBeVisible()
  await app.close()
})
