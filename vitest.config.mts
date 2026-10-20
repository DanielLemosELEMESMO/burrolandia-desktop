import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@nucleo': resolve(import.meta.dirname, 'src/nucleo') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // O primeiro teste de PDF carrega o pdf.js do zero; no Windows do CI isso passa de 5 s.
    testTimeout: 30_000,
  },
})
