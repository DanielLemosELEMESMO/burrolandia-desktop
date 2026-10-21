// O que os testes da nuvem fazem pela tela: entrar, esperar sincronizar, ler e sair do leitor.

import { expect, type Locator, type Page } from '@playwright/test'
import type { ApiBurrolandia } from '../../src/preload/api'
import { irPara, posicaoParada } from './app'

export const EMAIL = 'ana@burrolandia.test'
export const SENHA = 'senha-de-teste-123'

/** Entra (ou cria a conta) pelo botão do alto da tela. Devolve o diálogo da conta. */
export async function entrar(janela: Page, { criar = false, senha = SENHA } = {}) {
  await janela.getByRole('banner').getByRole('button', { name: 'Entrar', exact: true }).click()
  const dialogo = janela.getByRole('dialog', { name: 'Sua conta' })
  if (criar) await dialogo.getByRole('radio', { name: 'Criar conta' }).check()
  await dialogo.getByLabel('E-mail').fill(EMAIL)
  await dialogo.getByLabel('Senha').fill(senha)
  await dialogo.getByRole('button', { name: criar ? 'Criar conta' : 'Entrar' }).click()
  return dialogo
}

export async function esperarSincronizar(janela: Page) {
  const dialogo = janela.getByRole('dialog', { name: 'Sua conta' })
  await expect(dialogo.getByText(EMAIL)).toBeVisible()
  await expect(dialogo.getByRole('status')).toHaveText(/Tudo sincronizado/, { timeout: 30_000 })
}

/** Entra, espera a primeira sincronização e fecha o diálogo. */
export async function entrarESincronizar(janela: Page, opcoes: { criar?: boolean } = {}) {
  await entrar(janela, opcoes)
  await esperarSincronizar(janela)
  await janela.keyboard.press('Escape')
}

/** Abre "Sua conta", pede para sincronizar agora e espera terminar. */
export async function sincronizarAgora(janela: Page) {
  await janela.getByRole('button', { name: /^Sua conta/ }).click()
  const dialogo = janela.getByRole('dialog', { name: 'Sua conta' })
  await dialogo.getByRole('button', { name: 'Sincronizar agora' }).click()
  await esperarSincronizar(janela)
  await janela.keyboard.press('Escape')
}

/** A posição salva no banco do aparelho (a que sobe para a nuvem). */
export const posicaoSalva = (janela: Page) =>
  janela.evaluate(async () => {
    const { burrolandia } = globalThis as unknown as { burrolandia: ApiBurrolandia }
    const [livro] = await burrolandia.biblioteca.listar()
    return livro.posicao?.locations.cfi
  })

/** Vira uma página (para frente ou para trás) e espera a posição nova parar de mudar. */
export async function virar(janela: Page, leitor: Locator, tecla: 'ArrowRight' | 'ArrowLeft') {
  const antes = await posicaoParada(janela, leitor)
  await janela.keyboard.press(tecla)
  await expect(leitor).not.toHaveAttribute('data-cfi', antes!)
  return (await posicaoParada(janela, leitor))!
}

/** Sai do leitor pelo dock (as faixas somem enquanto você lê; o mouse traz de volta). */
export async function sairDoLeitor(janela: Page) {
  await janela.mouse.move(400, 300)
  await janela.mouse.move(420, 320)
  await irPara(janela, 'Início')
  await expect(janela.getByRole('main', { name: 'Início' })).toBeVisible()
}

/** Abre um livro pela biblioteca (baixando, se ele estiver só na nuvem). */
export async function abrirPelaBiblioteca(janela: Page, titulo: string) {
  await irPara(janela, 'Biblioteca')
  await janela.getByRole('main').locator('li.cartao', { hasText: titulo }).locator('.cartao-abrir').click()
  const leitor = janela.getByRole('main', { name: `Lendo ${titulo}` })
  await expect(leitor).toHaveAttribute('data-cfi', /^epubcfi/)
  return leitor
}
