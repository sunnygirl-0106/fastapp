// Runs the real-text client/store against an offline fetch stub; never calls OpenRouter.
process.env.PHANTHY_MOCK = '1'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
const dom = new JSDOM('', { url: 'http://localhost' })
Object.assign(globalThis,{window:dom.window,localStorage:dom.window.localStorage,Event:dom.window.Event})
const originalFetch=globalThis.fetch, originalTimeout=globalThis.setTimeout, originalError=console.error
const validationFailures=[]
console.error=(...args)=>validationFailures.push(args)
globalThis.setTimeout=(fn,ms,...args)=>originalTimeout(fn,[900,1200,1600].includes(ms)?0:ms,...args)
let handler, calls=[]
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'/api/openrouter/chat/completions')
  const body=JSON.parse(options.body);calls.push({body,step:decodeURIComponent(options.headers['X-Phanthy-Step'])})
  return handler(body,calls.length)
}
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',define:{__REAL_TEXT__:'true'}})
let checks=0
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)}
const response=text=>Response.json({choices:[{message:{content:text}}],usage:{prompt_tokens:1,completion_tokens:2,completion_tokens_details:{reasoning_tokens:1},cost:0.001}})
try {
  const {useStore}=await server.ssrLoadModule('/src/store/workflowStore.ts')
  const mock=await server.ssrLoadModule('/src/services/mockText.ts')
  const {jsonl,encodeShot}=await server.ssrLoadModule('/src/services/parse.ts')
  const s=()=>useStore.getState(),p=()=>s().projects.find(p=>p.id===s().currentId)
  const seed=structuredClone(s().projects[0]);seed.script=seed.segments.map(s=>s.text).join('')
  const reset=()=>{useStore.setState({projects:[structuredClone(seed)],currentId:seed.id,step:2,toast:null});calls=[]}
  reset();s().createProject('失败验收');s().setScript('正文保留。');const balance=p().balance
  handler=()=>response('not json')
  await s().startSegments()
  check('首次拆解校验失败只重试一次，原文保留、不扣费、回第 1 步',()=>{assert.equal(calls.length,2);assert.equal(p().script,'正文保留。');assert.equal(p().segStatus,'none');assert.equal(s().step,1);assert.equal(p().balance,balance);assert.match(s().toast,/本次未扣费/)})
  reset();useStore.setState({projects:[{...structuredClone(seed),assetStatus:'none'}]});const original=structuredClone(p().segments),originalConfig=structuredClone(p().config)
  handler=()=>Response.json({error:{message:'预算已用到 $0 / $5，已停止调用'}},{status:402})
  await s().restartSegments('manual',45,'新风格')
  check('重新拆解预算拒绝不重试、保留旧段落、停在第 2 步',()=>{assert.equal(calls.length,1);assert.deepEqual(p().segments,original);assert.equal(p().segStatus,'done');assert.equal(s().step,2);assert.match(s().toast,/预算已用到.*本次未扣费/)})
  check('v9 重新拆解失败回滚时长模式、目标和风格',()=>assert.deepEqual(p().config,originalConfig))
  calls=[];handler=()=>{throw new TypeError('offline')};await s().startAssets()
  check('提取网络失败不重试，状态恢复且原资产保留',()=>{assert.equal(calls.length,1);assert.equal(p().assetStatus,'none');assert.equal(s().step,2);assert.deepEqual(p().assets,seed.assets)})
  reset();s().createProject('剧本设定');s().setScript('# 人物小传\n**小雨**：二十岁。\n\n第一场\n小雨走进房间。')
  handler=()=>response(jsonl([{type:'meta',duration_mode:'manual',total_seconds:9},{type:'segment',ordinal:1,title:'走进房间',text:'第一场\n小雨走进房间。',duration_seconds:9}]))
  await s().startSegments('manual',15,'  3D 卡通  ')
  check('清理 Markdown 后发出请求、存入剧本设定、manual 修正不重试',()=>{assert.equal(calls.length,1);assert.ok(!calls[0].body.messages[1].content.includes('**'));assert.equal(p().segments[0].dur,15);assert.match(p().scriptPreface,/人物小传\n小雨：二十岁/);assert.equal(p().config.shotStyle,'3D 卡通');assert.match(localStorage.getItem('phanthy.projects.v2'),/scriptPreface/)})
  const assetInput=structuredClone(p());handler=()=>response(mock.mockAssets(assetInput).text);await s().startAssets()
  check('风格和剧本设定传入提取消息，资产 ID 由前端生成',()=>{assert.match(calls[1].body.messages[1].content,/风格参考：3D 卡通/);assert.match(calls[1].body.messages[1].content,/小雨：二十岁/);assert.ok(p().assets.every(a=>a.id.startsWith(a.kind+'_')))})
  const beforeCalls=calls.length;await s().startShots([1])
  check('未补齐参考图时 store 也拒绝首次镜头生成',()=>assert.equal(calls.length,beforeCalls))
  await s().generateAssetImages(p().assets.map(a=>a.id))
  const shotInput=structuredClone(p());handler=()=>response(mock.mockShots(shotInput,[1]).text);await s().startShots([1],{s1:22})
  check('字数和禁词提示不会额外调用模型或阻止成功',()=>{assert.equal(calls.length,beforeCalls+1);assert.equal(p().shotStatus,'done');assert.equal(p().shots.length,1)})
  check('镜头消息使用确认后的时长和第 1 步风格',()=>{const user=calls.at(-1).body.messages[1].content;assert.match(user,/（22秒）/);assert.match(user,/风格参考：3D 卡通/)})
  reset()
  const many={...structuredClone(seed),segments:Array.from({length:13},(_,i)=>({...seed.segments[i%3],id:'s'+(i+1),no:i+1})),shots:[]}
  many.assets.forEach(a=>a.belongSegs=many.segments.map(s=>s.no))
  useStore.setState({projects:[many]})
  handler=(body,n)=>{
    const user=body.messages[1].content, nums=user.match(/本次需要生成镜头的段号：([^\n]+)/)[1].split(',').map(Number)
    if(nums[0]===7) return response('invalid batch')
    return response(mock.mockShots(many,nums).text)
  }
  const beforeBalance=p().balance;await s().startShots(many.segments.map(s=>s.no))
  check('13 段分批 6/6/1，中批失败只重试一次，不影响其他批',()=>{assert.equal(calls.length,4);assert.deepEqual(p().shots.map(s=>s.segId),['s1','s2','s3','s4','s5','s6','s13']);assert.equal(p().balance,beforeBalance-7*50);assert.equal(p().shotStatus,'done');assert.match(s().toast,/6 个段落生成失败/)})
  check('后一批包含上一批最后段的相邻镜头',()=>{assert.match(calls[1].body.messages[1].content,/相邻段落的已有镜头/);assert.match(calls[1].body.messages[1].content,/"segment_ordinal":6/)})
  // Old content + queued changes must survive a failed generation, and transient maps must clear.
  reset();let release
  handler=()=>new Promise(resolve=>{release=()=>resolve(Response.json({error:{message:'offline'}},{status:503}))})
  const oldShot=structuredClone(p().shots[0]),oldBalance=p().balance
  const work=s().generateShots([1]);await Promise.resolve();s().updateSegment('s1',{text:p().segments[0].text+'生成中修改。'});release();await work
  check('失败镜头保留旧内容和生成中的联动改动、不扣费',()=>{assert.equal(p().shots[0].shot,oldShot.shot);assert.equal(p().balance,oldBalance);assert.ok(p().shots[0].outdated.length)})
  const retryInput=structuredClone(p());handler=()=>response(mock.mockShots(retryInput,[1]).text);await s().generateShots([1])
  check('失败后的临时状态已清理，下一次生成可正常清除待更新',()=>{assert.equal(p().shotStatus,'done');assert.deepEqual(p().shots[0].outdated,[])})
  check('校验失败保留原始文本及错误供排查',()=>assert.ok(validationFailures.some(args=>args[1]?.raw==='not json')))
  console.log(`${checks} text runtime checks passed.`)
} finally {globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;console.error=originalError;await server.close();dom.window.close()}
