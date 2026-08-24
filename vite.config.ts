import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// build 部署到 GitHub Pages 的子路径 /fastapp/；本地 dev 仍在根路径
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/fastapp/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5188, host: true },
}))
