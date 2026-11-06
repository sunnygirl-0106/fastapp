// Run after the production build, before uploading any public artifact.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveConfig } from 'vite'

const config = await resolveConfig({}, 'build', 'production')
assert.equal(config.define.__REAL_TEXT__, 'false', '生产构建必须使用模拟模式')
const forbidden = [
  /sk-or-v1-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\/api\/openrouter\/chat\/completions/,
  /openrouter\.ai\/api\//,
]
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    assert.ok(!entry.name.startsWith('.env') && entry.name !== '.usage', `禁止发布配置或账单：${path}`)
    if (entry.isDirectory()) await inspect(path)
    else {
      const content = await readFile(path, 'utf8')
      assert.ok(!forbidden.some(pattern => pattern.test(content)), `发现密钥或真实模型请求入口：${path}`)
    }
  }
}
await inspect('dist')
console.log('PASS 公网构建为模拟模式，产物无密钥、账单和真实模型请求入口')
