import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { epubDomCasmurroComCapa, epubOrigemDasEspecies, gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, irPara, novaPastaDeDados } from './app'
import { abrirCatalogoFalso } from './catalogo-falso'

async function importar(app: ElectronApplication, janela: Page, caminho: string) {
  await escolherArquivo(app, caminho)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('button', { name: 'Agora não' }).click()
}

async function abrirSobre(janela: Page, titulo: string) {
  await irPara(janela, 'Biblioteca')
  await janela.getByRole('button', { name: `Mais ações para ${titulo}` }).click()
  await janela.getByRole('menuitem', { name: 'Sobre este livro' }).click()
  return janela.getByRole('dialog', { name: 'Sobre este livro' })
}

/** A largura da imagem que a tela mostra de fato (0 enquanto não carregou). */
const larguraNaTela = (imagem: Locator) => imagem.evaluate(img => (img as unknown as { naturalWidth: number }).naturalWidth)

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
  await expect(sobre.locator('.sobre-livro img.capa')).toHaveAttribute('src', /capa-[0-9a-f]{12}\.jpg/)
  await app.close()
  await catalogo.fechar()
})

test('usar a capa do catálogo troca a imagem na tela, não só o arquivo', async () => {
  const catalogo = await abrirCatalogoFalso()
  const dados = novaPastaDeDados()
  mkdirSync(join(dados, 'origem'), { recursive: true })
  const caminho = join(dados, 'origem', 'dom-casmurro-com-capa.epub')
  writeFileSync(caminho, epubDomCasmurroComCapa(readFileSync(join(__dirname, '../fixtures/capa-vermelha.jpg'))))
  const { app, janela } = await abrirApp(dados, { catalogo: catalogo.url })
  await importar(app, janela, caminho)

  const sobre = await abrirSobre(janela, 'Dom Casmurro')
  const capa = sobre.locator('.sobre-livro img.capa')
  // A capa do arquivo tem 300 px de largura; a do catálogo, 200.
  await expect.poll(() => larguraNaTela(capa)).toBe(300)
  await sobre.getByRole('button', { name: 'Usar esta capa' }).click()
  await expect.poll(() => larguraNaTela(capa)).toBe(200)
  // Agora é a capa do livro: o painel não oferece de novo.
  await expect(sobre.getByRole('button', { name: 'Usar esta capa' })).toHaveCount(0)
  await sobre.getByRole('button', { name: 'Fechar' }).click()
  await expect.poll(() => larguraNaTela(janela.getByRole('main').locator('img.capa').first())).toBe(200)
  await app.close()
  await catalogo.fechar()
})

test('"Tentar de novo" repete só o que falhou, sem desfazer o que a pessoa escolheu', async () => {
  const catalogo = await abrirCatalogoFalso()
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados, { catalogo: catalogo.url })
  await importar(app, janela, livros.domCasmurro)

  const sobre = await abrirSobre(janela, 'Dom Casmurro')
  const obra = sobre.getByRole('region', { name: 'A obra' })
  const suaEdicao = sobre.getByRole('region', { name: 'Sua edição' })
  await sobre.getByRole('button', { name: 'Escolher a edição' }).click()
  await sobre.getByRole('list', { name: 'Edições' }).getByRole('button', { name: /Penguin-Companhia.*9788582850350/ }).click()
  await expect(obra).toContainText('Você escolheu esta obra.')

  // O catálogo cai ao trocar a edição: "Tentar de novo" busca as edições outra vez.
  catalogo.estado.foraDoAr = true
  await suaEdicao.getByRole('button', { name: 'Trocar a edição' }).click()
  await expect(sobre.getByRole('alert')).toContainText('Não deu para falar com o Open Library agora.')
  catalogo.estado.foraDoAr = false
  await sobre.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(sobre.getByRole('list', { name: 'Edições' })).toBeVisible()
  await expect(sobre.getByRole('alert')).toHaveCount(0)

  // Caiu de novo; voltar leva o aviso junto, e a escolha continua a mesma.
  catalogo.estado.foraDoAr = true
  await sobre.getByRole('button', { name: 'Voltar' }).click()
  await suaEdicao.getByRole('button', { name: 'Trocar a edição' }).click()
  await expect(sobre.getByRole('alert')).toBeVisible()
  await sobre.getByRole('button', { name: 'Voltar' }).click()
  await expect(sobre.getByRole('alert')).toHaveCount(0)
  catalogo.estado.foraDoAr = false
  await expect(obra).toContainText('Você escolheu esta obra.')
  await expect(suaEdicao).toContainText('Penguin-Companhia')

  // "Não é nenhuma destas", e a busca seguinte cai: tentar de novo refaz a busca e a recusa fica.
  await obra.getByRole('button', { name: 'Não é esta obra' }).click()
  await sobre.getByRole('button', { name: 'Procurar', exact: true }).click()
  await sobre.getByRole('button', { name: 'Não é nenhuma destas' }).click()
  await expect(sobre).toContainText('Você disse que nenhuma das sugestões era este livro.')
  catalogo.estado.foraDoAr = true
  await sobre.getByRole('button', { name: 'Procurar a obra' }).click()
  await sobre.getByRole('button', { name: 'Procurar', exact: true }).click()
  await expect(sobre.getByRole('alert')).toBeVisible()
  catalogo.estado.foraDoAr = false
  await sobre.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(sobre.getByRole('list', { name: 'Obras encontradas' })).toBeVisible()
  await sobre.getByRole('button', { name: 'Voltar' }).click()
  await expect(sobre).toContainText('Você disse que nenhuma das sugestões era este livro.')
  await app.close()
  await catalogo.fechar()
})

test('o painel de um livro não mostra a resposta atrasada de outro', async () => {
  const catalogo = await abrirCatalogoFalso()
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const origem = join(dados, 'origem', 'origem-das-especies.epub')
  writeFileSync(origem, epubOrigemDasEspecies())
  const { app, janela } = await abrirApp(dados, { catalogo: catalogo.url })
  await importar(app, janela, livros.domCasmurro)
  let sobre = await abrirSobre(janela, 'Dom Casmurro')
  await expect(sobre.getByRole('region', { name: 'A obra' })).toContainText('90 edições no catálogo')
  await sobre.getByRole('button', { name: 'Fechar' }).click()

  // A Origem das Espécies chega com o catálogo lento; o painel dela fecha com a busca no meio.
  catalogo.estado.demoraDaBusca = 3000
  await importar(app, janela, origem)
  sobre = await abrirSobre(janela, 'A Origem das Espécies')
  await expect(sobre).toContainText('Procurando a obra no Open Library')
  await sobre.getByRole('button', { name: 'Fechar' }).click()

  sobre = await abrirSobre(janela, 'Dom Casmurro')
  await expect(sobre.locator('.sobre-livro strong')).toHaveText('Dom Casmurro')
  await expect(sobre).not.toContainText('Procurando')
  // A busca da Origem termina (o app pede os detalhes da obra achada) com este painel aberto.
  await expect.poll(() => catalogo.pedidos.some(p => p.startsWith('/works/OL515051W')), { timeout: 15_000 }).toBe(true)
  await janela.waitForTimeout(1000)
  await expect(sobre.locator('.sobre-livro strong')).toHaveText('Dom Casmurro')
  await expect(sobre.getByRole('region', { name: 'A obra' })).toContainText('90 edições no catálogo')
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
