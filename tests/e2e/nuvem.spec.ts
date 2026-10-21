// A conta e a nuvem de ponta a ponta: dois aparelhos (duas pastas de dados) na mesma conta, numa
// nuvem de mentira com as regras do banco de verdade (nuvem-falsa.ts).

import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ApiBurrolandia } from '../../src/preload/api'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, irPara, novaPastaDeDados, posicaoParada } from './app'
import { abrirNuvemFalsa } from './nuvem-falsa'

const EMAIL = 'ana@burrolandia.test'
const SENHA = 'senha-de-teste-123'

/** Entra (ou cria a conta) pelo botão do alto da tela e espera a primeira sincronização. */
async function entrar(janela: Page, { criar = false, senha = SENHA } = {}) {
  await janela.getByRole('banner').getByRole('button', { name: 'Entrar', exact: true }).click()
  const dialogo = janela.getByRole('dialog', { name: 'Sua conta' })
  if (criar) await dialogo.getByRole('radio', { name: 'Criar conta' }).check()
  await dialogo.getByLabel('E-mail').fill(EMAIL)
  await dialogo.getByLabel('Senha').fill(senha)
  await dialogo.getByRole('button', { name: criar ? 'Criar conta' : 'Entrar' }).click()
  return dialogo
}

async function esperarSincronizar(janela: Page) {
  const dialogo = janela.getByRole('dialog', { name: 'Sua conta' })
  await expect(dialogo.getByText(EMAIL)).toBeVisible()
  await expect(dialogo.getByRole('status')).toHaveText(/Tudo sincronizado/, { timeout: 30_000 })
}

/** Abre "Sua conta", pede para sincronizar agora e espera terminar. */
async function sincronizarAgora(janela: Page) {
  await janela.getByRole('button', { name: /^Sua conta/ }).click()
  const dialogo = janela.getByRole('dialog', { name: 'Sua conta' })
  await dialogo.getByRole('button', { name: 'Sincronizar agora' }).click()
  await esperarSincronizar(janela)
  await janela.keyboard.press('Escape')
}

/** A posição salva no banco do aparelho (a que sobe para a nuvem). */
const posicaoSalva = (janela: Page) =>
  janela.evaluate(async () => {
    const { burrolandia } = globalThis as unknown as { burrolandia: ApiBurrolandia }
    const [livro] = await burrolandia.biblioteca.listar()
    return livro.posicao?.locations.cfi
  })

/** Vira uma página (para frente ou para trás) e espera a posição nova parar de mudar. */
async function virar(janela: Page, leitor: Locator, tecla: 'ArrowRight' | 'ArrowLeft') {
  const antes = await posicaoParada(janela, leitor)
  await janela.keyboard.press(tecla)
  await expect(leitor).not.toHaveAttribute('data-cfi', antes!)
  return (await posicaoParada(janela, leitor))!
}

/** Sai do leitor pelo dock (as faixas somem enquanto você lê; o mouse traz de volta). */
async function sairDoLeitor(janela: Page) {
  await janela.mouse.move(400, 300)
  await janela.mouse.move(420, 320)
  await irPara(janela, 'Início')
  await expect(janela.getByRole('main', { name: 'Início' })).toBeVisible()
}

test('dois aparelhos: o livro e a página onde você parou vão de um para o outro, e voltam', async () => {
  const nuvem = await abrirNuvemFalsa()
  const dadosA = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dadosA, 'origem'))

  // Aparelho A: importa, lê uma página e cria a conta.
  const a = await abrirApp(dadosA, { nuvem: nuvem.url })
  await escolherArquivo(a.app, livros.domCasmurro)
  await a.janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await a.janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Começar a ler' }).click()
  const leitorA = a.janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitorA).toHaveAttribute('data-cfi', /^epubcfi/)
  const ondeAParou = await virar(a.janela, leitorA, 'ArrowRight')
  await sairDoLeitor(a.janela)
  expect(await posicaoSalva(a.janela)).toBe(ondeAParou)
  await entrar(a.janela, { criar: true })
  await esperarSincronizar(a.janela)
  await a.janela.keyboard.press('Escape')
  await expect(a.janela.getByRole('button', { name: /^Sua conta: ana@burrolandia\.test/ })).toBeVisible()
  await a.app.close()

  // Aparelho B: a senha errada não entra; a certa traz o livro "Na nuvem".
  const dadosB = novaPastaDeDados()
  const b = await abrirApp(dadosB, { nuvem: nuvem.url })
  const dialogoB = await entrar(b.janela, { senha: 'outra-senha-999' })
  await expect(dialogoB.getByRole('alert')).toHaveText('E-mail ou senha não conferem.')
  await dialogoB.getByLabel('Senha').fill(SENHA)
  await dialogoB.getByRole('button', { name: 'Entrar', exact: true }).click()
  await esperarSincronizar(b.janela)
  await b.janela.keyboard.press('Escape')
  await irPara(b.janela, 'Biblioteca')
  const cartao = b.janela.getByRole('main').locator('li.cartao', { hasText: 'Dom Casmurro' })
  await expect(cartao.getByText('Na nuvem')).toBeVisible()
  await expect(b.janela.getByText('1 livro está só na nuvem')).toBeVisible()

  // Abrir baixa o livro e abre na página onde A parou.
  await cartao.locator('.cartao-abrir').click()
  const leitorB = b.janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
  await expect(leitorB).toHaveAttribute('data-cfi', ondeAParou)
  // O livro de teste é curto: B volta uma página.
  const ondeBParou = await virar(b.janela, leitorB, 'ArrowLeft')
  await sairDoLeitor(b.janela)
  expect(await posicaoSalva(b.janela)).toBe(ondeBParou)
  await sincronizarAgora(b.janela)
  await b.app.close()

  // A de novo: "Continuar a leitura" abre onde B parou.
  const a2 = await abrirApp(dadosA, { nuvem: nuvem.url })
  await a2.janela.getByRole('button', { name: 'Continuar a leitura' }).click()
  await expect(a2.janela.getByRole('main', { name: 'Lendo Dom Casmurro' })).toHaveAttribute('data-cfi', ondeBParou)
  await a2.app.close()
  await nuvem.fechar()
})

test('remover num aparelho tira do outro; sair da conta tira os livros que só estavam na nuvem', async () => {
  const nuvem = await abrirNuvemFalsa()
  const dadosA = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dadosA, 'origem'))

  const a = await abrirApp(dadosA, { nuvem: nuvem.url })
  for (const livro of [livros.domCasmurro, livros.memorias]) {
    await escolherArquivo(a.app, livro)
    await a.janela.getByRole('button', { name: 'Importar livro' }).first().click()
    await a.janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Agora não' }).click()
  }
  await entrar(a.janela, { criar: true })
  await esperarSincronizar(a.janela)
  await a.janela.keyboard.press('Escape')

  const dadosB = novaPastaDeDados()
  const b = await abrirApp(dadosB, { nuvem: nuvem.url })
  await entrar(b.janela)
  await esperarSincronizar(b.janela)
  await b.janela.keyboard.press('Escape')
  await irPara(b.janela, 'Biblioteca')
  await expect(b.janela.getByRole('main').locator('li.cartao')).toHaveCount(2)

  // A remove Dom Casmurro; B fica sabendo na próxima sincronização.
  await irPara(a.janela, 'Biblioteca')
  await a.janela.getByRole('button', { name: 'Mais ações para Dom Casmurro' }).click()
  await a.janela.getByRole('menuitem', { name: 'Remover da biblioteca' }).click()
  await a.janela.getByRole('alertdialog', { name: 'Remover este livro?' }).getByRole('button', { name: 'Remover' }).click()
  await sincronizarAgora(a.janela)
  await sincronizarAgora(b.janela)
  await expect(b.janela.getByRole('main').locator('li.cartao')).toHaveCount(1)
  await expect(b.janela.getByRole('main').locator('li.cartao')).toContainText('Memórias Póstumas')

  // B sai da conta: o livro que só estava na nuvem sai de B; em A, nada muda.
  await b.janela.getByRole('button', { name: /^Sua conta/ }).click()
  await b.janela.getByRole('dialog', { name: 'Sua conta' }).getByRole('button', { name: 'Sair da conta' }).click()
  await expect(b.janela.getByRole('banner').getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await b.janela.keyboard.press('Escape')
  await expect(b.janela.getByText('Sua biblioteca está vazia')).toBeVisible()
  await expect(a.janela.getByRole('main').locator('li.cartao')).toHaveCount(1)

  await a.app.close()
  await b.app.close()
  await nuvem.fechar()
})
