// A posição entre aparelhos quando o livro fica aberto: abrir não é ler. Um aparelho que só abriu o
// livro não passa por cima da leitura feita em outro, e o livro aberto vai para a posição mais nova.

import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { gravarLivrosDeTeste } from '../fixtures/livros'
import { abrirApp, escolherArquivo, novaPastaDeDados, posicaoParada } from './app'
import { abrirPelaBiblioteca, EMAIL, entrarESincronizar, sairDoLeitor, sincronizarAgora, virar } from './conta'
import { abrirNuvemFalsa } from './nuvem-falsa'

/** Aparelho A: importa Dom Casmurro, cria a conta e abre o livro, sem virar nenhuma página. */
async function aparelhoAComOLivroAberto(nuvem: string) {
  const dados = novaPastaDeDados()
  const livros = gravarLivrosDeTeste(join(dados, 'origem'))
  const a = await abrirApp(dados, { nuvem })
  await escolherArquivo(a.app, livros.domCasmurro)
  await a.janela.getByRole('button', { name: 'Importar livro' }).first().click()
  await a.janela.getByRole('dialog', { name: 'Seu livro está na biblioteca' }).getByRole('button', { name: 'Agora não' }).click()
  await entrarESincronizar(a.janela, { criar: true })
  const leitor = await abrirPelaBiblioteca(a.janela, 'Dom Casmurro')
  const onde = (await posicaoParada(a.janela, leitor))!
  return { ...a, dados, leitor, onde }
}

/** Aparelho B: entra, abre o livro (baixa) onde A está, lê duas páginas e sincroniza. */
async function lerMaisEmOutroAparelho(nuvem: string, ondeA: string) {
  const b = await abrirApp(novaPastaDeDados(), { nuvem })
  await entrarESincronizar(b.janela)
  const leitor = await abrirPelaBiblioteca(b.janela, 'Dom Casmurro')
  await expect(leitor).toHaveAttribute('data-cfi', ondeA)
  await virar(b.janela, leitor, 'ArrowRight')
  const ondeB = await virar(b.janela, leitor, 'ArrowRight')
  await sairDoLeitor(b.janela)
  await sincronizarAgora(b.janela)
  await b.app.close()
  return ondeB
}

test('o livro aberto e parado num aparelho não passa por cima da leitura feita em outro', async () => {
  const nuvem = await abrirNuvemFalsa()
  const posicaoNaNuvem = () => nuvem.nuvem.livrosDe(nuvem.nuvem.contas.get(EMAIL)!.conta.id)[0].posicao?.locations.cfi

  const a = await aparelhoAComOLivroAberto(nuvem.url)
  const ondeB = await lerMaisEmOutroAparelho(nuvem.url, a.onde)
  expect(posicaoNaNuvem()).toBe(ondeB)

  // A fecha a janela com o livro aberto, sem ter lido nada: a nuvem continua onde B parou.
  const fechou = new Promise<void>(pronto => a.app.process().once('exit', () => pronto()))
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await fechou
  expect(posicaoNaNuvem()).toBe(ondeB)
  await nuvem.fechar()
})

// A posição de B chega enquanto o livro ainda abre em A (2,5 s: o leitor confere ao ficar pronto) ou
// depois que ele já abriu (6 s: o aviso leva o leitor até ela).
for (const atraso of [2500, 6000]) {
  test(`reabrindo com a rede lenta (${atraso / 1000} s), o livro vai para onde você parou no outro aparelho`, async () => {
    const nuvem = await abrirNuvemFalsa()
    const posicaoNaNuvem = () => nuvem.nuvem.livrosDe(nuvem.nuvem.contas.get(EMAIL)!.conta.id)[0].posicao?.locations.cfi

    // A fecha o app dentro do livro (ele reabre lá).
    const a = await aparelhoAComOLivroAberto(nuvem.url)
    await a.app.close()
    const ondeB = await lerMaisEmOutroAparelho(nuvem.url, a.onde)

    // A reabre numa rede em que "o que mudou" demora: o livro abre e, quando a posição de B chega,
    // vai para ela, sem gravar nada por cima.
    nuvem.lentidao.mudancas = atraso
    const a2 = await abrirApp(a.dados, { nuvem: nuvem.url })
    const leitor = a2.janela.getByRole('main', { name: 'Lendo Dom Casmurro' })
    await expect(leitor).toHaveAttribute('data-cfi', ondeB, { timeout: 30_000 })
    await expect(a2.janela.getByRole('status').filter({ hasText: 'onde você parou no outro aparelho' })).toBeVisible()
    nuvem.lentidao.mudancas = 0
    await a2.janela.waitForTimeout(1000)
    expect(posicaoNaNuvem()).toBe(ondeB)

    // Daqui para a frente, o que A ler vale.
    const ondeA2 = await virar(a2.janela, leitor, 'ArrowRight')
    await sairDoLeitor(a2.janela)
    await sincronizarAgora(a2.janela)
    expect(posicaoNaNuvem()).toBe(ondeA2)
    await a2.app.close()
    await nuvem.fechar()
  })
}
