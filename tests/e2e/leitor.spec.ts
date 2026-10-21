import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
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

/** O centro horizontal de um elemento na tela. */
async function centro(elemento: Locator) {
  const caixa = (await elemento.boundingBox())!
  return caixa.x + caixa.width / 2
}

test('no leitor, o dock é o mesmo e simétrico: Ajustes de leitura é o último item, e recolhe também', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)
  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  await expect(janela.getByRole('main', { name: 'Lendo Dom Casmurro' })).toHaveAttribute('data-cfi', /^epubcfi/)
  await mostrarFaixas(janela)

  const dock = janela.getByRole('navigation', { name: 'Navegação principal' })
  await expect(dock.getByRole('button')).toHaveText([/Início/, /Biblioteca/, /Importar/, /Buscar/, /Ajustes/])
  expect(Math.abs((await centro(dock.getByRole('button', { name: 'Importar livro' }))) - (await centro(dock)))).toBeLessThan(1)
  // O Aa saiu do topo: há um só botão de ajustes, o do dock.
  await expect(janela.getByRole('button', { name: 'Ajustes de leitura' })).toHaveCount(1)
  await dock.getByRole('button', { name: 'Ajustes de leitura' }).click()
  await expect(janela.getByRole('dialog', { name: 'Ajustes de leitura' })).toBeVisible()
  await janela.keyboard.press('Escape')

  await mostrarFaixas(janela)
  const caixa = (await dock.boundingBox())!
  await janela.mouse.move(caixa.x + caixa.width + 24, caixa.y + caixa.height / 2)
  await janela.getByRole('button', { name: 'Recolher a navegação' }).click()
  await expect(dock).toHaveCount(0)
  // Recolhido, os ajustes continuam a um clique, ao lado do botão de mostrar.
  await mostrarFaixas(janela)
  await janela.getByRole('button', { name: 'Ajustes de leitura' }).click()
  await expect(janela.getByRole('dialog', { name: 'Ajustes de leitura' })).toBeVisible()
  await janela.keyboard.press('Escape')
  await mostrarFaixas(janela)
  await janela.getByRole('button', { name: 'Mostrar a navegação' }).click()
  await expect(dock).toBeVisible()
  await app.close()
})

test('depois de mostrar o dock pelo mouse, o espaço vira a página (e não recolhe o dock)', async () => {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const { app, janela } = await abrirApp(dados)
  await escolherArquivo(app, livros.domCasmurro)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  const leitor = janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  await posicaoParada(janela, leitor)
  await mostrarFaixas(janela)
  const dock = janela.getByRole('navigation', { name: 'Navegação principal' })
  const caixa = (await dock.boundingBox())!
  await janela.mouse.move(caixa.x + caixa.width + 24, caixa.y + caixa.height / 2)
  await janela.getByRole('button', { name: 'Recolher a navegação' }).click()
  await janela.getByRole('button', { name: 'Mostrar a navegação' }).click()
  await expect(dock).toBeVisible()
  // Lendo de novo: o mouse vai embora e o espaço vira a página.
  await janela.mouse.move(400, 200, { steps: 5 })
  const antes = await leitor.getAttribute('data-cfi')
  await janela.keyboard.press(' ')
  await expect.poll(() => leitor.getAttribute('data-cfi')).not.toBe(antes)
  await expect(janela.getByRole('button', { name: 'Mostrar a navegação' })).toHaveCount(0)
  await app.close()
})

test('na página original, o recolher do dock não cobre o zoom, da janela estreita à larga', async () => {
  const dados = novaPastaDeDados()
  mkdirSync(join(dados, 'origem'), { recursive: true })
  const pdf = join(dados, 'origem', 'capa-com-margem.pdf')
  copyFileSync(join(__dirname, '../fixtures/pdf/capa-com-margem.pdf'), pdf)
  const { app, janela } = await abrirApp(dados)
  await escolherArquivo(app, pdf)
  await janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  await expect(janela.getByRole('radio', { name: 'Página original' })).toBeEnabled({ timeout: 30_000 })
  await janela.getByRole('radio', { name: 'Página original' }).check({ force: true })
  const dock = janela.getByRole('navigation', { name: 'Navegação principal' })
  for (const largura of [720, 800, 880, 1040]) {
    await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 640), largura)
    await expect.poll(() => janela.evaluate(() => (globalThis as unknown as { innerWidth: number }).innerWidth)).toBeLessThanOrEqual(largura)
    const caixa = (await dock.boundingBox())!
    // Com o mouse perto do dock (o recolher aparece), o centro do "−" continua sendo o "−".
    await janela.mouse.move(caixa.x + caixa.width / 2, caixa.y + 5)
    await expect(janela.getByRole('button', { name: 'Recolher a navegação' })).toHaveCSS('opacity', '1')
    const menos = (await janela.getByRole('button', { name: 'Diminuir a página' }).boundingBox())!
    expect(menos.width).toBeGreaterThanOrEqual(40)
    const noCentro = await janela.evaluate(([x, y]) => {
      type No = { closest(seletor: string): { getAttribute(nome: string): string | null } | null }
      const { document } = globalThis as unknown as { document: { elementFromPoint(x: number, y: number): No | null } }
      return document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label')
    }, [menos.x + menos.width / 2, menos.y + menos.height / 2])
    expect(noCentro, `largura ${largura}`).toBe('Diminuir a página')
  }
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
