// Explicit opt-in only. Each real round changes STOP_AT_USD to current spend + $0.50.
// Local browser storage is isolated; results are saved under ignored .usage/acceptance/.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
const phase=process.argv[2]
if(!['--no-key','--zero','--round1','--round2','--inspect'].includes(phase)) throw Error('Specify --no-key, --zero, --round1, --round2 or --inspect')
const originalEnv=await readFile('.env.local','utf8')
const originalFetch=globalThis.fetch, originalTimeout=globalThis.setTimeout, originalError=console.error
const dom=new JSDOM('',{url:'http://localhost:5188'})
Object.assign(globalThis,{window:dom.window,localStorage:dom.window.localStorage,Event:dom.window.Event})
globalThis.setTimeout=(fn,ms,...args)=>originalTimeout(fn,[900,1200,1600].includes(ms)?0:ms,...args)
let server,outputs=[],errors=[],report={phase,startedAt:new Date().toISOString()}
await mkdir('.usage/acceptance',{recursive:true})
const filename='.usage/acceptance/'+phase.slice(2)+'.json'
const stopEnv=value=>originalEnv.replace(/^STOP_AT_USD=.*$/m,'STOP_AT_USD='+value)
const start=async()=>{server=await createServer({server:{port:5188,strictPort:true,host:'127.0.0.1'}});await server.listen()}
const totals=async()=>{const response=await originalFetch('http://localhost:5188/api/usage');assert.equal(response.status,200);return response.json()}
console.error=(...args)=>{if(args[0]==='[文本校验失败]'){errors.push(args[1]);console.log('VALIDATION FAILURE',JSON.stringify(args[1].errors))}else originalError(...args)}
try {
  if(phase==='--no-key') await unlink('.env.local')
  if(phase==='--zero') await writeFile('.env.local',stopEnv(0),{mode:0o600})
  await start()
  if(phase==='--inspect'){report.usage=await totals();console.log(JSON.stringify(report.usage));}
  else {
    if(phase.startsWith('--round')) {
      const before=await totals();report.before=before
      assert.notEqual(before.remote,null,'Actual spend unavailable; no real testing permitted')
      let first
      if(phase==='--round2') {
        first=JSON.parse(await readFile('.usage/acceptance/round1.json','utf8'))
        assert.ok(!first.blocked,'Round 1 was blocked; do not continue')
        assert.ok(before.spent-first.before.spent<0.5,'Combined test budget too small for another full round')
      }
      report.stopAt=Math.min(before.spent+0.5,4.5,first?first.before.spent+1:Infinity)
      assert.ok(report.stopAt>before.spent)
      console.log('ROUND START',JSON.stringify({spent:before.spent,stopAt:report.stopAt}))
      await server.close();await writeFile('.env.local',stopEnv(report.stopAt),{mode:0o600});await start()
    }
    globalThis.fetch=async(url,options)=>{
      const target=String(url).startsWith('/')?'http://localhost:5188'+url:url
      const response=await originalFetch(target,options)
      if(String(url)==='/api/openrouter/chat/completions') {
        const data=await response.clone().json()
        outputs.push({step:decodeURIComponent(options.headers['X-Phanthy-Step']),status:response.status,text:data.choices?.[0]?.message?.content,usage:data.usage,error:data.error})
        report.outputs=outputs;report.errors=errors
        await writeFile(filename,JSON.stringify(report,null,2))
      }
      return response
    }
    const {useStore}=await server.ssrLoadModule('/src/store/workflowStore.ts')
    const state=()=>useStore.getState(),p=()=>state().projects.find(p=>p.id===state().currentId)
    const round2=phase==='--round2'
    state().createProject('v8 验收 '+phase)
    const script=phase==='--no-key'?(await server.ssrLoadModule('/src/data/mock.ts')).SAMPLE_SCRIPT:await readFile('../测试提示词效果/examples/'+(round2?'老师测试剧本1-1.txt':'示例剧本.txt'),'utf8')
    state().setScript(script)
    const initialBalance=p().balance
    await state().startSegments(round2?'auto':'manual',round2?undefined:30,round2?'3D 卡通':'')
    if(phase==='--zero') {
      assert.equal(p().segStatus,'none');assert.equal(state().step,1);assert.equal(p().balance,initialBalance);assert.match(state().toast,/预算已用到.*已停止调用.*本次未扣费/)
      assert.equal(outputs.length,1);assert.equal(outputs[0].status,402)
      const html=await (await originalFetch('http://localhost:5188/usage')).text();assert.match(html,/累计已花/)
      report.toast=state().toast;report.complete=true;console.log('ZERO BUDGET PASS',state().toast)
    } else {
      const requireDone=(status,label)=>{if(status!=='done')throw Error(label+'：'+state().toast)}
      requireDone(p().segStatus,'segmentation')
      assert.equal(p().script,script)
      if(!round2)assert.equal(p().segments.reduce((n,s)=>n+s.dur,0),30)
      if(round2){assert.match(p().scriptPreface,/人物小传/);assert.ok(!p().segments.some(s=>s.text.includes('人物小传')))}
      console.log('SEGMENTS',JSON.stringify({count:p().segments.length,durations:p().segments.map(s=>s.dur),prefaceChars:p().scriptPreface?.length??0}))
      await state().startAssets();requireDone(p().assetStatus,'assets')
      console.log('ASSETS',JSON.stringify(p().assets.map(a=>({kind:a.kind,name:a.name}))))
      await state().generateAssetImages(p().assets.map(a=>a.id))
      await state().startShots(p().segments.map(s=>s.no));requireDone(p().shotStatus,'shots')
      if(p().shots.length!==p().segments.length || /失败/.test(state().toast))throw Error(state().toast)
      await state().startVideos(p().shots.map(s=>s.id))
      assert.ok(p().shots.every(s=>s.video.versions.length===1&&s.video.versions[0].videoPrompt.includes('时间轴：0–')&&s.video.versions[0].videoPrompt.includes('@图片1')))
      const first=structuredClone(p().shots[0]),oldVersion=structuredClone(first.video.versions[0])
      const duration=first.dur===30?15:30
      state().updateSegment(first.segId,{dur:duration});await state().generateVideos([first.id])
      const shot=p().shots[0]
      assert.equal(shot.video.versions.length,2);assert.deepEqual(shot.video.versions[0],{...oldVersion,preferred:false});assert.equal(shot.video.versions[1].dur,duration)
      assert.notEqual(shot.video.versions[1].videoPrompt,oldVersion.videoPrompt);assert.ok(shot.video.versions[1].videoPrompt.includes(duration+'秒：'))
      if(phase==='--no-key')assert.equal(outputs.length,0)
      report.complete=true;console.log('FULL WORKFLOW PASS',phase)
    }
    report.project=p()
  }
} catch(error) {
  report.complete=false;report.failure=error.message;report.blocked=outputs.some(o=>o.status===402)
  console.log('ACCEPTANCE STOP',error.message)
  process.exitCode=1
} finally {
  if(server){try{report.after=await totals()}catch{}await server.close()}
  report.outputs=outputs;report.errors=errors
  await writeFile(filename,JSON.stringify(report,null,2))
  await writeFile('.env.local',originalEnv.replace(/^STOP_AT_USD=.*$/m,'STOP_AT_USD=4.5'),{mode:0o600})
  globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;console.error=originalError
  dom.window.close()
  console.log('REPORT',filename,JSON.stringify({complete:report.complete,spent:report.after?.spent,roundCost:report.before&&report.after?report.after.spent-report.before.spent:undefined}))
}
