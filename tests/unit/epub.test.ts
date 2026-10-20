import { describe, expect, it } from 'vitest'
import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate'
import { escreverEpub, type EpubParaEscrever } from '@nucleo/epub/escrever'
import { lerEpub, ErroEpub } from '@nucleo/epub/ler'

const capaSvg = strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#2d5a4e"/></svg>')

const livroBase: EpubParaEscrever = {
  identificador: 'urn:uuid:7f1c2b8e-0000-4000-8000-000000000001',
  titulo: 'Dom Casmurro',
  autores: ['Machado de Assis'],
  idioma: 'pt-BR',
  capa: { bytes: capaSvg, tipo: 'image/svg+xml' },
  capitulos: [
    { titulo: 'Do título', corpo: '<p>Uma noite destas, vindo da cidade para o Engenho Novo…</p>' },
    { titulo: 'Do livro', corpo: '<p>Agora que expliquei o título, passo a escrever o livro.</p>' },
  ],
}

const OPF_NS = 'http://www.idpf.org/2007/opf'

/** Monta um EPUB à mão, para testar arquivos que não saem do nosso escritor. */
function epubManual(opfMetadata: string, manifest: string, extras: Record<string, Uint8Array> = {}) {
  const opf = `<?xml version="1.0"?>
<package xmlns="${OPF_NS}" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="${OPF_NS}">${opfMetadata}</metadata>
  <manifest>${manifest}<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`
  return zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OPS/livro.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OPS/livro.opf': strToU8(opf),
    'OPS/c1.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>oi</p></body></html>'),
    ...extras,
  })
}

describe('escreverEpub', () => {
  it('grava o mimetype como primeira entrada, sem compressão', () => {
    const bytes = escreverEpub(livroBase)
    const view = new DataView(bytes.buffer, bytes.byteOffset)
    expect(view.getUint32(0, true)).toBe(0x04034b50) // assinatura do cabeçalho local
    expect(view.getUint16(8, true)).toBe(0) // método 0 = guardado
    const tamanhoNome = view.getUint16(26, true)
    expect(strFromU8(bytes.subarray(30, 30 + tamanhoNome))).toBe('mimetype')
    expect(strFromU8(unzipSync(bytes).mimetype)).toBe('application/epub+zip')
  })

  it('lista os capítulos no sumário (nav.xhtml)', () => {
    const arquivos = unzipSync(escreverEpub(livroBase))
    const nav = strFromU8(arquivos['OEBPS/nav.xhtml'])
    expect(nav).toContain('epub:type="toc"')
    expect(nav).toContain('Do título')
    expect(nav).toContain('Do livro')
  })

  it('gera a lista de páginas quando recebe páginas', () => {
    const arquivos = unzipSync(escreverEpub({
      ...livroBase,
      paginas: [{ rotulo: '1', capitulo: 0, ancora: 'pagina-1' }, { rotulo: '2', capitulo: 1, ancora: 'pagina-2' }],
    }))
    const nav = strFromU8(arquivos['OEBPS/nav.xhtml'])
    expect(nav).toContain('epub:type="page-list"')
    expect(nav).toMatch(/href="capitulo-002\.xhtml#pagina-2"[^>]*>2</)
  })

  it('escapa caracteres especiais nos metadados', () => {
    const arquivos = unzipSync(escreverEpub({ ...livroBase, titulo: 'Ciência & Fé <ensaios>' }))
    expect(strFromU8(arquivos['OEBPS/content.opf'])).toContain('Ciência &amp; Fé &lt;ensaios&gt;')
  })
})

describe('lerEpub', () => {
  it('lê de volta título, autores, idioma e capa do que o escritor gravou', () => {
    const meta = lerEpub(escreverEpub(livroBase))
    expect(meta.titulo).toBe('Dom Casmurro')
    expect(meta.autores).toEqual(['Machado de Assis'])
    expect(meta.idioma).toBe('pt-BR')
    expect(meta.capa?.tipo).toBe('image/svg+xml')
    expect(meta.capa?.extensao).toBe('svg')
    expect(meta.capa?.bytes).toEqual(capaSvg)
  })

  it('acha a capa pelo meta name="cover" do EPUB 2', () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const meta = lerEpub(epubManual(
      '<dc:title>A Origem das Espécies</dc:title><meta name="cover" content="img-capa"/>',
      '<item id="img-capa" href="imagens/frente.jpg" media-type="image/jpeg"/>',
      { 'OPS/imagens/frente.jpg': jpg },
    ))
    expect(meta.capa?.tipo).toBe('image/jpeg')
    expect(meta.capa?.extensao).toBe('jpg')
    expect(meta.capa?.bytes).toEqual(jpg)
  })

  it('deixa tradutores de fora dos autores', () => {
    const meta = lerEpub(epubManual(
      `<dc:title>A Origem das Espécies</dc:title>
       <dc:creator opf:role="aut">Charles Darwin</dc:creator>
       <dc:creator opf:role="trl">Fulano de Tal</dc:creator>`,
      '',
    ))
    expect(meta.autores).toEqual(['Charles Darwin'])
  })

  it('deixa de fora quem o EPUB 3 marca como tradutor por refines', () => {
    const opf = `<?xml version="1.0"?>
<package xmlns="${OPF_NS}" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Livro</dc:title>
    <dc:creator id="a">Autora</dc:creator>
    <dc:creator id="t">Tradutor</dc:creator>
    <meta refines="#t" property="role" scheme="marc:relators">trl</meta>
  </metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`
    const bytes = zipSync({
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="p.opf"/></rootfiles></container>'),
      'p.opf': strToU8(opf),
    })
    expect(lerEpub(bytes).autores).toEqual(['Autora'])
  })

  it('separa ISBNs dos outros identificadores', () => {
    const meta = lerEpub(epubManual(
      `<dc:title>Livro</dc:title>
       <dc:identifier id="id">urn:isbn:978-85-359-0277-8</dc:identifier>
       <dc:identifier opf:scheme="ISBN">8535902775</dc:identifier>
       <dc:identifier>urn:uuid:abc</dc:identifier>`,
      '',
    ))
    expect(meta.identificadores.isbn).toEqual(['9788535902778', '8535902775'])
    expect(meta.identificadores.outros).toEqual(['urn:uuid:abc'])
  })

  it('não confunde um número qualquer com ISBN', () => {
    const meta = lerEpub(epubManual('<dc:title>Livro</dc:title><dc:identifier>9788535902771</dc:identifier>', ''))
    expect(meta.identificadores.isbn).toEqual([])
    expect(meta.identificadores.outros).toEqual(['9788535902771'])
  })

  it('aceita fonte ofuscada, que não é DRM', () => {
    const encryption = strToU8(`<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
      <enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></enc:EncryptedData>
    </encryption>`)
    expect(() => lerEpub(epubManual('<dc:title>x</dc:title>', '', { 'META-INF/encryption.xml': encryption }))).not.toThrow()
  })

  it('recusa EPUB protegido por DRM', () => {
    const encryption = strToU8(`<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
      <enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></enc:EncryptedData>
    </encryption>`)
    const tentar = () => lerEpub(epubManual('<dc:title>x</dc:title>', '', { 'META-INF/encryption.xml': encryption }))
    expect(tentar).toThrow(ErroEpub)
    expect(tentar).toThrow(expect.objectContaining({ codigo: 'drm' }))
  })

  it('recusa arquivo que não é zip', () => {
    expect(() => lerEpub(strToU8('isto não é um epub'))).toThrow(expect.objectContaining({ codigo: 'arquivo-invalido' }))
  })

  it('recusa zip sem container.xml', () => {
    expect(() => lerEpub(zipSync({ 'a.txt': strToU8('oi') }))).toThrow(expect.objectContaining({ codigo: 'arquivo-invalido' }))
  })
})
