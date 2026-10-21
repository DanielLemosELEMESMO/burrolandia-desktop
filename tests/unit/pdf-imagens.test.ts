import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { caixasDasImagens, capaNaPagina, type CodigosDeOperacao } from '@nucleo/pdf/imagens'

// Os códigos do pdf.js (pdfjs-dist, OPS) que a função usa.
const OPS: CodigosDeOperacao = {
  save: 10,
  restore: 11,
  transform: 12,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
}

describe('caixasDasImagens', () => {
  it('acha a caixa de uma imagem desenhada com "q 300 0 0 450 60 80 cm /Im1 Do Q"', () => {
    const caixas = caixasDasImagens([10, 12, 85, 11], [[], [300, 0, 0, 450, 60, 80], ['img_p0_1', 300, 450], []], OPS)
    expect(caixas).toEqual([{ x: 60, y: 80, largura: 300, altura: 450 }])
  })

  it('compõe as transformações e desfaz no restore, inclusive dentro de formulários', () => {
    // Escala 2 na página; um formulário deslocado (10, 10) com uma imagem 50×50; depois, outra 1×1.
    const operacoes = [12, 74, 10, 12, 85, 11, 75, 85]
    const argumentos = [
      [2, 0, 0, 2, 0, 0],
      [
        [1, 0, 0, 1, 10, 10],
        [0, 0, 100, 100],
      ],
      [],
      [50, 0, 0, 50, 0, 0],
      ['a', 50, 50],
      [],
      [],
      ['b', 1, 1],
    ]
    expect(caixasDasImagens(operacoes, argumentos, OPS)).toEqual([
      { x: 20, y: 20, largura: 100, altura: 100 },
      { x: 0, y: 0, largura: 2, altura: 2 },
    ])
  })

  it('imagem girada: a caixa cobre os quatro cantos', () => {
    expect(caixasDasImagens([12, 86], [[0, 200, -100, 0, 150, 50], []], OPS)).toEqual([
      { x: 50, y: 50, largura: 100, altura: 200 },
    ])
  })
})

describe('capaNaPagina', () => {
  const pagina = { x: 0, y: 0, largura: 420, altura: 595 }

  it('a imagem grande dentro da margem branca é a capa', () => {
    expect(capaNaPagina([{ x: 60, y: 80, largura: 300, altura: 450 }], pagina)).toEqual({ x: 60, y: 80, largura: 300, altura: 450 })
  })

  it('a página inteira em imagem (PDF digitalizado) não precisa de recorte', () => {
    expect(capaNaPagina([{ x: 0, y: 0, largura: 420, altura: 595 }], pagina)).toBeNull()
  })

  it('imagem pequena (um logotipo) não é capa', () => {
    expect(capaNaPagina([{ x: 160, y: 500, largura: 100, altura: 60 }], pagina)).toBeNull()
  })

  it('imagem deitada (uma faixa) não é capa', () => {
    expect(capaNaPagina([{ x: 10, y: 200, largura: 400, altura: 160 }], pagina)).toBeNull()
  })

  it('a capa cortada em faixas vira uma só', () => {
    const faixas = [0, 1, 2].map(i => ({ x: 60, y: 80 + i * 150, largura: 300, altura: 150 }))
    expect(capaNaPagina(faixas, pagina)).toEqual({ x: 60, y: 80, largura: 300, altura: 450 })
  })

  it('as faixas juntam em qualquer ordem, e pedacinhos soltos não atrapalham', () => {
    const faixas = [2, 0, 1].map(i => ({ x: 60, y: 80 + i * 150, largura: 300, altura: 150 }))
    const pedacinhos = Array.from({ length: 500 }, (_, i) => ({ x: (i % 20) * 20, y: 560 + (i % 3), largura: 3, altura: 3 }))
    expect(capaNaPagina([...pedacinhos, ...faixas], pagina)).toEqual({ x: 60, y: 80, largura: 300, altura: 450 })
  })

  it('a parte da imagem que sai da página não conta', () => {
    expect(capaNaPagina([{ x: 60, y: 80, largura: 300, altura: 600 }], pagina)).toEqual({ x: 60, y: 80, largura: 300, altura: 515 })
  })

  it('página com origem fora do zero (CropBox deslocada)', () => {
    const deslocada = { x: 100, y: 100, largura: 420, altura: 595 }
    expect(capaNaPagina([{ x: 160, y: 180, largura: 300, altura: 450 }], deslocada)).toEqual({ x: 160, y: 180, largura: 300, altura: 450 })
  })
})

describe('num PDF de verdade, pelo pdf.js', () => {
  it('acha a capa no meio da primeira página e nenhuma nas páginas de texto', async () => {
    const { getDocument, OPS: codigos } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const dados = new Uint8Array(readFileSync(join(__dirname, '../fixtures/pdf/capa-com-margem.pdf')))
    const fontes = join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/')
    const tarefa = getDocument({ data: dados, standardFontDataUrl: fontes })
    const pdf = await tarefa.promise
    const capaDaPagina = async (numero: number) => {
      const pagina = await pdf.getPage(numero)
      const { fnArray, argsArray } = await pagina.getOperatorList()
      const [x1, y1, x2, y2] = pagina.view
      return capaNaPagina(caixasDasImagens(fnArray, argsArray, codigos), { x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 })
    }
    expect(await capaDaPagina(1)).toEqual({ x: 60, y: 80, largura: 300, altura: 450 })
    expect(await capaDaPagina(2)).toBeNull()
    await tarefa.destroy()
  })
})
