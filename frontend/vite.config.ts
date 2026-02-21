import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8789',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8789',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          tanstack: ['@tanstack/react-query', '@tanstack/react-router'],
          charts: ['recharts'],
        },
      },
    },
  },
})
