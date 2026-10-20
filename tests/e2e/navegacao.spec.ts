import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, novaPastaDeDados } from './app'

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

test('o dock recolhe, volta e lembra como você deixou', async () => {
  const dados = novaPastaDeDados()
  const { app, janela } = await abrirApp(dados)
  const dock = janela.getByRole('navigation', { name: 'Navegação principal' })
  await expect(dock).toBeVisible()

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
