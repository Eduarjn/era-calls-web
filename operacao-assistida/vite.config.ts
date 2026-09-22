/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// O módulo é servido em /operacao-assistida/ ao lado do index.html da Inteligência de Calls
// (mesma origem → a sessão do Supabase é compartilhada automaticamente).
export default defineConfig({
  base: '/operacao-assistida/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': '/src' } },
  server: { port: 5174 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
