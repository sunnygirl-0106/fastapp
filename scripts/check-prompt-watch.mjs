// Exercise the watcher with a temporary copy; never touch the authoritative prompt document.
import assert from 'node:assert/strict'
import { mkdtemp, copyFile, appendFile, rename, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { promptDocReload } from '../server/promptDocReload.mjs'
const root = await mkdtemp(join(tmpdir(), 'phanthy-prompt-watch-'))
const path = join(root, 'prompt.md')
await copyFile(new URL('../../测试提示词效果/全自动工作流提示词.md', import.meta.url), path)
const original = await readFile(path, 'utf8')
const server = await createServer({ configFile: false, root, plugins: [promptDocReload(path)], server: { middlewareMode: true, hmr: false }, appType: 'custom' })
let count = 0, changed
const messages = []
server.ws.send = message => { messages.push(message) }
server.config.logger.info = message => { assert.equal(message, '提示词文档已更新，已重新读取并刷新页面'); count++; changed?.() }
const expectChange = async mutate => {
  let timer
  const observed = new Promise((resolve, reject) => {
    changed = resolve
    timer = setTimeout(() => reject(new Error('提示词监听超时')), 5000)
  })
  try { await mutate(); await observed } finally { clearTimeout(timer); changed = undefined }
}
try {
  const first = await server.transformRequest('/prompt.md?raw')
  await expectChange(() => appendFile(path, '\nwatch-edit-v10'))
  const edited = await server.transformRequest('/prompt.md?raw')
  assert.notEqual(first.code, edited.code); assert.ok(edited.code.includes('watch-edit-v10'))
  console.log('PASS 编辑提示词副本后失效缓存、刷新并输出指定日志')
  await expectChange(async () => { await writeFile(path + '.next', original + '\nwatch-replacement-v10'); await rename(path + '.next', path) })
  const replaced = await server.transformRequest('/prompt.md?raw')
  assert.ok(replaced.code.includes('watch-replacement-v10')); assert.ok(!replaced.code.includes('watch-edit-v10'))
  assert.equal(count, 2); assert.deepEqual(messages, [{ type: 'full-reload' }, { type: 'full-reload' }])
  console.log('PASS 编辑器整文件替换同样刷新并重新读取')
} finally { await server.close(); await rm(root, { recursive: true, force: true }) }
console.log('PASS middleware 模式关闭服务器释放监听，进程正常退出\n3 prompt watcher checks passed.')
