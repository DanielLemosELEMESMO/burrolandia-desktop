// Pequenas peças usadas tanto para ler quanto para escrever EPUB.

export const TIPOS_DE_IMAGEM: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export const extensaoDaImagem = (tipo: string) => TIPOS_DE_IMAGEM[tipo.toLowerCase()] ?? 'img'

// Caracteres que o XML 1.0 não aceita nem escapados. Aparecem em PDFs (títulos terminados em nulo).
const INVALIDOS_NO_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

export const limparTexto = (texto: string) => texto.replace(INVALIDOS_NO_XML, '')

export const escaparXml = (texto: string) =>
  limparTexto(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
