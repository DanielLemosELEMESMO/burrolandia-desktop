import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, irPara, novaPastaDeDados } from './app'
import { abrirCatalogoFalso } from './catalogo-falso'

async function abrirSobre(janela: Page, titulo: string) {
  await irPara(janela, 'Biblioteca')
  await janela.getByRole('button', { name: `Mais ações para ${titulo}` }).click()
  await janela.getByRole('menuitem', { name: 'Sobre este livro' }).click()
  return janela.getByRole('dialog', { name: 'Sobre este livro' })
}

test('reconhece a obra pelo título e pelo autor, e deixa escolher a sua edição', async () => {
  const catalogo = await abrirCatalogoFalso()
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados, { catalogo: catalogo.url })

  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('button', { name: 'Agora não' }).click()

  const sobre = await abrirSobre(janela, 'Dom Casmurro')
  const obra = sobre.getByRole('region', { name: 'A obra' })
  await expect(obra).toContainText('90 edições no catálogo')
  await expect(obra).toContainText('primeira edição em 1900')
  await expect(obra).toContainText('Reconhecida pelo título e pelo autor.')
  await expect(sobre.getByRole('region', { name: 'Sua edição' })).toContainText('Ainda não sei qual é a sua edição.')

  await sobre.getByRole('button', { name: 'Escolher a edição' }).click()
  const edicoes = sobre.getByRole('list', { name: 'Edições' })
  await expect(edicoes.getByRole('listitem').first()).toContainText('português')
  await edicoes.getByRole('button', { name: /Penguin-Companhia.*9788582850350/ }).click()
  const suaEdicao = sobre.getByRole('region', { name: 'Sua edição' })
  await expect(suaEdicao).toContainText('Penguin-Companhia')
  await expect(suaEdicao).toContainText('2016 · 400 páginas · português · ISBN 9788582850350')

  // A capa do catálogo aparece para ver antes; usar troca a capa do livro.
  await sobre.getByRole('button', { name: 'Usar esta capa' }).click()
  await expect(sobre.locator('.sobre-livro img.capa')).toHaveAttribute('src', /capa\.jpg/)
  await app.close()
  await catalogo.fechar()
})

test('quando não acha, dá para procurar a obra à mão, inclusive pelo título traduzido', async () => {
  const catalogo = await abrirCatalogoFalso()
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados, { catalogo: catalogo.url })

  await escolherArquivo(app, livros.memorias)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('button', { name: 'Agora não' }).click()

  const sobre = await abrirSobre(janela, 'Memórias Póstumas de Brás Cubas')
  await expect(sobre).toContainText('Não achei esta obra no Open Library.')
  await sobre.getByRole('button', { name: 'Procurar a obra' }).click()
  await sobre.getByRole('searchbox', { name: 'Título e autor' }).fill('A Origem das Espécies Darwin')
  await sobre.getByRole('button', { name: 'Procurar' }).click()
  const achadas = sobre.getByRole('list', { name: 'Obras encontradas' })
  await expect(achadas.getByRole('listitem').first()).toContainText('também como “Origem das espécies”')
  await achadas.getByRole('button', { name: /On the origin of species/ }).click()
  await expect(sobre.getByRole('region', { name: 'A obra' })).toContainText('Você escolheu esta obra.')

  await sobre.getByRole('button', { name: 'Não é esta obra' }).click()
  await sobre.getByRole('button', { name: 'Procurar' }).click()
  await sobre.getByRole('button', { name: 'Não é nenhuma destas' }).click()
  await expect(sobre).toContainText('Você disse que nenhuma das sugestões era este livro.')
  await app.close()
  await catalogo.fechar()
})

test('sem conexão com o catálogo, o painel explica e o livro fica para depois', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  // Um endereço onde ninguém responde.
  const { app, janela } = await abrirApp(dados, { catalogo: 'http://127.0.0.1:9' })

  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('button', { name: 'Agora não' }).click()

  const sobre = await abrirSobre(janela, 'Dom Casmurro')
  await expect(sobre.getByRole('alert')).toContainText('Não deu para falar com o Open Library agora.')
  await expect(sobre.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  await app.close()
})
