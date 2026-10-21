import { describe, expect, it } from 'vitest'
import { emPixels, INTEIRO, limitar, mover, pelaTecla, puxar, type Retangulo } from '@nucleo/recorte'

const perto = (r: Retangulo, esperado: Retangulo) => {
  for (const chave of ['x', 'y', 'largura', 'altura'] as const) expect(r[chave]).toBeCloseTo(esperado[chave], 6)
}

describe('recorte', () => {
  it('fica sempre dentro da imagem e nunca menor que o mínimo', () => {
    perto(limitar({ x: -0.2, y: 0.9, largura: 0.5, altura: 0.5 }), { x: 0, y: 0.5, largura: 0.5, altura: 0.5 })
    perto(limitar({ x: 0.3, y: 0.3, largura: 0.001, altura: 2 }), { x: 0.3, y: 0, largura: 0.05, altura: 1 })
  })

  it('mover leva o retângulo inteiro e para na borda', () => {
    perto(mover({ x: 0.1, y: 0.1, largura: 0.5, altura: 0.5 }, 0.2, -0.05), { x: 0.3, y: 0.05, largura: 0.5, altura: 0.5 })
    perto(mover({ x: 0.1, y: 0.1, largura: 0.5, altura: 0.5 }, 0.9, 0), { x: 0.5, y: 0.1, largura: 0.5, altura: 0.5 })
  })

  it('puxar uma alça move só as bordas dela', () => {
    const r = { x: 0.2, y: 0.2, largura: 0.6, altura: 0.6 }
    perto(puxar(r, 'se', 0.1, 0.1), { x: 0.2, y: 0.2, largura: 0.7, altura: 0.7 })
    perto(puxar(r, 'no', -0.1, 0.1), { x: 0.1, y: 0.3, largura: 0.7, altura: 0.5 })
    perto(puxar(r, 'l', 0.5, 0.3), { x: 0.2, y: 0.2, largura: 0.8, altura: 0.6 })
    perto(puxar(r, 'n', 0.3, -0.5), { x: 0.2, y: 0, largura: 0.6, altura: 0.8 })
  })

  it('puxar além da borda oposta para no tamanho mínimo, sem virar do avesso', () => {
    perto(puxar({ x: 0.2, y: 0.2, largura: 0.6, altura: 0.6 }, 'o', 0.9, 0), { x: 0.75, y: 0.2, largura: 0.05, altura: 0.6 })
  })

  it('pelo teclado: setas movem, Shift + setas mudam o tamanho', () => {
    const r = { x: 0.2, y: 0.2, largura: 0.5, altura: 0.5 }
    perto(pelaTecla(r, 'ArrowRight', false)!, { x: 0.21, y: 0.2, largura: 0.5, altura: 0.5 })
    perto(pelaTecla(r, 'ArrowUp', false)!, { x: 0.2, y: 0.19, largura: 0.5, altura: 0.5 })
    perto(pelaTecla(r, 'ArrowRight', true)!, { x: 0.2, y: 0.2, largura: 0.51, altura: 0.5 })
    perto(pelaTecla(r, 'ArrowUp', true)!, { x: 0.2, y: 0.2, largura: 0.5, altura: 0.49 })
    expect(pelaTecla(r, 'Enter', false)).toBeNull()
  })

  it('vira pixels inteiros da imagem de verdade', () => {
    expect(emPixels({ x: 0.1, y: 0.25, largura: 0.5, altura: 0.5 }, 300, 450)).toEqual({ x: 30, y: 113, largura: 150, altura: 225 })
    expect(emPixels(INTEIRO, 300, 450)).toEqual({ x: 0, y: 0, largura: 300, altura: 450 })
  })
})
