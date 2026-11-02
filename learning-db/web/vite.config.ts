import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: { outDir: '../public', emptyOutDir: true, chunkSizeWarningLimit: 1000 },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})
