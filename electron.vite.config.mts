import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@nucleo': resolve(import.meta.dirname, 'src/nucleo') }

export default defineConfig({
  main: { resolve: { alias } },
  preload: {},
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
})
