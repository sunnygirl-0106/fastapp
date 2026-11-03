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
  // 双入口：/ 是真实 5 步工作流；/proposal.html 是「修复」6 条的设计方案页
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        proposal: fileURLToPath(new URL('./proposal.html', import.meta.url)),
      },
    },
  },
  server: { port: 5188, host: true },
}))
