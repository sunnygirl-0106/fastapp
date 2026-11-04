import { mkdir, readFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const steps = ['拆解剧本', '提取角色与场景', '生成镜头设计']
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
export function openRouterPlugin(env, root, enabled, fetcher = fetch) {
  const key = env.OPENROUTER_API_KEY
  const model = env.OPENROUTER_MODEL || 'google/gemini-3.1-pro-preview'
  const budget = Number(env.BUDGET_USD ?? 5), stopAt = Math.min(Number(env.STOP_AT_USD ?? 4.5), budget)
  if (!Number.isFinite(budget) || budget < 0 || !Number.isFinite(stopAt) || stopAt < 0) throw new Error('预算配置必须为非负数字')
  const directory = resolve(root, '.usage'), file = resolve(directory, 'usage.jsonl')
  let queue = Promise.resolve()
  const redact = value => key ? value.split(key).join('[已隐藏]') : value
  const json = (res, status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(redact(JSON.stringify(data))) }
  async function records() {
    try {
      return (await readFile(file, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
    } catch (error) { if (error.code === 'ENOENT') return []; throw new Error('费用记录无法读取，已停止调用') }
  }
  async function usage() {
    const rows = await records()
    const local = rows.reduce((sum, row) => sum + (number(row.cost) ?? 0), 0)
    let remote = null
    if (key) {
      try {
        const response = await fetcher('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) })
        if (response.ok) remote = number((await response.json()).data?.usage)
      } catch { /* Fall back to the ledger without logging credentials or upstream errors. */ }
    }
    const unknown = rows.filter(row => row.cost === null).length
    // Persisted floor also protects against delayed upstream usage reporting.
    const floor = rows.reduce((max, row) => Math.max(max, number(row.spentAfter) ?? 0), 0)
    const spent = Math.max(remote ?? 0, local, floor)
    return { remote, local, unknown, spent, budget, stopAt, remaining: Math.max(0, budget - spent), untilStop: Math.max(0, stopAt - spent), rows: rows.slice().reverse() }
  }
  async function chat(req, res, body) {
    const totals = await usage()
    if (totals.spent >= stopAt) return json(res, 402, { error: { message: `预算已用到 $${totals.spent.toFixed(4)} / $${budget}，已停止调用` } })
    if (totals.remote === null && totals.unknown) return json(res, 503, { error: { message: '费用记录中有未知费用且无法查询实际金额，已停止调用' } })
    if (res.destroyed) return
    const started = Date.now()
    const step = decodeURIComponent(String(req.headers['x-phanthy-step'] || ''))
    if (!steps.includes(step)) return json(res, 400, { error: { message: '无效的生成步骤' } })
    if (!Array.isArray(body.messages) || body.messages.length !== 2 || body.messages.some(m => !['system', 'user'].includes(m.role) || typeof m.content !== 'string')) return json(res, 400, { error: { message: '无效的文本请求' } })
    await mkdir(directory, { recursive: true })
    // Check write access before spending anything.
    await appendFile(file, '', { mode: 0o600 })
    let raw, status = 502, data, success = false
    try {
      const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: body.messages, usage: { include: true } }), signal: AbortSignal.timeout(295000),
      })
      status = response.status
      raw = await response.text()
      try { data = JSON.parse(raw) } catch { /* Invalid JSON is forwarded and logged as failure. */ }
      success = response.ok && !data?.error && typeof data?.choices?.[0]?.message?.content === 'string'
    } catch { raw = JSON.stringify({ error: { message: '文本模型网络请求失败或超时，请手动重试' } }) }
    const cost = number(data?.usage?.cost)
    const row = { time: new Date().toISOString(), step, model, inputTokens: number(data?.usage?.prompt_tokens), outputTokens: number(data?.usage?.completion_tokens), reasoningTokens: number(data?.usage?.completion_tokens_details?.reasoning_tokens), cost, success, durationMs: Date.now() - started, spentAfter: cost === null ? null : totals.spent + cost }
    await appendFile(file, JSON.stringify(row) + '\n', { mode: 0o600 })
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(redact(raw))
  }
  return {
    name: 'phanthy-dev-text', apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (!['/usage', '/api/usage', '/api/openrouter/chat/completions'].includes(path)) return next()
        try {
          if (path === '/usage' && req.method === 'GET') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.end(usageHtml)
          }
          if (path === '/api/usage' && req.method === 'GET') return json(res, 200, await usage())
          if (req.method !== 'POST') return json(res, 405, { error: { message: '请求方法不支持' } })
          if (!enabled) return json(res, 503, { error: { message: '真实文本模型未启用' } })
          // Development server only: reject cross-origin spending requests.
          if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: { message: '请求来源不允许' } })
          let raw = ''
          for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 2_000_000) return json(res, 413, { error: { message: '请求内容过长' } }) }
          let body
          try { body = JSON.parse(raw) } catch { return json(res, 400, { error: { message: '请求格式错误' } }) }
          // All calls, including retries and calls from other tabs, check the latest spend sequentially.
          const job = queue.then(() => chat(req, res, body))
          queue = job.catch(() => {})
          await job
        } catch { if (!res.headersSent) json(res, 503, { error: { message: '费用服务不可用，已停止调用' } }) }
      })
    },
  }
}
const usageHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文本模型费用</title><style>body{font:15px system-ui;background:#111418;color:#e8edf2;margin:32px}h1{font-size:24px}.stats{display:flex;gap:20px;flex-wrap:wrap}.stats>div{background:#20252c;padding:24px;border-radius:12px;min-width:210px}strong{display:block;font-size:26px;margin:12px 0}small{color:#b2bcc6}table{border-collapse:collapse;width:100%;margin-top:28px}td,th{text-align:left;padding:12px;border-bottom:1px solid #343b44}.bad{color:#ff8b8b}</style><h1>文本模型费用</h1><p>每 5 秒自动刷新 · 费用未知不会按零处理</p><div class="stats"><div>累计已花<strong id="spent">—</strong><small id="sources"></small></div><div>预算剩余<strong id="remaining">—</strong><small id="budget"></small></div><div>离自动停止<strong id="untilStop">—</strong><small id="stop"></small></div></div><p id="error" class="bad"></p><table><thead><tr><th>时间</th><th>步骤 / 模型</th><th>输入 / 输出 / 思考 token</th><th>费用（美元）</th><th>成功</th><th>耗时</th></tr></thead><tbody id="rows"></tbody></table><script>const el=id=>document.getElementById(id),money=n=>n===null?'未知':'$'+n.toFixed(6);async function refresh(){try{const r=await fetch('/api/usage');if(!r.ok)throw Error('费用服务不可用');const d=await r.json();el('spent').textContent=money(d.spent);el('sources').textContent='OpenRouter：'+money(d.remote)+'；本地：'+money(d.local)+'（未知 '+d.unknown+' 次）';el('remaining').textContent=money(d.remaining);el('budget').textContent='总预算 '+money(d.budget);el('untilStop').textContent=money(d.untilStop);el('stop').textContent='停止阈值 '+money(d.stopAt);el('error').textContent='';el('rows').replaceChildren(...d.rows.map(row=>{const tr=document.createElement('tr');[new Date(row.time).toLocaleString(),row.step+' / '+row.model,[row.inputTokens,row.outputTokens,row.reasoningTokens].map(n=>n??'未知').join(' / '),money(row.cost),row.success?'是':'否',(row.durationMs/1000).toFixed(1)+' 秒'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});return tr}))}catch(e){el('error').textContent=e.message}finally{setTimeout(refresh,5000)}}refresh()</script></html>`
