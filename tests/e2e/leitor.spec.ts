import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import type { ApiBurrolandia } from '../../src/preload/api'
import { abrirApp, escolherArquivo, novaPastaDeDados, posicaoParada } from './app'

/** As faixas do leitor somem enquanto você lê; mexer o mouse traz de volta. */
async function mostrarFaixas(janela: Page) {
  await janela.mouse.move(400, 300)
  await janela.mouse.move(420, 320)
}

test('com o diálogo de importação aberto por cima do livro, as setas não viram a página; "Começar a ler" troca de livro', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)
  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  const leitor = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  const antes = await leitor.getAttribute('data-cfi')

  // Importa outro livro sem sair do leitor, pelo dock da faixa de baixo.
  await escolherArquivo(app, livros.memorias)
  await mostrarFaixas(janela)
  await janela.getByRole('button', { name: 'Importar livro' }).click()
  const fim = janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' })
  await expect(fim).toBeVisible()
  for (let i = 0; i < 3; i++) await janela.keyboard.press('ArrowRight')
  await janela.waitForTimeout(500)
  await expect(leitor).toHaveAttribute('data-cfi', antes!)

  await fim.getByRole('button', { name: 'Começar a ler' }).click()
  await expect(janela.getByRole('main', { name: 'Lendo Memórias Póstumas de Brás Cubas' })).toHaveAttribute('data-cfi', /^epubcfi/)
  await expect(janela.getByRole('button', { name: 'Voltar ao início' })).toBeAttached()
  await app.close()
})

test('sair do leitor pelo dock grava a posição na hora, sem esperar o salvamento automático', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)
  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  const leitor = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  // Ao abrir, a posição ainda se acerta na primeira página; virar antes disso confunde as duas mudanças.
  const inicio = await posicaoParada(janela, leitor)

  await janela.keyboard.press('ArrowRight')
  await expect(leitor).not.toHaveAttribute('data-cfi', inicio!)
  const parou = await posicaoParada(janela, leitor)
  await mostrarFaixas(janela)
  await janela.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(janela.getByRole('main', { name: 'Biblioteca' })).toBeVisible()

  const salva = await janela.evaluate(async () => {
    const { burrolandia } = globalThis as unknown as { burrolandia: ApiBurrolandia }
    const [livro] = await burrolandia.biblioteca.listar()
    return livro.posicao?.locations.cfi
  })
  expect(salva).toBe(parou)
  await app.close()
})

test('soltar um arquivo em cima do texto do livro também adiciona (o arrasto sai de dentro do livro)', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)
  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  await expect(janela.getByRole('main', { name: 'Lendo Dom Casmurro' })).toHaveAttribute('data-cfi', /^epubcfi/)

  // O texto mora num iframe do foliate. Um arrasto sintético lá dentro, com um arquivo sem caminho
  // no disco (como os que vêm de outros apps): a janela precisa ver o arrasto e explicar o que fazer.
  const livro = janela.frames().find(quadro => quadro.url().startsWith('blob:'))!
  const arrastar = (tipo: string) =>
    livro.evaluate(tipoDoEvento => {
      // Os testes não têm os tipos do DOM; dentro do iframe, eles existem.
      const { DataTransfer, File, DragEvent, document } = globalThis as unknown as {
        DataTransfer: new () => { items: { add(arquivo: unknown): void } }
        File: new (partes: string[], nome: string, opcoes: { type: string }) => unknown
        DragEvent: new (tipo: string, opcoes: { dataTransfer: unknown; bubbles: boolean; cancelable: boolean }) => unknown
        document: { body: { dispatchEvent(evento: unknown): boolean } }
      }
      const dados = new DataTransfer()
      dados.items.add(new File(['não é um livro de verdade'], 'solto.epub', { type: 'application/epub+zip' }))
      document.body.dispatchEvent(new DragEvent(tipoDoEvento, { dataTransfer: dados, bubbles: true, cancelable: true }))
    }, tipo)
  await arrastar('dragenter')
  await expect(janela.getByText('Solte o arquivo para adicioná-lo à sua biblioteca')).toBeVisible()
  await arrastar('drop')
  await expect(janela.getByText('Solte o arquivo para adicioná-lo à sua biblioteca')).toHaveCount(0)
  const aviso = janela.getByRole('alertdialog', { name: 'Não deu para adicionar este arquivo' })
  await expect(aviso).toContainText('Salve-o numa pasta')
  await app.close()
})
