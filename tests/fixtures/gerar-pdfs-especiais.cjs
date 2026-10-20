// PDFs de teste escritos à mão, byte a byte, para casos que o Chromium não gera:
//   - titulo-com-nulo.pdf: título, autor e marcadores em UTF-16 terminados em U+0000 (alguns
//     programas gravam assim; sem limpeza, isso quebra o XML do EPUB gerado);
//   - paisagem.pdf: páginas 16:9, como slides (páginas baixas revelam erros de "página atual").
// Rode com: node tests/fixtures/gerar-pdfs-especiais.cjs

const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const utf16ComNulo = texto =>
  '<FEFF' + [...texto].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase() + '0000>'

function montarPdf(objetos) {
  let saida = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'
  const posicoes = []
  objetos.forEach((corpo, i) => {
    posicoes.push(Buffer.byteLength(saida, 'latin1'))
    saida += `${i + 1} 0 obj\n${corpo}\nendobj\n`
  })
  const xref = Buffer.byteLength(saida, 'latin1')
  saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  for (const p of posicoes) saida += `${String(p).padStart(10, '0')} 00000 n \n`
  saida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info 2 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(saida, 'latin1')
}

const fluxo = conteudo => `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`

/** Documento com uma fonte Helvetica e páginas de texto simples. */
function documento({ titulo, autor, largura, altura, paginas, marcadores }) {
  // 1 catálogo, 2 informações, 3 páginas, 4 fonte, 5 sumário, 6.. marcadores, depois páginas e conteúdos.
  const objetos = [
    `<< /Type /Catalog /Pages 3 0 R${marcadores ? ' /Outlines 5 0 R' : ''} >>`,
    `<< /Title ${titulo} /Author ${autor} >>`,
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    null,
  ]
  const primeiroMarcador = objetos.length + 1
  for (let i = 0; i < (marcadores?.length ?? 0); i++) objetos.push(null)
  const refsDasPaginas = []
  paginas.forEach(linhas => {
    const numero = objetos.length + 1
    refsDasPaginas.push(numero)
    objetos.push(
      `<< /Type /Page /Parent 3 0 R /MediaBox [0 0 ${largura} ${altura}] /Contents ${numero + 1} 0 R /Resources << /Font << /F1 4 0 R >> >> >>`,
    )
    objetos.push(fluxo(linhas.join('\n')))
  })
  objetos[2] = `<< /Type /Pages /Kids [${refsDasPaginas.map(n => `${n} 0 R`).join(' ')}] /Count ${paginas.length} >>`
  if (marcadores) {
    const ultimo = primeiroMarcador + marcadores.length - 1
    objetos[4] = `<< /Type /Outlines /First ${primeiroMarcador} 0 R /Last ${ultimo} 0 R /Count ${marcadores.length} >>`
    marcadores.forEach(({ titulo: t, pagina }, i) => {
      const n = primeiroMarcador + i
      const vizinhos = `${i > 0 ? ` /Prev ${n - 1} 0 R` : ''}${i < marcadores.length - 1 ? ` /Next ${n + 1} 0 R` : ''}`
      objetos[n - 1] = `<< /Title ${t} /Parent 5 0 R${vizinhos} /Dest [${refsDasPaginas[pagina - 1]} 0 R /XYZ 0 ${altura} 0] >>`
    })
  } else {
    objetos[4] = '<< /Type /Outlines /Count 0 >>'
  }
  return montarPdf(objetos)
}

const linha = (tamanho, x, y, texto) => `BT /F1 ${tamanho} Tf ${x} ${y} Td (${texto}) Tj ET`

const comNulo = documento({
  titulo: utf16ComNulo('Livro de Teste'),
  autor: utf16ComNulo('Fulana de Tal'),
  largura: 595,
  altura: 842,
  marcadores: [
    { titulo: utf16ComNulo('Capitulo 1'), pagina: 1 },
    { titulo: utf16ComNulo('Capitulo 2'), pagina: 2 },
  ],
  paginas: [1, 2, 3].map(k => [
    linha(20, 56, 760, `Capitulo ${k}`),
    ...Array.from({ length: 30 }, (_, i) =>
      linha(11, 56, 720 - i * 16, `Linha ${i + 1} da pagina ${k}, com texto suficiente para parecer um livro de verdade.`),
    ),
  ]),
})

const paisagem = documento({
  titulo: '(Slides de teste)',
  autor: '(Burrolandia)',
  largura: 842,
  altura: 474,
  paginas: [1, 2, 3, 4, 5, 6].map(k => [
    linha(28, 60, 400, `Slide ${k}`),
    ...Array.from({ length: 8 }, (_, i) => linha(14, 60, 350 - i * 24, `Item ${i + 1} do slide ${k}, para haver texto nesta pagina.`)),
  ]),
})

writeFileSync(join(__dirname, 'pdf', 'titulo-com-nulo.pdf'), comNulo)
writeFileSync(join(__dirname, 'pdf', 'paisagem.pdf'), paisagem)
console.log('gerados titulo-com-nulo.pdf e paisagem.pdf')
