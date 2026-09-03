import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves this repo at /databahn/, not the domain root, so
  // every asset URL Vite emits has to carry that prefix or the deployed
  // site loads with no CSS/JS, only local dev and other hosts don't care
  // since they already sit at the root.
  base: '/databahn/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
