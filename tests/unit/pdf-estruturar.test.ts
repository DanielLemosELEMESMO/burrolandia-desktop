import { describe, expect, it } from 'vitest'
import { estruturar, type Bloco } from '@nucleo/pdf/estruturar'
import type { DocumentoPdf, ItemPdf, PaginaPdf } from '@nucleo/pdf/tipos'

// Página A5 em pontos, com o texto entre x=48 e x=372.
const LARGURA = 420
const ALTURA = 595
const MARGEM = 48
const COLUNA = 324

/** Uma linha de texto: largura aproximada pelo número de letras. */
const item = (texto: string, x: number, y: number, tamanho = 11, largura?: number): ItemPdf => ({
  texto,
  x,
  y,
  largura: largura ?? texto.length * tamanho * 0.5,
  altura: tamanho,
})

/** Linha cheia: ocupa a coluna inteira, como num texto justificado. */
const cheia = (texto: string, y: number, x = MARGEM) => item(texto, x, y, 11, COLUNA - (x - MARGEM))

const pagina = (numero: number, itens: ItemPdf[]): PaginaPdf => ({
  numero,
  rotulo: String(numero),
  largura: LARGURA,
  altura: ALTURA,
  itens,
})

const documento = (paginas: PaginaPdf[], marcadores: DocumentoPdf['marcadores'] = []): DocumentoPdf => ({
  paginas,
  marcadores,
})

const textoDe = (bloco: Bloco) => bloco.partes.filter(p => typeof p === 'string').join('')
const paragrafos = (blocos: Bloco[]) => blocos.filter(b => b.tipo === 'p').map(textoDe)

describe('estruturar: linhas e parágrafos', () => {
  it('junta as linhas de um parágrafo e separa parágrafos pelo recuo da primeira linha', () => {
    const { blocos } = estruturar(
      documento([
        pagina(1, [
          cheia('Uma noite destas, vindo da cidade para o Engenho Novo,', 500, 66),
          cheia('encontrei no trem da Central um rapaz aqui do bairro.', 484),
          cheia('Cumprimentou-me, sentou-se ao pé de mim, falou da Lua', 468, 66),
          item('e dos ministros.', MARGEM, 452),
        ]),
      ]),
    )
    expect(paragrafos(blocos)).toEqual([
      'Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro.',
      'Cumprimentou-me, sentou-se ao pé de mim, falou da Lua e dos ministros.',
    ])
  })

  it('separa parágrafos por um espaço vertical maior entre as linhas', () => {
    const { blocos } = estruturar(
      documento([
        pagina(1, [
          cheia('A leitura lenta é um hábito que se constrói aos poucos,', 500),
          item('dia após dia.', MARGEM, 485),
          cheia('O primeiro obstáculo costuma ser o lugar onde paramos', 460),
          item('na véspera.', MARGEM, 445),
        ]),
      ]),
    )
    expect(paragrafos(blocos)).toEqual([
      'A leitura lenta é um hábito que se constrói aos poucos, dia após dia.',
      'O primeiro obstáculo costuma ser o lugar onde paramos na véspera.',
    ])
  })

  it('cola pedaços da mesma palavra e põe espaço onde havia distância', () => {
    const { blocos } = estruturar(
      documento([
        pagina(1, [
          item('Uma noite, enco', MARGEM, 500, 11, 80),
          item('ntrei', MARGEM + 80, 500, 11, 25),
          item('o rapaz.', MARGEM + 110, 500, 11, 40),
        ]),
      ]),
    )
    expect(paragrafos(blocos)).toEqual(['Uma noite, encontrei o rapaz.'])
  })

  it('reconhece títulos pela letra maior', () => {
    const { blocos } = estruturar(
      documento([
        pagina(1, [
          item('I. Do título', MARGEM, 520, 19),
          cheia('Uma noite destas, vindo da cidade para o Engenho Novo,', 490),
          cheia('encontrei no trem da Central um rapaz aqui do bairro,', 474),
          item('que eu conheço de vista e de chapéu.', MARGEM, 458),
        ]),
      ]),
    )
    expect(blocos.map(b => [b.tipo, textoDe(b)])).toEqual([
      ['h1', 'I. Do título'],
      ['p', 'Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro, que eu conheço de vista e de chapéu.'],
    ])
  })
})

describe('estruturar: hífen no fim da linha', () => {
  const comQuebra = (antes: string, depois: string, extra: ItemPdf[] = []) =>
    paragrafos(
      estruturar(documento([pagina(1, [cheia(antes, 500), item(depois, MARGEM, 484), ...extra])])).blocos,
    )[0]

  it('desfaz a hifenização de palavra quebrada', () => {
    expect(comQuebra('Era um texto de exem-', 'plo bem simples.')).toBe('Era um texto de exemplo bem simples.')
  })

  it('mantém o hífen de pronome oblíquo', () => {
    expect(comQuebra('a casa em que me criei, dando-', 'lhe o mesmo aspecto.')).toBe(
      'a casa em que me criei, dando-lhe o mesmo aspecto.',
    )
  })

  it('mantém o hífen quando a palavra aparece hifenizada em outro lugar', () => {
    const outra = [item('Levou o guarda-chuva.', MARGEM, 300)]
    expect(comQuebra('Abriu o guarda-', 'chuva na chuva fina.', outra)).toBe('Abriu o guarda-chuva na chuva fina.')
  })
})

describe('estruturar: cabeçalhos, rodapés e colunas', () => {
  it('remove o cabeçalho repetido e os números de página', () => {
    const nomes = ['um', 'dois', 'três']
    const paginas = [1, 2, 3].map(n =>
      pagina(n, [
        item('Dom Casmurro · Machado de Assis', 139, 572, 8),
        cheia(`Texto da página ${nomes[n - 1]}, que continua na linha de baixo e`, 500),
        item('termina aqui.', MARGEM, 484),
        item(String(n), 207, 17, 8),
      ]),
    )
    const { blocos } = estruturar(documento(paginas))
    expect(blocos.map(textoDe)).toEqual(
      nomes.map(nome => `Texto da página ${nome}, que continua na linha de baixo e termina aqui.`),
    )
  })

  it('não confunde título de capítulo no alto da página com cabeçalho repetido', () => {
    const paginas = [1, 2, 3].map(n =>
      pagina(n, [
        item(`Capítulo ${n}`, MARGEM, 560, 20),
        cheia(`Texto do capítulo ${['um', 'dois', 'três'][n - 1]}, que continua na linha de baixo e`, 500),
        item('termina aqui.', MARGEM, 484),
      ]),
    )
    const { blocos } = estruturar(documento(paginas))
    expect(blocos.filter(b => b.tipo === 'h1').map(textoDe)).toEqual(['Capítulo 1', 'Capítulo 2', 'Capítulo 3'])
  })

  it('lê duas colunas na ordem: a da esquerda inteira, depois a da direita', () => {
    const esquerda = (texto: string, y: number) => item(texto, 45, y, 10, 240)
    const direita = (texto: string, y: number) => item(texto, 310, y, 10, 240)
    const { blocos } = estruturar(
      documento([
        {
          ...pagina(1, [
            item('Notas sobre a leitura', 45, 768, 22),
            esquerda('Primeiro parágrafo, que começa na coluna da', 735),
            item('esquerda e termina nela mesma, como deve.', 45, 720, 10, 200),
            direita('Segundo parágrafo, que fica inteiro na coluna', 735),
            direita('da direita e precisa vir depois do primeiro.', 720),
          ]),
          largura: 595,
          altura: 842,
        },
      ]),
    )
    expect(paragrafos(blocos)).toEqual([
      'Primeiro parágrafo, que começa na coluna da esquerda e termina nela mesma, como deve.',
      'Segundo parágrafo, que fica inteiro na coluna da direita e precisa vir depois do primeiro.',
    ])
  })
})

describe('estruturar: páginas e capítulos', () => {
  it('marca o começo de cada página, mesmo no meio de um parágrafo', () => {
    const { blocos } = estruturar(
      documento([
        pagina(1, [cheia('Um parágrafo que começa numa página e', 100)]),
        pagina(2, [item('continua na seguinte.', MARGEM, 500)]),
      ]),
    )
    expect(blocos).toHaveLength(1)
    expect(blocos[0].partes).toEqual([
      { pagina: 1, rotulo: '1' },
      'Um parágrafo que começa numa página e ',
      { pagina: 2, rotulo: '2' },
      'continua na seguinte.',
    ])
  })

  it('divide em capítulos pelos marcadores do PDF', () => {
    const { capitulos } = estruturar(
      documento(
        [
          pagina(1, [item('I. Do título', MARGEM, 520, 19), item('Primeiro capítulo.', MARGEM, 490)]),
          pagina(2, [item('II. Do livro', MARGEM, 520, 19), item('Segundo capítulo.', MARGEM, 490)]),
        ],
        [
          { titulo: 'I. Do título', pagina: 1, nivel: 0 },
          { titulo: 'II. Do livro', pagina: 2, nivel: 0 },
        ],
      ),
    )
    expect(capitulos.map(c => [c.titulo, c.blocos.map(textoDe)])).toEqual([
      ['I. Do título', ['I. Do título', 'Primeiro capítulo.']],
      ['II. Do livro', ['II. Do livro', 'Segundo capítulo.']],
    ])
  })

  it('sem marcadores, divide pelos títulos maiores', () => {
    const { capitulos } = estruturar(
      documento([
        pagina(1, [
          item('Prefácio', MARGEM, 520, 19),
          item('Algumas palavras.', MARGEM, 490),
          item('Capítulo um', MARGEM, 400, 19),
          item('O começo.', MARGEM, 370),
        ]),
      ]),
    )
    expect(capitulos.map(c => c.titulo)).toEqual(['Prefácio', 'Capítulo um'])
  })

  it('sem títulos nem marcadores, divide em blocos de páginas', () => {
    const paginas = Array.from({ length: 23 }, (_, i) =>
      pagina(i + 1, [cheia('Um parágrafo inteiro nesta página, que ocupa a linha toda e', 500), item(`termina ${i + 1}.`, MARGEM, 484)]),
    )
    const { capitulos } = estruturar(documento(paginas))
    expect(capitulos.map(c => c.titulo)).toEqual(['Páginas 1 a 10', 'Páginas 11 a 20', 'Páginas 21 a 23'])
  })

  it('avisa a página sem texto, em vez de pular em silêncio', () => {
    const { blocos } = estruturar(
      documento([pagina(1, [item('Texto antes.', MARGEM, 500)]), pagina(2, []), pagina(3, [item('Texto depois.', MARGEM, 500)])]),
    )
    expect(blocos.map(textoDe)).toEqual([
      'Texto antes.',
      'Esta página não tem texto para adaptar. Veja a página original.',
      'Texto depois.',
    ])
    expect(blocos[1].tipo).toBe('aviso')
  })
})
