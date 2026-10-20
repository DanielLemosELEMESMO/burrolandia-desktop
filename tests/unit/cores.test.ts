import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MARCA, TEMAS } from '@nucleo/cores'

const tokens = readFileSync(join(__dirname, '../../src/renderer/src/estilos/tokens.css'), 'utf8')
const valorNoCss = (variavel: string) => tokens.match(new RegExp(`--${variavel}:\\s*(#[0-9a-f]{6});`, 'i'))?.[1]?.toLowerCase()

describe('cores da marca', () => {
  it('o CSS e o código usam os mesmos cinco HEX da marca', () => {
    expect(MARCA).toEqual({ ameixa: '#2f0e2f', creme: '#f6ebdd', ouro: '#d4af7c', lilas: '#b9a7d9', grafite: '#1f1f24' })
    for (const [nome, hex] of Object.entries(MARCA)) expect(valorNoCss(nome), nome).toBe(hex)
  })

  it('a página e o texto de cada tema de leitura batem com o CSS', () => {
    for (const [tema, cores] of Object.entries(TEMAS)) {
      expect(valorNoCss(`${tema}-pagina`), `${tema}-pagina`).toBe(cores.pagina)
      expect(valorNoCss(`${tema}-tinta`), `${tema}-tinta`).toBe(cores.tinta)
    }
  })
})
