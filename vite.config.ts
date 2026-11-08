import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { existsSync } from 'node:fs'
import { promptDocReload } from './server/promptDocReload.mjs'



// 提示词文档在仓库外，用轮询监听（能识别整文件替换），改动后让开发服务器重新读取并整页刷新。
const promptDoc = fileURLToPath(new URL('../测试提示词效果/全自动工作流提示词.md', import.meta.url))
const bundledPromptDoc = fileURLToPath(new URL('./src/data/promptBook.md', import.meta.url))
// build 部署到 GitHub Pages 的子路径 /fastapp/；本地 dev 仍在根路径
export default defineConfig(({ command }) => {
  return {
    base: command === 'build' ? '/fastapp/' : '/',
    plugins: [react(), promptDocReload(promptDoc)],
    define: { __REAL_TEXT__: 'false' },
    resolve: {
      alias: [
        { find: /^@prompt-book(?=\?|$)/, replacement: command === 'serve' && existsSync(promptDoc) ? promptDoc : bundledPromptDoc },
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
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
