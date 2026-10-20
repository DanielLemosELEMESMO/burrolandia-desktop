import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@nucleo': resolve(import.meta.dirname, 'src/nucleo') }

// Recursos do pdf.js (mapas de caracteres, fontes padrão, decodificadores) servidos pela interface
// para desenhar a página original. Copiados de node_modules para public/ (fora do git).
const origemPdfjs = resolve(import.meta.dirname, 'node_modules/pdfjs-dist')
const destinoPdfjs = resolve(import.meta.dirname, 'src/renderer/public/pdfjs')
for (const pasta of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  if (!existsSync(resolve(destinoPdfjs, pasta))) cpSync(resolve(origemPdfjs, pasta), resolve(destinoPdfjs, pasta), { recursive: true })
}

export default defineConfig({
  // O pdf.js vai empacotado no processo do conversor, sem depender de node_modules em tempo de execução.
  main: { resolve: { alias }, build: { externalizeDeps: { exclude: ['pdfjs-dist'] } } },
  preload: {},
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
})
