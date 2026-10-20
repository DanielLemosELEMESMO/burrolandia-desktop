import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, novaPastaDeDados } from './app'

test('adiciona um EPUB, lê e reabre exatamente onde parou', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))

  const { app, janela } = await abrirApp(dados)
  await expect(janela.getByText('Sua biblioteca está vazia')).toBeVisible()

  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  const fim = janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' })
  await expect(fim).toBeVisible()
  await expect(fim.getByText('Dom Casmurro')).toBeVisible()
  await fim.getByRole('button', { name: 'Começar a ler' }).click()

  const leitor = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  const inicio = await leitor.getAttribute('data-cfi')

  for (let i = 0; i < 4; i++) {
    await janela.keyboard.press('ArrowRight')
    await janela.waitForTimeout(250)
  }
  await expect(leitor).not.toHaveAttribute('data-cfi', inicio!)
  const parou = await leitor.getAttribute('data-cfi')
  await janela.waitForTimeout(600) // deixa o salvamento automático acontecer
  await app.close()

  const segunda = await abrirApp(dados)
  const leitorDeNovo = segunda.janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitorDeNovo).toHaveAttribute('data-cfi', parou!)
  await segunda.app.close()
})

test('a biblioteca mostra o livro em "Continuar lendo" depois da leitura', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)

  await escolherArquivo(app, livros.memorias)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await janela.getByRole('button', { name: 'Voltar à biblioteca' }).click()
  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await janela
    .getByRole('dialog', { name: 'Seu livro está na biblioteca' })
    .getByRole('button', { name: 'Começar a ler' })
    .click()
  await expect(janela.getByRole('main', { name: 'Lendo Dom Casmurro' })).toHaveAttribute('data-cfi', /^epubcfi/)

  await janela.getByRole('button', { name: 'Voltar à biblioteca' }).click()
  const continuar = janela.getByRole('region', { name: 'Continuar lendo' })
  await expect(continuar.getByRole('heading', { name: 'Dom Casmurro' })).toBeVisible()
  await expect(janela.getByRole('list', { name: 'Sua biblioteca' }).getByRole('listitem')).toHaveCount(2)
  await app.close()
})

test('recusa um arquivo que não é livro e explica o porquê', async () => {
  const dados = novaPastaDeDados()
  const texto = join(dados, 'anotacoes.txt')
  writeFileSync(texto, 'só umas anotações')
  const { app, janela } = await abrirApp(dados)

  await escolherArquivo(app, texto)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  const aviso = janela.getByRole('alertdialog', { name: 'Não deu para adicionar este arquivo' })
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('EPUB e PDF')
  await aviso.getByRole('button', { name: 'Entendi' }).click()
  await expect(janela.getByText('Sua biblioteca está vazia')).toBeVisible()
  await app.close()
})

test('remove um livro depois de confirmar', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)

  await escolherArquivo(app, livros.memorias)
  await janela.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await janela.getByRole('button', { name: 'Voltar à biblioteca' }).click()

  await janela.getByRole('button', { name: 'Mais ações para Memórias Póstumas de Brás Cubas' }).click()
  await janela.getByRole('menuitem', { name: 'Remover da biblioteca' }).click()
  const confirmar = janela.getByRole('alertdialog', { name: 'Remover este livro?' })
  await confirmar.getByRole('button', { name: 'Remover' }).click()
  await expect(janela.getByText('Sua biblioteca está vazia')).toBeVisible()
  await app.close()
})

test('o tema escolhido vale para o app inteiro e fica guardado', async () => {
  const dados = novaPastaDeDados()
  const { app, janela } = await abrirApp(dados)

  await janela.getByRole('button', { name: 'Ajustes de leitura' }).click()
  await janela.getByRole('radio', { name: 'Noite' }).check()
  await expect(janela.locator('html')).toHaveAttribute('data-tema', 'noite')
  await app.close()

  const segunda = await abrirApp(dados)
  await expect(segunda.janela.locator('html')).toHaveAttribute('data-tema', 'noite')
  await segunda.app.close()
})
