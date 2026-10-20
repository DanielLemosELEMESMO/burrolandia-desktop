import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@nucleo': resolve(import.meta.dirname, 'src/nucleo') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
