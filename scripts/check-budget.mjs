// Offline middleware tests: no external requests and no real credentials.
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { openRouterPlugin } from '../server/openrouter.mjs'
const root = await mkdtemp(join(tmpdir(), 'phanthy-budget-'))
let middleware, requests = 0, remote = 0, remoteFailed = false, cost = 0.3, status = 200
const upstream = async url => {
  if (url.endsWith('/key')) { if (remoteFailed) throw new Error('offline'); return Response.json({ data: { usage: remote } }) }
  requests++
  return Response.json({ choices: [{ message: { content: 'test' } }], ...(cost === null ? {} : { usage: { cost, prompt_tokens: 10, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 5 } } }) }, { status })
}
const configure = (stop, extra = {}) => openRouterPlugin({ OPENROUTER_API_KEY: 'offline-test', BUDGET_USD: '5', STOP_AT_USD: String(stop), ...extra }, root, true, upstream).configureServer({ middlewares: { use(fn) { middleware = fn } } })
configure(0)
const server = createServer((req,res) => middleware(req,res,()=>{res.statusCode=404;res.end()}))
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base = `http://127.0.0.1:${server.address().port}`
const post = () => fetch(base+'/api/openrouter/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','X-Phanthy-Step':encodeURIComponent('拆解剧本')},body:JSON.stringify({model:'ignored',messages:[{role:'system',content:'system'},{role:'user',content:'user'}]})})
let checks = 0
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)}
try {
  let r=await post(), data=await r.json()
  check('零预算拒绝，无上游请求',()=>{assert.equal(r.status,402);assert.match(data.error.message,/预算已用到/);assert.equal(requests,0)})
  r=await fetch(base+'/usage');const html=await r.text()
  check('独立中文费用页与五秒刷新',()=>{assert.match(html,/累计已花/);assert.match(html,/5000/)})
  configure(0.5)
  const responses=await Promise.all([post(),post(),post()])
  check('并发请求串行检查，延迟远端账单不绕过阈值',()=>{assert.deepEqual(responses.map(r=>r.status),[200,200,402]);assert.equal(requests,2)})
  let usage=await (await fetch(base+'/api/usage')).json()
  check('本地累计与 token 记录',()=>{assert.equal(usage.local,0.6);assert.equal(usage.spent,0.6);assert.equal(usage.rows[0].reasoningTokens,5)})
  remote=1.2;usage=await (await fetch(base+'/api/usage')).json()
  check('实际数与本地数取较大值',()=>assert.equal(usage.spent,1.2))
  remoteFailed=true;usage=await (await fetch(base+'/api/usage')).json()
  check('远端失败退回本地账单',()=>{assert.equal(usage.remote,null);assert.equal(usage.spent,0.6)})
  configure(4.5);cost=null;status=503
  await post();usage=await (await fetch(base+'/api/usage')).json()
  check('失败且无费用记为未知',()=>{assert.equal(usage.rows[0].cost,null);assert.equal(usage.rows[0].success,false);assert.equal(usage.unknown,1)})
  const before=requests;r=await post()
  check('未知费用且远端不可用时停止调用',()=>{assert.equal(r.status,503);assert.equal(requests,before)})
  const ledger=await readFile(join(root,'.usage/usage.jsonl'),'utf8')
  check('账单不包含认证信息',()=>assert.ok(!ledger.includes('offline-test')))
  remoteFailed=false
  configure(4.23,{BUDGET_USD:'4.23',WARN_AT_USD:'4',USAGE_BASELINE_USD:'1'})
  remote=4.99;usage=await (await fetch(base+'/api/usage')).json()
  check('新预算扣除密钥历史用量，未到 $4 不提醒',()=>{assert.equal(usage.spent,3.99);assert.equal(usage.warning,null);assert.equal(usage.budget,4.23)})
  remote=5;usage=await (await fetch(base+'/api/usage')).json()
  check('恰好用到 $4 显示提醒，尚可继续调用',()=>{assert.equal(usage.spent,4);assert.match(usage.warning,/达到 \$4 提醒额度/);assert.ok(usage.untilStop>0)})
  cost=0.1;status=200;r=await post()
  check('$4 提醒不会提前停止调用',()=>assert.equal(r.status,200))
  remote=5.23;const atLimit=requests;r=await post()
  check('$4.23 拒绝新调用且不会请求上游',()=>{assert.equal(r.status,402);assert.equal(requests,atLimit)})
  await appendFile(join(root,'.usage/usage.jsonl'),'broken\n');r=await post()
  check('账单损坏时拒绝调用',()=>{assert.equal(r.status,503);assert.equal(requests,atLimit)})
  console.log(`${checks} budget checks passed.`)
} finally { await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true}) }
