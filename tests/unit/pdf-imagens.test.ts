import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { caixasDasImagens, capaNaPagina, capaNaVisao, margensEmBranco, type CodigosDeOperacao } from '@nucleo/pdf/imagens'

// As fontes padrão do pdf.js: ele pede "/" no fim, e no Windows o join troca as barras pela invertida.
const PASTA_DAS_FONTES = `${join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts').replace(/\\/g, '/')}/`

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

  it('a matriz do formulário vem como Float32Array no pdf.js 6: vale do mesmo jeito', () => {
    const operacoes = [74, 10, 12, 85, 11, 75]
    const argumentos = [[new Float32Array([0.5, 0, 0, 0.5, 0, 0]), [0, 0, 840, 1190]], [], [600, 0, 0, 900, 120, 160], ['a', 300, 450], [], []]
    expect(caixasDasImagens(operacoes, argumentos, OPS)).toEqual([{ x: 60, y: 80, largura: 300, altura: 450 }])
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

  it('a capa em 100 faixas (mais que qualquer limite de partes) vira uma só, inteira', () => {
    const faixas = Array.from({ length: 100 }, (_, i) => ({ x: 60, y: 80 + i * 4.5, largura: 300, altura: 4.5 }))
    expect(capaNaPagina(faixas, pagina)).toEqual({ x: 60, y: 80, largura: 300, altura: 450 })
  })

  it('a parte da imagem que sai da página não conta', () => {
    expect(capaNaPagina([{ x: 60, y: 80, largura: 300, altura: 600 }], pagina)).toEqual({ x: 60, y: 80, largura: 300, altura: 515 })
  })

  it('página com origem fora do zero (CropBox deslocada)', () => {
    const deslocada = { x: 100, y: 100, largura: 420, altura: 595 }
    expect(capaNaPagina([{ x: 160, y: 180, largura: 300, altura: 450 }], deslocada)).toEqual({ x: 160, y: 180, largura: 300, altura: 450 })
  })
})

describe('margensEmBranco', () => {
  /** Uma página branca de 100 × 140 pixels com a capa (vermelha) em x 20–80, y 30–120. */
  function pagina() {
    const [largura, altura] = [100, 140]
    const data = new Uint8ClampedArray(largura * altura * 4).fill(255)
    const pintar = (x1: number, y1: number, x2: number, y2: number, cor: [number, number, number]) => {
      for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) data.set([...cor, 255], (y * largura + x) * 4)
    }
    pintar(20, 30, 80, 120, [200, 30, 30])
    return { imagem: { data, width: largura, height: altura }, pintar }
  }
  const capa = { x: 0.2, y: 30 / 140, largura: 0.6, altura: 90 / 140 }

  it('só a capa na página: as margens estão em branco', () => {
    expect(margensEmBranco(pagina().imagem, capa)).toBe(true)
  })

  it('uma linha de texto em cima (o aviso do OCR) ainda conta como branco', () => {
    const { imagem, pintar } = pagina()
    pintar(10, 10, 90, 14, [20, 20, 20])
    expect(margensEmBranco(imagem, capa)).toBe(true)
  })

  it('título, subtítulo e autor em cima não são margem branca', () => {
    const { imagem, pintar } = pagina()
    for (const y of [2, 10, 19]) pintar(10, y, 90, y + 6, [20, 20, 20])
    expect(margensEmBranco(imagem, capa)).toBe(false)
  })

  it('uma coluna de texto ao lado também não', () => {
    const { imagem, pintar } = pagina()
    for (let y = 30; y < 120; y += 4) pintar(84, y, 98, y + 2, [40, 40, 40])
    expect(margensEmBranco(imagem, capa)).toBe(false)
  })

  it('pontinhos soltos e a borda serrilhada da própria capa não contam', () => {
    const { imagem, pintar } = pagina()
    pintar(5, 5, 6, 6, [0, 0, 0])
    pintar(50, 132, 51, 133, [0, 0, 0])
    pintar(19, 30, 20, 120, [230, 120, 120])
    expect(margensEmBranco(imagem, capa)).toBe(true)
  })
})

describe('num PDF de verdade, pelo pdf.js', () => {
  async function abrir(nome: string) {
    const { getDocument, OPS: codigos } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const dados = new Uint8Array(readFileSync(join(__dirname, '../fixtures/pdf', nome)))
    const tarefa = getDocument({ data: dados, standardFontDataUrl: PASTA_DAS_FONTES })
    const pdf = await tarefa.promise
    return {
      /** A capa da página em frações da tela (como a interface usa), ou null. */
      capa: async (numero = 1) => {
        const pagina = await pdf.getPage(numero)
        const { fnArray, argsArray } = await pagina.getOperatorList()
        return capaNaVisao(caixasDasImagens(fnArray, argsArray, codigos), pagina.getViewport({ scale: 1 }))
      },
      fechar: () => tarefa.destroy(),
    }
  }
  const perto = (a: Record<string, number> | null, b: Record<string, number>) => {
    expect(a).not.toBeNull()
    for (const chave of Object.keys(b)) expect(a![chave]).toBeCloseTo(b[chave], 3)
  }

  it('imagem dentro de um formulário com /Matrix e grupo de transparência', async () => {
    const pdf = await abrir('capa-em-formulario.pdf')
    perto(await pdf.capa(), { x: 60 / 420, y: (595 - 530) / 595, largura: 300 / 420, altura: 450 / 595 })
    await pdf.fechar()
  })

  it('página girada (/Rotate 90): a capa em pé na tela é achada', async () => {
    const pdf = await abrir('capa-girada.pdf')
    const capa = await pdf.capa()
    perto(capa, { largura: 300 / 420, altura: 450 / 595 })
    await pdf.fechar()
  })

  it('a capa em 100 faixas sai inteira', async () => {
    const pdf = await abrir('capa-em-faixas.pdf')
    perto(await pdf.capa(), { x: 60 / 420, y: (595 - 530) / 595, largura: 300 / 420, altura: 450 / 595 })
    await pdf.fechar()
  })

  it('nas páginas de texto não há capa', async () => {
    const pdf = await abrir('capa-com-margem.pdf')
    expect(await pdf.capa(2)).toBeNull()
    await pdf.fechar()
  })

  it('acha a capa no meio da primeira página e nenhuma nas páginas de texto', async () => {
    const { getDocument, OPS: codigos } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const dados = new Uint8Array(readFileSync(join(__dirname, '../fixtures/pdf/capa-com-margem.pdf')))
    const tarefa = getDocument({ data: dados, standardFontDataUrl: PASTA_DAS_FONTES })
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
