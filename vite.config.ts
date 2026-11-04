import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

import { openRouterPlugin } from './server/openrouter.mjs'

// build 部署到 GitHub Pages 的子路径 /fastapp/；本地 dev 仍在根路径
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const realText = command === 'serve' && !!env.OPENROUTER_API_KEY && !env.PHANTHY_MOCK
  return {
    base: command === 'build' ? '/fastapp/' : '/',
    plugins: [react(), openRouterPlugin(env, process.cwd(), realText)],
    define: { __REAL_TEXT__: JSON.stringify(realText), __TEXT_MODEL__: JSON.stringify(env.OPENROUTER_MODEL || 'google/gemini-3.1-pro-preview') },
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
    server: { port: 5188, host: true, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  }
})
