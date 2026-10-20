// Pequenas peças usadas tanto para ler quanto para escrever EPUB.

export const TIPOS_DE_IMAGEM: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export const extensaoDaImagem = (tipo: string) => TIPOS_DE_IMAGEM[tipo.toLowerCase()] ?? 'img'

export const escaparXml = (texto: string) =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
