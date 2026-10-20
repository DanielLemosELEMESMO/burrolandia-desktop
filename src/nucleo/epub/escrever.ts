// Escreve um EPUB 3 a partir de capítulos em XHTML. Usado para o texto adaptado dos PDFs
// (etapa 2) e para os livros de teste.

import { strToU8, zipSync, type Zippable } from 'fflate'
import { escaparXml, extensaoDaImagem } from './comum'

export interface CapituloEpub {
  titulo: string
  /** Conteúdo do <body>, em XHTML bem formado. */
  corpo: string
}

/** Uma página do original (por exemplo, do PDF), marcada dentro de um capítulo. */
export interface PaginaEpub {
  rotulo: string
  capitulo: number
  ancora: string
}

export interface EpubParaEscrever {
  identificador: string
  titulo: string
  autores: string[]
  idioma: string
  capa?: { bytes: Uint8Array; tipo: string }
  capitulos: CapituloEpub[]
  paginas?: PaginaEpub[]
  modificadoEm?: Date
}

const ESTILO = `body { margin: 0; }
h1, h2, h3 { line-height: 1.2; }
p { margin: 0 0 0.8em; }
figure { margin: 1em 0; text-align: center; }
img { max-width: 100%; height: auto; }
`

const nomeDoCapitulo = (i: number) => `capitulo-${String(i + 1).padStart(3, '0')}.xhtml`

const documento = (idioma: string, titulo: string, corpo: string, cabeca = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escaparXml(idioma)}" lang="${escaparXml(idioma)}">
<head>
<meta charset="utf-8"/>
<title>${escaparXml(titulo)}</title>${cabeca}
</head>
<body>
${corpo}
</body>
</html>
`

function navegacao(e: EpubParaEscrever) {
  const itens = e.capitulos
    .map((c, i) => `<li><a href="${nomeDoCapitulo(i)}">${escaparXml(c.titulo)}</a></li>`)
    .join('\n')
  let corpo = `<nav epub:type="toc" id="sumario"><h1>Sumário</h1><ol>\n${itens}\n</ol></nav>`
  if (e.paginas?.length) {
    const paginas = e.paginas
      .map(p => `<li><a href="${nomeDoCapitulo(p.capitulo)}#${escaparXml(p.ancora)}">${escaparXml(p.rotulo)}</a></li>`)
      .join('\n')
    corpo += `\n<nav epub:type="page-list" id="paginas" hidden=""><h1>Páginas</h1><ol>\n${paginas}\n</ol></nav>`
  }
  return documento(e.idioma, 'Sumário', corpo)
}

function pacote(e: EpubParaEscrever, arquivoCapa: string | null) {
  const modificado = (e.modificadoEm ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const autores = e.autores
    .map((a, i) => `<dc:creator id="autor-${i + 1}">${escaparXml(a)}</dc:creator>`)
    .join('\n    ')
  const capitulos = e.capitulos.map((_, i) => nomeDoCapitulo(i))
  const itensCapitulo = capitulos
    .map(nome => `<item id="${nome.replace('.xhtml', '')}" href="${nome}" media-type="application/xhtml+xml"/>`)
    .join('\n    ')
  const itemCapa = arquivoCapa && e.capa
    ? `<item id="capa" href="${arquivoCapa}" media-type="${escaparXml(e.capa.tipo)}" properties="cover-image"/>`
    : ''
  const spine = capitulos.map(nome => `<itemref idref="${nome.replace('.xhtml', '')}"/>`).join('\n    ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${escaparXml(e.idioma)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escaparXml(e.identificador)}</dc:identifier>
    <dc:title>${escaparXml(e.titulo)}</dc:title>
    ${autores}
    <dc:language>${escaparXml(e.idioma)}</dc:language>
    <meta property="dcterms:modified">${modificado}</meta>${itemCapa ? '\n    <meta name="cover" content="capa"/>' : ''}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="estilo" href="estilo.css" media-type="text/css"/>
    ${itemCapa}
    ${itensCapitulo}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>
`
}

export function escreverEpub(e: EpubParaEscrever): Uint8Array {
  const arquivoCapa = e.capa ? `capa.${extensaoDaImagem(e.capa.tipo)}` : null
  const estilo = '\n<link rel="stylesheet" type="text/css" href="estilo.css"/>'

  // A ordem importa: o mimetype precisa ser a primeira entrada e ficar sem compressão.
  const arquivos: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`),
    'OEBPS/content.opf': strToU8(pacote(e, arquivoCapa)),
    'OEBPS/nav.xhtml': strToU8(navegacao(e)),
    'OEBPS/estilo.css': strToU8(ESTILO),
  }
  if (arquivoCapa && e.capa) arquivos[`OEBPS/${arquivoCapa}`] = [e.capa.bytes, { level: 0 }]
  e.capitulos.forEach((c, i) => {
    arquivos[`OEBPS/${nomeDoCapitulo(i)}`] = strToU8(documento(e.idioma, c.titulo, c.corpo, estilo))
  })
  return zipSync(arquivos, { level: 6 })
}
