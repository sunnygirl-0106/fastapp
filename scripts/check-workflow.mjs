// Run with: node scripts/check-workflow.mjs. Uses existing Vite/React/jsdom only.
// Isolated localStorage and accelerated mock delays; never touches browser projects.
process.env.PHANTHY_MOCK = '1'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
const realTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...args) => realTimeout(fn, [900, 1200, 1400, 1600].includes(ms) ? 0 : ms, ...args)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const results = []
try {
  const { useStore, migrateProjects } = await server.ssrLoadModule('/src/store/workflowStore.ts')
  const utils = await server.ssrLoadModule('/src/utils/project.ts')
  const { videoCost } = await server.ssrLoadModule('/src/services/generation.ts')
  const { supportsDuration, clampDuration } = await server.ssrLoadModule('/src/data/duration.ts')
  const { stepLocked, stepUnlocked } = await server.ssrLoadModule('/src/components/StepBar.tsx')
  const templates = await server.ssrLoadModule('/src/data/assetTemplates.ts')
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { Simulate } = await import('react-dom/test-utils')
  const { act } = React
  const state = () => useStore.getState()
  const p = () => state().projects.find((p) => p.id === state().currentId)
  const check = (name, fn) => { fn(); results.push(name); console.log(`PASS ${name}`) }
  const seed = structuredClone(state().projects[0])
  seed.script = seed.segments.map(s=>s.text).join('')
  const earlyMock = await server.ssrLoadModule('/src/services/mockText.ts')
  const earlyParse = await server.ssrLoadModule('/src/services/parse.ts')
  seed.shots = earlyParse.parseShots(earlyMock.mockShots(seed,[1,2,3]).text,seed,[1,2,3])
  const reset = (project = seed) => useStore.setState({ projects: [structuredClone(project)], currentId: project.id, step: 1, toast: null })
  // v9 replaces the former two independent stale-state contracts.
  const reasons = (shot = p().shots[0]) => shot.outdated ?? []
  const hasA = shot => reasons(shot).some(r => r.kind !== 'video')
  const hasB = shot => reasons(shot).some(r => r.kind === 'video')
  const hasReason = (shot,text) => reasons(shot).some(r=>r.text===text)
  let work
  for (const [target,count] of [[60,3],[120,4],[91,4],[300,10],[600,20],[8,2],[4,1]]) {
    state().createProject(`v9 ${target} 秒`);state().setScript(seed.script)
    work=state().startSegments('manual',target,'  3D 卡通  ')
    check(`${target} 秒确认即推进与剧本锁定`,()=>{assert.equal(state().step,2);assert.equal(p().segStatus,'generating');assert.deepEqual(stepLocked(p()),[true,false,false,false,false])})
    state().setScript('不能覆盖')
    await work
    check(`${target} 秒 mock 拆解精确合计，尽量 5 秒一档`,()=>{
      assert.equal(p().segments.length,count);assert.equal(p().segments.reduce((n,s)=>n+s.dur,0),target)
      assert.ok(p().segments.every(s=>s.dur>=4&&s.dur<=30))
      if(target>=count*5) assert.equal(p().segments.filter(s=>s.dur%5).length,target%5?1:0)
      assert.equal(p().segments.map(s=>s.text).join('').replace(/\s/g,''),seed.script.replace(/\s/g,''))
      assert.equal(p().script,seed.script);assert.equal(p().config.shotStyle,'3D 卡通')
    })
  }
  await state().restartSegments('auto',undefined,'  ')
  check('提取前允许重新拆解并清空风格',()=>{assert.equal(p().config.durMode,'auto');assert.equal(p().config.shotStyle,undefined);assert.ok(p().segments.every(s=>s.dur%5===0))})
  work=state().startAssets()
  check('提取确认即推进',()=>{assert.equal(state().step,3);assert.equal(p().assetStatus,'generating')})
  await work
  const beforeLocked=structuredClone(p())
  await state().restartSegments('manual',60,'不应写入')
  check('提取开始后禁止重新拆解或改风格',()=>assert.deepEqual(p(),beforeLocked))
  await state().startShots([1])
  check('首次镜头生成必须补齐全部参考图',()=>{assert.equal(p().shots.length,0);assert.equal(p().shotStatus,'none');assert.equal(utils.shotGenerationBlocked(p()),'请先补齐全部参考图')})
  await state().generateAssetImages(p().assets.map(a=>a.id))
  work=state().startShots(p().segments.map(s=>s.no))
  check('镜头确认即推进',()=>{assert.equal(state().step,4);assert.equal(p().shotStatus,'generating')})
  await work
  check('镜头字段完整且沿用段落时长',()=>{assert.equal(p().shots.length,p().segments.length);assert.ok(p().shots.every(s=>s.dur===p().segments.find(seg=>seg.id===s.segId).dur));assert.ok(p().shots.every(s=>!reasons(s).length))})
  work=state().startVideos(p().shots.map(s=>s.id))
  check('视频确认即推进',()=>{assert.equal(state().step,5);assert.ok(p().shots.every(s=>s.video.state==='generating'))})
  await work
  check('视频成功追加版本并采用，首次不标待更新',()=>{assert.ok(p().shots.every(s=>s.video.versions.length===1&&s.video.versions[0].preferred));assert.ok(p().shots.every(s=>!reasons(s).length))})
  check('整数时长边界、费用及模型支持范围',()=>{assert.equal(clampDuration(3),4);assert.equal(clampDuration(40),30);assert.equal(clampDuration(7.8),8);assert.equal(videoCost(15)+videoCost(12),4253);assert.ok(!supportsDuration('Kling 2.1',15));assert.ok(supportsDuration('Kling 2.1',10));assert.ok(supportsDuration('Seedance 2.0',12))})

  reset();state().updateSegment('s1',{text:p().segments[0].text+'修改。'})
  check('A：无视频修改原文也标镜头',()=>{assert.ok(hasA(p().shots[0]));assert.ok(p().shots.slice(1).every(s=>!reasons(s).length))})
  state().updateSegment('s1',{text:'再改。'});state().updateSegmentTitle('s1','新标题')
  check('A：同原因去重，标题不新增原因',()=>assert.deepEqual(reasons(),[{kind:'segText',text:'段落原文已修改'}]))
  state().dismissOutdated('sh1');state().updateSegment('s1',{text:'仅纠错。'},{silent:true})
  check('保留清除；静默改原文不触发',()=>assert.deepEqual(reasons(),[]))
  state().addAsset('char',{name:'仅纠错',prompt:'短发，白色衬衣。'})
  check('A：新增角色只标原文包含名称的段落镜头',()=>{assert.equal(reasons().length,1);assert.ok(hasA(p().shots[0]));assert.ok(p().shots.slice(1).every(s=>!reasons(s).length))})
  reset();state().deleteAsset('a2')
  check('A：删除资产标全部引用镜头并移除 assetIds',()=>{assert.ok(p().shots.every(hasA));assert.ok(p().shots.every(s=>!s.assetIds.includes('a2')))})
  state().dismissAllOutdated()
  check('全部保留清除所有原因',()=>assert.ok(p().shots.every(s=>!reasons(s).length)))

  reset();state().updateSegment('s1',{dur:12});state().updateShot('sh1',{action:'抬手'});state().clearAssetImage('a2');state().updateAsset('a2',{prompt:'新生图提示词'})
  check('B：没有视频时，时长、字段、参考图修改不标记',()=>assert.ok(p().shots.every(s=>!reasons(s).length)))
  reset();await state().generateVideos(['sh1','sh2','sh3'])
  const firstVersions=structuredClone(p().shots.map(s=>s.video.versions))
  state().updateSegment('s1',{dur:12});state().updateSegment('s1',{dur:15})
  check('B：有视频改时长，改回仍待更新',()=>{assert.ok(hasB(p().shots[0]));assert.ok(hasReason(p().shots[0],'时长改为 15 秒'));assert.equal(p().shots[0].dur,15)})
  state().updateShot('sh1',{action:'抬手'});state().updateShot('sh1',{timeline:'1. 抬手\n（2）转头'})
  check('B：手改字段与节拍原因去重，统一序号存储',()=>{assert.equal(reasons().filter(r=>r.key==='shotEdit').length,1);assert.equal(p().shots[0].timeline,'① 抬手\n② 转头')})
  state().clearAssetImage('a2')
  check('B：清图标引用该资产的已有视频',()=>assert.ok(p().shots.every(s=>hasReason(s,'角色「苏可」参考图已更新'))))
  state().dismissAllOutdated();await state().generateAssetImages(['a2'])
  check('B：换图标引用该资产的已有视频',()=>assert.ok(p().shots.every(hasB)))
  state().dismissAllOutdated();state().updateAsset('a2',{prompt:'外观修订'})
  check('生图提示词编辑从不触发待更新',()=>assert.ok(p().shots.every(s=>!reasons(s).length)))
  state().updateSegment('s1',{text:p().segments[0].text+'修改。'});await state().regenerateShot('sh1')
  check('有视频重新生成镜头成功替换为一条 B 原因，旧版本保留',()=>{assert.deepEqual(reasons(),[{kind:'video',key:'shotEdit',text:'镜头已重新生成'}]);assert.deepEqual(p().shots.map(s=>s.video.versions),firstVersions)})
  await state().generateVideos(['sh1'])
  check('视频成功清除全部原因，追加新版本并自动采用',()=>{assert.deepEqual(reasons(),[]);assert.deepEqual(p().shots[0].video.versions.map(v=>v.tag),['v1','v2']);assert.deepEqual(p().shots[0].video.versions.map(v=>v.preferred),[false,true]);assert.deepEqual(p().shots[0].video.versions[0],{...firstVersions[0][0],preferred:false})})
  reset();state().updateSegment('s1',{text:p().segments[0].text+'修改。'});await state().regenerateShot('sh1')
  check('无视频重新生成镜头成功清除原因',()=>assert.deepEqual(reasons(),[]))
  const others=structuredClone(p().shots.slice(1));await state().generateShots([1])
  check('局部生成不修改其他镜头',()=>assert.deepEqual(p().shots.slice(1),others))

  reset();const oldAssetCount=p().assets.length
  state().addAsset('scene',{name:'苏可',prompt:'房间'});state().addAsset('char',{name:'新角色',prompt:'  '});state().renameAsset('a2','客厅',true)
  check('跨角色场景重名和空生图提示词在 store 拒绝',()=>{assert.equal(p().assets.length,oldAssetCount);assert.equal(p().assets[1].name,'苏可')})
  state().addAsset('char',{name:'苏可妈妈',prompt:'银色短发。'})
  p().shots[0].shot='@苏可妈妈和@苏可';p().shots[0].timeline='① @苏可妈妈转头\n② @苏可抬手'
  const originalSource=p().segments[0].text
  state().renameAsset('a2','小可',false)
  check('@ 引用始终跟随改名，长名称不被部分替换',()=>{assert.equal(p().shots[0].shot,'@苏可妈妈和@小可');assert.equal(p().shots[0].timeline,'① @苏可妈妈转头\n② @小可抬手');assert.equal(p().segments[0].text,originalSource);assert.deepEqual(reasons(),[])})
  check('改名弹窗只报告普通文本，过滤 @引用',()=>{const project=structuredClone(p());project.segments.forEach(s=>s.text='');project.shots.forEach(s=>{for(const k of ['shot','timeline','action','anchor','motion','blocking','continuity','subject','forbid','background'])s[k]='@小可 @苏可妈妈'});assert.deepEqual(utils.renameOccurrences(project,'小可'),[])})
  await state().generateVideos(['sh1','sh2']);state().updateShot('sh2',{action:'小可转身'});state().dismissOutdated('sh2');state().renameAsset('a2','小雨',true)
  check('同步替换仅给普通文字被替换的已有视频加 B 原因',()=>{assert.deepEqual(reasons(p().shots[0]),[]);assert.ok(hasB(p().shots[1]));assert.equal(p().shots[1].action,'小雨转身');assert.equal(p().shots[0].shot,'@苏可妈妈和@小雨')})

  check('旧资产 prompt 空才回退 desc，加载后删除 desc',()=>{const old=structuredClone(seed);old.assets[0].desc='旧描述';old.assets[0].prompt=' ';old.assets[1].desc='不用';const migrated=migrateProjects([old])[0];assert.equal(migrated.assets[0].prompt,'旧描述');assert.equal(migrated.assets[1].prompt,seed.assets[1].prompt);assert.ok(migrated.assets.every(a=>!('desc'in a)))})
  check('旧 stale 迁移为 B 原因，删除旧字段，迁移幂等',()=>{const old=structuredClone(seed);old.shots[0].video={state:'done',versions:[{tag:'v1',dur:15,createdAt:1,preferred:true}],stale:true,staleReason:'旧视频提示'};old.shots[0].outdated=[{kind:'segText',text:'原文修改'}];const migrated=migrateProjects([old])[0];assert.ok(hasA(migrated.shots[0]));assert.ok(hasB(migrated.shots[0]));assert.ok(!('stale'in migrated.shots[0].video));assert.ok(!('staleReason'in migrated.shots[0].video));assert.deepEqual(migrateProjects([structuredClone(migrated)])[0],migrated)})
  reset();await state().generateVideos(['sh1']);state().updateSegment('s1',{dur:12});state().dismissOutdated('sh1')
  check('保留后再次加载不会因视频时长不同重新标记',()=>assert.deepEqual(migrateProjects([structuredClone(p())])[0].shots[0].outdated,[]))
  reset();state().addSegment('新段','走出房间。',8)
  check('新增段落允许任意整数时长，列为未生成',()=>{assert.equal(p().segments.at(-1).dur,8);assert.deepEqual(utils.ungeneratedSegments(p()).map(s=>s.no),[4])})
  await state().generateShots([4]);await state().generateVideos([p().shots.at(-1).id]);state().deleteSegment('s2')
  check('删除段落级联镜头，重排编号且其他视频保留',()=>{assert.ok(!p().shots.some(s=>s.segId==='s2'));assert.deepEqual(p().shots.map(s=>s.no),[1,2,3]);assert.equal(p().shots.at(-1).video.versions.length,1)})
  // Mounted component checks: actual controls/events, not source-string assertions.
  let root
  const container = document.getElementById('root')
  const mount = async (path, props) => {
    if (root) await act(async()=>root.unmount())
    const Component = (await server.ssrLoadModule(path)).default
    root=createRoot(container); await act(async()=>root.render(React.createElement(Component,props)))
  }
  const buttons=()=>[...container.querySelectorAll('button')]
  const button=(text)=>buttons().find((b)=>b.textContent.trim()===text)
  const click=async(el)=>{assert.ok(el,'control exists');await act(async()=>Simulate.click(el))}
  const change=async(el,value)=>{assert.ok(el,'input exists');await act(async()=>{el.value=value;Simulate.change(el)})}
  const mountLive = async (path, props = {}, withSteps = false) => {
    if (root) await act(async()=>root.unmount())
    const Component = (await server.ssrLoadModule(path)).default
    const StepBar = (await server.ssrLoadModule('/src/components/StepBar.tsx')).default
    function Live() {
      const project = useStore((s) => s.projects.find((p) => p.id === s.currentId))
      return React.createElement(React.Fragment, null, withSteps && React.createElement(StepBar,{project}),React.createElement(Component,{...props,project}))
    }
    root=createRoot(container); await act(async()=>root.render(React.createElement(Live)))
  }
  const resetLive = async () => {
    if(root) { await act(async()=>root.unmount()); root=undefined }
    reset()
  }
  const tick = async(ms) => act(async()=>new Promise(r=>realTimeout(r,ms)))
  const toggleCheckbox = async(el,checked) => {assert.ok(el);await act(async()=>{el.checked=checked;Simulate.change(el)})}
  const dots = () => container.querySelectorAll('.bg-amber-400.ring-\\[1\\.5px\\]')
  const pausedGeneration = async(ms, run) => {
    const previous = globalThis.setTimeout
    const pending = []
    globalThis.setTimeout = (fn, delay, ...args) => delay === ms ? (pending.push(() => fn(...args)), 0) : previous(fn, delay, ...args)
    const release = async() => { assert.ok(pending.length,'generation is waiting'); await act(async()=>pending.shift()()) }
    try { await run(release) } finally { globalThis.setTimeout = previous }
  }
  await resetLive()
  await pausedGeneration(1600,async release=>{
    work=state().generateShots([1]);state().updateSegment('s1',{text:'苏可站在客厅。'});state().updateSegment('s1',{text:'苏可坐在客厅。'})
    await release();await work
  })
  check('生成镜头期间 A 原因补回且同类去重',()=>assert.deepEqual(reasons(),[{kind:'segText',text:'段落原文已修改'}]))
  await state().generateShots([1])
  check('下一次镜头生成清理上一次积压',()=>assert.deepEqual(reasons(),[]))
  await resetLive();await state().generateVideos(['sh1'])
  await pausedGeneration(1600,async release=>{
    work=state().generateShots([1]);state().updateShot('sh1',{action:'生成期间改动作'});state().clearAssetImage('a2')
    await release();await work
  })
  check('已有视频重新生成镜头期间 B 原因也补回',()=>{assert.ok(hasReason(p().shots[0],'镜头描述已修改'));assert.ok(hasReason(p().shots[0],'角色「苏可」参考图已更新'))})
  await resetLive()
  await pausedGeneration(1200,async release=>{
    work=state().generateVideos(['sh1']);state().updateShot('sh1',{action:'生成期间抬手'});state().updateSegment('s1',{text:'修改原文。'});state().clearAssetImage('a2');state().updateSegment('s1',{dur:12})
    await release();await work
  })
  check('首个视频生成期间 A/B 改动全部补回',()=>{assert.ok(hasA(p().shots[0]));assert.ok(hasB(p().shots[0]));assert.ok(hasReason(p().shots[0],'时长改为 12 秒'));assert.ok(hasReason(p().shots[0],'角色「苏可」参考图已更新'));assert.equal(p().shots[0].video.versions[0].dur,15)})
  state().dismissOutdated('sh1');await state().generateVideos(['sh1'])
  check('后续成功视频不会继承旧积压原因',()=>assert.deepEqual(reasons(),[]))
  await resetLive()
  await pausedGeneration(1200,async release=>{
    const first=state().generateVideos(['sh1'])
    const second=structuredClone(seed);second.id='second-project';useStore.setState({projects:[...state().projects,second],currentId:second.id})
    const secondWork=state().generateVideos(['sh1']);state().updateShot('sh1',{action:'只修改第二个项目'})
    await release();await first;await release();await secondWork
  })
  check('相同镜头 ID 的生成积压按项目隔离',()=>{assert.deepEqual(state().projects[0].shots[0].outdated,[]);assert.ok(hasB(state().projects[1].shots[0]))})
  await resetLive()
  await pausedGeneration(1600,async release=>{
    const first=state().generateShots([1])
    const second=structuredClone(seed);second.id='second-project';useStore.setState({projects:[...state().projects,second],currentId:second.id})
    const secondWork=state().generateShots([1]);state().updateSegment('s1',{text:'第二项目修改'})
    await release();await first;await release();await secondWork
  })
  check('相同段落 ID 的镜头积压按项目隔离',()=>{assert.deepEqual(state().projects[0].shots[0].outdated,[]);assert.ok(hasA(state().projects[1].shots[0]))})

  await resetLive()
  await pausedGeneration(1600,async release=>{
    work=state().generateShots([1]);state().renameAsset('a2','生成期间新名字',false)
    await release();await work
  })
  check('生成期间改名，返回结果所有 @引用也使用最新名',()=>{assert.ok(p().shots[0].shot.includes('@生成期间新名字'));assert.ok(!p().shots[0].timeline.includes('@苏可'));assert.deepEqual(reasons(),[])})
  await resetLive();await state().generateVideos(['sh1'])
  const beforeFailure=structuredClone(p().shots[0].video),balanceBeforeFailure=p().balance,previousTimeout=globalThis.setTimeout
  globalThis.setTimeout=(fn,ms,...args)=>{if(ms===1200)throw Error('模拟视频服务失败');return previousTimeout(fn,ms,...args)}
  try{await state().generateVideos(['sh1'])}finally{globalThis.setTimeout=previousTimeout}
  check('视频失败不扣费、不占版本号、旧版本保留',()=>{assert.deepEqual(p().shots[0].video,beforeFailure);assert.equal(p().balance,balanceBeforeFailure);assert.match(state().toast,/视频生成失败/)})
  await state().generateVideos(['sh1'])
  check('失败后下次视频继续从 v2 追加',()=>assert.deepEqual(p().shots[0].video.versions.map(v=>v.tag),['v1','v2']))
  await resetLive()
  await pausedGeneration(1200,async release=>{
    work=state().generateVideos(['sh1']);state().updateSegment('s1',{text:'并发修改'})
    await state().generateShots([1]);await release();await work
  })
  check('镜头和视频同时生成使用同一原因队列且互不清空',()=>{assert.ok(hasA(p().shots[0]));assert.ok(hasReason(p().shots[0],'镜头已重新生成'))})

  // Mounted controls use the actual React event paths, including auto-save.
  await resetLive()
  let saved
  await mount('/src/components/DurationStepper.tsx',{value:15,title:'段落时长',variant:'inline',onChange:n=>{saved=n}})
  let input=container.querySelector('input')
  await change(input,'3');await act(async()=>Simulate.blur(input))
  check('时长越界收回并提示',()=>{assert.equal(input.value,'4');assert.ok(container.querySelector('.text-red-400'))})
  saved=undefined;await change(input,'12');await act(async()=>Simulate.keyDown(input,{key:'Escape'}))
  check('时长 Escape 取消',()=>{assert.equal(input.value,'15');assert.equal(saved,undefined)})
  await change(input,'12');await act(async()=>Simulate.keyDown(input,{key:'Enter'}))
  check('时长 Enter 保存',()=>assert.equal(saved,12))
  await mount('/src/steps/VideoConfirmModal.tsx',{shots:[{...seed.shots[0],dur:15},{...seed.shots[1],dur:12,outdated:[{kind:'segText',text:'修改'}]}],balance:10000,onClose(){},onConfirm(){}})
  await click(button('Seedance 2.5'))
  check('视频确认按时长置灰模型且删除旧描述提示',()=>{assert.equal(button('Kling 2.1').disabled,true);assert.equal(button('Seedance 2.0').disabled,false);assert.equal(button('确认并生成 2 段视频').disabled,false);assert.ok(!container.textContent.includes('仍会按旧描述生成'));assert.ok(container.textContent.includes('4,253'))})
  await resetLive();await mountLive('/src/steps/Step2Segments.tsx')
  check('提取后重新拆解禁用，原文标题仍可编辑',()=>{assert.equal(button('重新拆解').disabled,true);assert.equal(container.querySelectorAll('button[title="点击编辑标题"]').length,3)})
  await click(container.querySelector('button[title="点击编辑原文"]'));let textarea=container.querySelector('textarea');await change(textarea,'自动保存验收原文')
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  check('原文编辑 Escape 立即保存且第 2 步显示统一标签',()=>{assert.equal(p().segments[0].text,'自动保存验收原文');assert.ok(button('待更新'));assert.ok(!container.textContent.includes('镜头待更新'))})
  await click(button('待更新'))
  check('无视频的统一弹框包含标题、保留、生成镜头',()=>{assert.ok(container.textContent.includes('镜头 01 待更新'));assert.ok(button('保留'));assert.ok(button('✦50 重新生成镜头'));assert.ok(!buttons().some(b=>b.textContent.endsWith('重新生成视频')))})
  await click(button('保留'))
  check('第 2 步保留清除同一 shot.outdated',()=>assert.deepEqual(reasons(),[]))

  await resetLive();await state().generateVideos(['sh2']);state().updateShot('sh2',{action:'只影响视频'});state().updateSegment('s1',{text:'影响镜头设计'});state().addSegment('新增段','新增内容',8)
  await mount('/src/steps/GenShotModal.tsx',{project:p(),onClose(){},onConfirm(){}})
  check('生成镜头默认仅选无镜头段落与 A 类原因',()=>assert.deepEqual([...container.querySelectorAll('input[aria-label^="选择段落"]')].map(i=>i.checked),[true,false,false,true]))
  await resetLive();await state().generateVideos(['sh1']);state().updateShot('sh1',{action:'只影响视频'})
  await mount('/src/steps/GenShotModal.tsx',{project:p(),onClose(){},onConfirm(){}})
  check('只有 B 原因或全部最新时不回退为全选镜头',()=>assert.ok([...container.querySelectorAll('input[aria-label^="选择段落"]')].every(i=>!i.checked)))
  await resetLive();await state().generateVideos(['sh1','sh2']);state().updateShot('sh2',{action:'待更新动作'})
  await mountLive('/src/steps/Step4Shots.tsx')
  check('第 4 步默认选无视频和待更新镜头',()=>{const rows=p().shots.map(s=>container.querySelector(`#shot-${s.id} input[type="checkbox"]`).checked);assert.deepEqual(rows,[false,true,true])})
  check('顶部提示条统一计数与全部保留',()=>{assert.ok(container.textContent.includes('1 个镜头待更新'));assert.ok(button('全部保留'));assert.equal(container.querySelectorAll('#shot-sh2 button[title]').length>0,true)})
  await click(button('待更新'))
  check('有视频统一弹框三个操作顺序正确',()=>{const pop=button('保留').parentElement;assert.deepEqual([...pop.querySelectorAll('button')].map(b=>b.textContent.replace(/✦[\d,]+ /,'')),['保留','重新生成镜头','重新生成视频'])})
  await click(buttons().find(b=>b.textContent.startsWith('✦')&&b.textContent.endsWith('重新生成视频')))
  check('重新生成视频打开当前镜头确认框',()=>assert.ok(button('确认并生成 1 段视频')))
  await click(button('取消'));await click(button('全部保留'))
  check('全部保留后标签和提示条消失、视频保留',()=>{assert.ok(!button('待更新'));assert.ok(!button('全部保留'));assert.equal(p().shots[1].video.versions.length,1)})
  await act(async()=>state().updateShot('sh1',{action:'成片页待更新'}));await mountLive('/src/steps/Step5Video.tsx');await click(button('待更新'))
  await click(buttons().find(b=>b.textContent.startsWith('✦')&&b.textContent.endsWith('重新生成视频')))
  check('第 5 步相同标签的视频操作返回镜头页',()=>assert.equal(state().step,4))

  await resetLive();await mountLive('/src/steps/Step3Assets.tsx')
  await click(button('新增角色'))
  check('资产新增只保留一个生图提示词输入框，必填',()=>{assert.equal(container.querySelectorAll('textarea').length,1);assert.ok(container.textContent.includes('生图提示词'));assert.equal(button('添加').disabled,true)})
  await change(container.querySelector('input[aria-label="角色名称"]'),'客厅');await change(container.querySelector('textarea'),'木门与窗户')
  check('新增跨类型重名显示指定错误，禁用保存',()=>{assert.ok(container.textContent.includes('名称已被其他角色或场景使用'));assert.equal(button('添加').disabled,true)})
  await change(container.querySelector('input[aria-label="角色名称"]'),'新角色');await change(container.querySelector('textarea'),'   ')
  check('空白生图提示词仍不能新增',()=>assert.equal(button('添加').disabled,true))
  await change(container.querySelector('textarea'),'黑色短发，穿白色衬衣。');await click(button('添加'))
  check('新增保存用户提示词且没有 desc 或默认拼接',()=>{const a=p().assets.at(-1);assert.equal(a.prompt,'黑色短发，穿白色衬衣。');assert.ok(!('desc'in a))})
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('编辑角色设定'))
  await change(container.querySelector('textarea'),'蓝色外套。')
  check('资产编辑只有生图提示词，不出现静默勾选',()=>{assert.equal(container.querySelectorAll('textarea').length,1);assert.ok(!container.textContent.includes('这次修改不影响'));assert.ok(container.querySelector('textarea').placeholder.includes('版式和风格会自动添加'))})
  await change(container.querySelector('input[aria-label="角色名称"]'),'客厅')
  check('改名也检查场景重名',()=>assert.equal(button('保存').disabled,true))
  await change(container.querySelector('input[aria-label="角色名称"]'),'小可');await click(button('保存'))
  check('改名同步预览包含普通原文，不列镜头 @引用',()=>{assert.ok(document.body.textContent.includes('同步替换段落和镜头文本？'));assert.ok(document.body.textContent.includes('段落 01 · 原文'));assert.ok(!document.body.textContent.includes('镜头 01 · 画面描述'))})
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='仅修改名称'))
  check('仅改名称仍更新 @引用且不触发状态',()=>{assert.ok(p().shots[0].shot.includes('@小可'));assert.ok(!reasons().length);assert.equal(p().assets[1].prompt,'蓝色外套。')})

  await resetLive();await mountLive('/src/steps/Step4Shots.tsx')
  await click(buttons().find(b=>b.textContent.startsWith('字段')))
  const initialFields=container.querySelectorAll('#shot-sh1 .cursor-text').length
  await click(button('背景范围'))
  check('字段显隐仍可用',()=>assert.equal(container.querySelectorAll('#shot-sh1 .cursor-text').length,initialFields+1))
  await act(async()=>Simulate.mouseDown(container.querySelector('.fixed.inset-0.z-50')))
  await click(button('筛选'));await change(container.querySelector('input[placeholder]'),'快速跟摇')
  dom.window.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true'}
  await click(container.querySelector('button[title="定位到该镜头"]'))
  check('筛选预览定位闪动保持',()=>{assert.ok(container.querySelector('#shot-sh3.row-flash'));assert.equal(container.querySelector('#shot-sh3').dataset.scrolled,'true')})
  await click(container.querySelector('#shot-sh1 .cursor-text'))
  textarea=container.querySelector('textarea');await change(textarea,'@苏可站在@客厅。');await tick(750)
  check('单元格自动保存继续有效',()=>assert.equal(p().shots[0].shot,'@苏可站在@客厅。'))
  await act(async()=>Simulate.keyDown(textarea,{key:'Escape'}))
  check('保存后 @恢复角色/场景标签',()=>{assert.ok(container.querySelector('#shot-sh1 .text-brand-light'));assert.ok(container.querySelector('#shot-sh1 .text-violet-200'))})
  await click(container.querySelectorAll('#shot-sh1 .cursor-text')[1]);textarea=container.querySelector('textarea')
  check('节拍单元格编辑不显示序号',()=>assert.ok(!/[①-⑳]/.test(textarea.value)))
  await change(textarea,'1. @苏可抬头\n\n（2）@苏可转身');await act(async()=>Simulate.keyDown(textarea,{key:'Escape'}))
  check('节拍保存去多种序号空行，显示自动编号',()=>{assert.equal(p().shots[0].timeline,'① @苏可抬头\n② @苏可转身');assert.ok(container.querySelectorAll('#shot-sh1 .cursor-text')[1].textContent.includes('① @苏可抬头'))})
  await click(container.querySelector('#shot-sh1 button[title="更多"]'));await click(button('编辑镜头详情'))
  check('详情抽屉节拍同样不含序号',()=>{assert.equal(container.querySelectorAll('textarea')[1].value,'@苏可抬头\n@苏可转身');assert.ok(container.querySelectorAll('textarea').length>=7)})
  await change(container.querySelectorAll('textarea')[1],'① 抬头\n2、转身');await tick(750)
  check('抽屉自动保存统一节拍格式',()=>assert.equal(p().shots[0].timeline,'① 抬头\n② 转身'))

  await resetLive()
  const mentions=await server.ssrLoadModule('/src/utils/mentions.ts')
  const mentionAssets=[{...seed.assets[1],name:'小雨'},{...seed.assets[0],name:'小雨妈妈',imageUrl:undefined},{...seed.assets[2],name:'房间'}]
  check('最长名称解析用于显示与改名，未知 @保留文字',()=>{assert.deepEqual(mentions.mentionParts('@小雨妈妈与@小雨在@房间',mentionAssets.map(a=>a.name)).filter(p=>p.mention).map(p=>p.name),['小雨妈妈','小雨','房间']);assert.equal(mentions.stripUnknownMentions('@小雨和@错误角色',mentionAssets.map(a=>a.name)),'@小雨和错误角色')})
  await mount('/src/components/MentionText.tsx',{text:'@小雨妈妈与@小雨在@房间，@错误角色',assets:mentionAssets})
  check('角色/场景标签样式、未知引用红色虚线',()=>{assert.equal(container.querySelectorAll('.text-brand-light').length,2);assert.equal(container.querySelectorAll('.text-violet-200').length,1);assert.equal(container.querySelector('.text-red-300').title,'找不到这个角色或场景');assert.ok(container.querySelector('.text-red-300').classList.contains('decoration-dashed'))})
  await act(async()=>Simulate.mouseEnter(container.querySelector('.text-brand-light')))
  check('无图悬停卡片显示角色名称和缺图文案',()=>{assert.ok(document.querySelector('[role="tooltip"]').textContent.includes('角色 · 小雨妈妈'));assert.ok(document.querySelector('[role="tooltip"]').textContent.includes('还没有参考图'))})
  await mount('/src/components/MentionText.tsx',{text:'@图片1',assets:[],references:[{assetId:'deleted',name:'历史房间',kind:'scene',imageUrl:'old-reference.png',label:'@图片1'}]})
  await act(async()=>Simulate.mouseEnter(container.querySelector('.text-violet-200')))
  check('快照 @图片N 使用历史资产类别与参考图',()=>{assert.equal(document.querySelector('[role="tooltip"] img').getAttribute('src'),'old-reference.png');assert.ok(document.querySelector('[role="tooltip"]').textContent.includes('场景 · 历史房间'))})
  await resetLive()
  // Prompt protocol and immutable generation inputs.
  const protocol = await server.ssrLoadModule('/src/services/parse.ts')
  const prompts = await server.ssrLoadModule('/src/services/prompts.ts')
  const mockText = await server.ssrLoadModule('/src/services/mockText.ts')
  const videoPrompts = await server.ssrLoadModule('/src/services/videoPrompt.ts')
  check('v9 未知 @在视频提示词和已有/相邻镜头消息里去除',()=>{
    const project=structuredClone(seed)
    project.shots[0].shot='@苏可和@错字在@客厅';project.shots[1].timeline='① @错误抬手\n② @苏可转身'
    const text=prompts.buildShotUserMessage(project,[1],[project.shots[0]])
    assert.ok(!text.includes('@错字'));assert.ok(!text.includes('@错误'));assert.ok(text.includes('错字'));assert.ok(text.includes('@苏可'))
    const video=videoPrompts.buildVideoPrompt(project.shots[0],project,15)
    assert.ok(!/@(?!图片\d+)/.test(video));assert.ok(video.includes('错字'));assert.ok(video.includes('@图片'))
    assert.equal(project.shots[0].shot,'@苏可和@错字在@客厅')
  })
  const captureWarnings = (fn) => {
    const savedWarn = console.warn, warnings = []
    console.warn = (...args) => warnings.push(args.join(' '))
    try { fn(); return warnings } finally { console.warn = savedWarn }
  }
  check('提示词：三段系统提示词与原文逐字一致（SHA-256）',()=>{
    const source=readFileSync('../测试提示词效果/全自动工作流提示词.md','utf8')
    for(const key of ['_SEGMENT_JSONL_SYSTEM_PROMPT','_ASSET_JSONL_SYSTEM_PROMPT','_SHOT_JSONL_SYSTEM_PROMPT']) {
      const expected=source.match(new RegExp(key+'\\s*=\\s*"""([\\s\\S]*?)"""'))[1]
      assert.equal(createHash('sha256').update(prompts[key]).digest('hex'),createHash('sha256').update(expected).digest('hex'))
    }
  })
  check('提示词：拆解用户消息包含模式、目标与原文，auto 目标留空',()=>{
    assert.equal(prompts.buildSegmentUserMessage({...seed,script:'测试剧本',config:{...seed.config,durMode:'auto'}}),'duration_mode：auto\ntarget_seconds：\n剧本：\n测试剧本')
    assert.equal(prompts.buildSegmentUserMessage({...seed,script:'测试剧本',config:{...seed.config,durMode:'manual',targetDur:62}}),'duration_mode：manual\ntarget_seconds：62\n剧本：\n测试剧本')
  })
  check('提示词：提取与镜头用户消息保留段号、别名、风格和手改字段',()=>{
    assert.ok(prompts.buildAssetUserMessage(seed.segments,'人物设定','暖光').includes('人物设定\n风格参考：暖光\n剧本段落：'))
    const project=structuredClone(seed);project.assets[1].alias='小可';project.config.shotStyle='暖光';project.shots[1].action='手改主要动作'
    const message=prompts.buildShotUserMessage(project,[2,3],[project.shots[1]])
    assert.ok(message.includes('本次需要生成镜头的段号：2,3'));assert.ok(message.includes('别名：小可'));assert.ok(message.includes('风格参考：暖光'));assert.ok(message.includes('手改主要动作'))
    assert.ok(prompts.buildShotUserMessage(project,[1]).includes('相邻段落的已有镜头'))
  })
  check('JSONL：mock 三种响应均可逐行解析，拆解保留段数与 allocateExact 算法',()=>{
    for(const target of [4,8,60,91,120,301]) {
      const project={...seed,config:{...seed.config,durMode:'manual',targetDur:target}}
      const response=mockText.mockSegments(project)
      assert.equal(response.request.system,prompts._SEGMENT_JSONL_SYSTEM_PROMPT)
      assert.equal(response.request.user,prompts.buildSegmentUserMessage(project))
      assert.equal(JSON.parse(response.text.split('\n')[0]).type,'meta')
      const warnings=captureWarnings(()=>{
        const segments=protocol.parseSegments(response.text,'manual',target)
        assert.equal(segments.length,Math.max(Math.ceil(target/30),Math.min(3,Math.floor(target/4))))
        assert.equal(segments.reduce((n,s)=>n+s.dur,0),target)
      })
      assert.ok(warnings.every(w=>w.includes('不是 5 的倍数')))
    }
    assert.ok(mockText.mockAssets(seed).text.split('\n').every(line=>JSON.parse(line).type==='asset'))
    assert.deepEqual(mockText.mockShots(seed,[2,3]).text.split('\n').map(line=>JSON.parse(line).segment_ordinal),[2,3])
  })
  check('JSONL：格式、顺序和时长错误会拒绝；代码围栏可容错',()=>{
    assert.throws(()=>protocol.parseSegments('{bad}\n[]\nnull','auto'),protocol.ValidationError)
    assert.throws(()=>protocol.parseSegments('{}','auto'),protocol.ValidationError)
    assert.throws(()=>protocol.parseSegments(protocol.jsonl([{type:'meta',duration_mode:'auto'},{type:'segment',ordinal:2,title:'错号',text:'正文',duration_seconds:3.5}]),'manual',60),protocol.ValidationError)
    const response=mockText.mockSegments({...seed,config:{...seed.config,durMode:'auto'}})
    assert.equal(protocol.parseSegments('```jsonl\n'+response.text+'\n```','auto',undefined,seed.script).length,3)
  })
  check('JSONL：资产字段映射包含 alias、importance 和角色/场景所属段落',()=>{
    const assets=protocol.parseAssets(protocol.jsonl(['character','scene'].map((kind,i)=>({type:'asset',client_key:`test-${i}`,kind,name:`名称${i}`,alias:'别名',importance:'major',description:'设定',prompt:'图片描述',segment_ordinals:[1,3]}))))
    assert.deepEqual(assets.map(a=>a.kind),['char','scene'])
    assets.forEach(a=>{assert.equal(a.alias,'别名');assert.equal(a.importance,'major');assert.ok(!('desc' in a));assert.equal(a.prompt,'图片描述');assert.deepEqual(a.belongSegs,[1,3])})
  })
  check('JSONL：非连续请求段号保持不变，6 拍数组转圈号，asset_ids 写入',()=>{
    const rows=[2,3].map(no=>({...protocol.encodeShot(seed.shots[no-1],no),timeline:['甲','乙','丙','丁','戊','己'],asset_ids:['a2','s_scene1']}))
    const warnings=captureWarnings(()=>{
      const shots=protocol.parseShots(protocol.jsonl(rows),seed,[2,3])
      assert.deepEqual(shots.map(s=>s.segId),['s2','s3']);assert.deepEqual(shots[0].assetIds,seed.shots[1].assetIds)
      assert.equal(shots[0].timeline,'① 甲\n② 乙\n③ 丙\n④ 丁\n⑤ 戊\n⑥ 己')
    })
    assert.ok(warnings.some(w=>w.includes('建议')))
  })
  check('JSONL：额外、重复、遗漏段号拒绝；asset_ids 按 @ 顺序修正',()=>{
    const row=protocol.encodeShot(seed.shots[1],2)
    assert.throws(()=>protocol.parseShots(protocol.jsonl([{...row,segment_ordinal:1},row,row]),seed,[2,3]),protocol.ValidationError)
    const shots=protocol.parseShots(protocol.jsonl([{...row,asset_ids:['missing']}]),seed,[2])
    assert.deepEqual(shots[0].assetIds,seed.shots[1].assetIds)
  })
  check('引用：仅按 assetIds 判断，不由名称或所属段落推断',()=>{
    const project=structuredClone(seed);project.shots.forEach(s=>s.assetIds=[])
    assert.deepEqual(utils.shotsReferencingAsset(project,project.assets[1]),[])
    assert.deepEqual(utils.shotsReferencingAsset(project,project.assets[2]),[])
    project.shots[1].assetIds=['a2'];project.assets[1].name='完全不同的名字'
    assert.deepEqual(utils.shotsReferencingAsset(project,project.assets[1]).map(s=>s.id),['sh2'])
  })
  check('迁移：缺少 assetIds 按旧规则补齐一次，已有空数组和 6 拍保持',()=>{
    const old=structuredClone(seed);old.shots.forEach(s=>delete s.assetIds)
    const migrated=migrateProjects([old])[0];assert.ok(migrated.shots.every(s=>s.assetIds.includes('a2')&&s.assetIds.includes('s_scene1')))
    migrated.shots[0].assetIds=[];migrated.shots[0].timeline='① 甲\n② 乙\n③ 丙\n④ 丁\n⑤ 戊\n⑥ 己'
    assert.deepEqual(migrateProjects([migrated])[0].shots[0].assetIds,[]);assert.ok(migrated.shots[0].timeline.endsWith('⑥ 己'))
  })
  await resetLive();await act(async()=>state().generateVideos(['sh1','sh2','sh3']))
  const originalText=p().segments[0].text
  await act(async()=>{state().renameAsset('a2','只改资产名称',false);await state().generateAssetImages(['a2'])})
  check('引用：仅改名后换图，引用镜头视频仍标需重新生成',()=>{
    assert.equal(p().segments[0].text,originalText);assert.ok(p().shots.every(s=>s.assetIds.includes('a2')))
    assert.ok(p().shots.every(s=>hasReason(s,'角色「只改资产名称」参考图已更新')))
  })
  await act(async()=>state().deleteAsset('a2'))
  check('引用：删除资产同步移除所有镜头 assetIds',()=>assert.ok(p().shots.every(s=>!s.assetIds.includes('a2'))))
  check('模板 A/B：生图提示词参与拼接，固定模板只拼接一次',()=>{
    for(const kind of ['char','scene']) {
      const asset={...seed.assets[0],kind,prompt:'独立完整设定'}
      const prompt=templates.buildAssetImagePrompt(asset)
      assert.ok(prompt.includes('独立完整设定'))
      const marker=kind==='char'?'人物设定图排版':'场景设定图'
      assert.equal(prompt.split(marker).length,2);assert.equal(asset.prompt,'独立完整设定')
    }
  })
  check('模板 C：时长与传入镜头时长一致，参考图按 ID 顺序编号',()=>{
    const shot={...seed.shots[0],dur:23,assetIds:['s_scene1','a2','missing']}
    const prompt=videoPrompts.buildVideoPrompt(shot,seed,shot.dur)
    assert.ok(prompt.includes('本段总时长 23 秒，'));assert.ok(prompt.includes('参考图：@图片1 为场景「客厅」，@图片2 为角色「苏可」'))
    assert.deepEqual(videoPrompts.videoReferenceImages(shot,seed).map(r=>r.assetId),['s_scene1','a2'])
  })
  check('模板 C：空字段整行跳过，保留逐字对白和固定约束',()=>{
    const shot={...seed.shots[0],assetIds:[],shot:' ',timeline:'① 苏可说："原句对白。"\n② 起身',action:'',anchor:' ',motion:'',blocking:'',subject:'',continuity:'',forbid:'',background:''}
    const prompt=videoPrompts.buildVideoPrompt(shot,{...seed,config:{...seed.config,shotStyle:' '}},4)
    for(const label of ['参考图','画面描述','主要动作','场景位置','动作说明','走位说明','画面主角','连贯要求','保持不变','背景范围']) assert.ok(!prompt.includes(`${label}：`),label)
    assert.ok(prompt.includes('秒：苏可说："原句对白。"'));assert.ok(prompt.includes('风格：写实电影风格'));assert.ok(prompt.includes('4秒：起身'));assert.ok(prompt.includes('音频：生成有声视频。'))
  })
  await resetLive()
  let firstInput
  await pausedGeneration(1200,async release=>{
    act(()=>{work=state().generateVideos(['sh1'])})
    firstInput=videoPrompts.buildVideoPrompt(p().shots[0],p(),15)
    await act(async()=>{state().updateShot('sh1',{action:'第二版动作'});state().updateSegment('s1',{dur:22});state().renameAsset('a2','新名字',false);state().updateAsset('a2',{imageUrl:'data:image/png;base64,new'})})
    await release();await act(async()=>work)
  })
  const v1Snapshot=structuredClone(p().shots[0].video.versions[0])
  check('视频快照：生成中修改不污染起始输入、图片、名称和时长',()=>{
    assert.equal(v1Snapshot.videoPrompt,firstInput);assert.equal(v1Snapshot.dur,15)
    assert.equal(v1Snapshot.referenceImages.find(r=>r.assetId==='a2').name,'苏可')
    assert.equal(v1Snapshot.referenceImages.find(r=>r.assetId==='a2').imageUrl,seed.assets[1].imageUrl)
  })
  await act(async()=>state().generateVideos(['sh1']))
  check('视频快照：新版本使用当前 22 秒和当前参考图，旧版本不变',()=>{
    const [v1,v2]=p().shots[0].video.versions
    assert.equal(v1.videoPrompt,v1Snapshot.videoPrompt);assert.deepEqual(v1.referenceImages,v1Snapshot.referenceImages)
    assert.equal(v2.dur,22);assert.ok(v2.videoPrompt.includes('本段总时长 22 秒，'));assert.ok(v2.videoPrompt.includes('第二版动作'))
    assert.equal(v2.referenceImages.find(r=>r.assetId==='a2').imageUrl,'data:image/png;base64,new')
  })
  await mountLive('/src/steps/Step5Video.tsx');await click(container.querySelector('button[title="更多"]'));await click(button('查看镜头信息'))
  check('视频信息 UI：展示采用版本提示词与参考图快照',()=>{
    assert.ok(container.textContent.includes('视频提示词'));assert.ok(container.textContent.includes('本段总时长 22 秒，'));assert.ok(container.textContent.includes('生成时的参考图'));assert.ok(container.textContent.includes('新名字'))
    assert.ok(container.querySelector('select[aria-label="视频信息版本"]'))
  })
  await change(container.querySelector('select[aria-label="视频信息版本"]'),'v1')
  check('视频信息 UI：切换版本显示生成时的时长、原名、原图与原提示词',()=>{
    assert.ok(container.textContent.includes('时长：15 秒'));assert.ok(container.textContent.includes('本段总时长 15 秒，'))
    assert.ok([...container.querySelectorAll('img')].some(img=>img.alt.includes('苏可')&&img.getAttribute('src')===seed.assets[1].imageUrl))
    assert.ok(!container.textContent.includes('本段总时长 22 秒，'))
  })
  await resetLive();await mountLive('/src/steps/Step3Assets.tsx')
  for(const kind of ['角色','场景']) {
    await click(button(`新增${kind}`))
    check(`新增${kind} UI：初次打开不显示空名称错误或空引号`,()=>{
      assert.ok(!container.textContent.includes('名称不能为空'))
      assert.ok([...container.querySelectorAll('textarea')].every(t=>!t.placeholder.includes('「」')))
    })
    await change(container.querySelector(`input[aria-label="${kind}名称"]`),'测试名称')
    await change(container.querySelector(`input[aria-label="${kind}名称"]`),'')
    check(`新增${kind} UI：输入后清空才显示名称不能为空`,()=>assert.ok(container.textContent.includes('名称不能为空')))
    await click(button('取消'))
  }

  const validation = await server.ssrLoadModule('/src/services/validation.ts')
  check('手写 21 拍在 4 秒镜头中不截断、不产生负时间或逆序',()=>{
    const beats=Array.from({length:21},(_,i)=>'动作'+i),axis=videoPrompts.timeAxis(beats,4)
    assert.equal(axis.length,21);assert.equal(axis[0][0],0);assert.equal(axis.at(-1)[1],4)
    axis.forEach(([a,b],i)=>{assert.ok(b>a&&a>=0);if(i)assert.equal(a,axis[i-1][1])})
  })
  check('v8：4/15/30 秒时间轴首尾、连续、最短时长与对白权重',()=>{
    const beats=['抬头。','小雨说：“明天我们一起去看海好吗？”','点头。']
    for(const dur of [4,15,30]) {
      const axis=videoPrompts.timeAxis(beats,dur)
      assert.equal(axis[0][0],0);assert.equal(axis.at(-1)[1],dur)
      axis.forEach(([a,b],i)=>{assert.ok(b-a>=0.5);if(i)assert.equal(a,axis[i-1][1])})
      assert.ok(axis[1][1]-axis[1][0]>axis[0][1]-axis[0][0])
    }
    assert.equal(videoPrompts.timeAxis(['甲','乙'],6.5)[0][1],3)
  })
  check('v8：@ 长名称优先、缺图降为普通名称、编号与图片列表一致',()=>{
    assert.equal(videoPrompts.replaceMentions('@小雨妈妈与@小雨',{'小雨':'@图片2','小雨妈妈':'@图片1'}),'@图片1与@图片2')
    const project=structuredClone(seed);project.assets[0].name='小雨';project.assets[1].name='小雨妈妈';delete project.assets[0].imageUrl
    const shot={...project.shots[0],assetIds:[project.assets[0].id,project.assets[1].id,project.assets[2].id],shot:'@小雨妈妈和@小雨在@客厅'}
    const prompt=videoPrompts.buildVideoPrompt(shot,project,15)
    assert.ok(prompt.includes('画面描述：@图片1和小雨在@图片2'))
    assert.deepEqual(videoPrompts.videoReferenceImages(shot,project).map(r=>r.label),['@图片1','@图片2'])
  })
  check('v8：fix_total 全部可达合计、范围与 Python 舍入行为',()=>{
    for(let count=1;count<=20;count++) for(let target=count*4;target<=count*30;target++) {
      const durations=Array.from({length:count},(_,i)=>4+(i*7)%27),fixed=validation.fixTotal(durations,target)
      assert.equal(fixed.reduce((a,b)=>a+b,0),target);assert.ok(fixed.every(n=>Number.isInteger(n)&&n>=4&&n<=30))
    }
    assert.equal(validation.roundEven(2.5),2);assert.equal(validation.roundEven(3.5),4)
    assert.throws(()=>validation.fixTotal([10],31))
  })
  check('v8：剧本设定识别、对白中的原文秒数豁免、未知引用拒绝',()=>{
    assert.equal(validation.splitPreface([{text:'正文。'}],'人物小传\n正文。'),'人物小传\n')
    assert.equal(validation.splitPreface([{text:'改写。'}],'人物小传\n正文。'),null)
    assert.equal(validation.timingInstructions('小雨说：“等我十秒。”','小雨：等我十秒。'),'小雨说：')
    const row=protocol.encodeShot(seed.shots[0],1)
    assert.throws(()=>protocol.parseShots(protocol.jsonl([{...row,shot:'@不存在的角色在@客厅'}]),seed,[1]))
    assert.throws(()=>protocol.parseShots(protocol.jsonl([{...row,timeline:['停留十秒','转身']}]),seed,[1]))
  })
  check('v8：资产跨类型重名、场景遗漏和非法段号会拒绝',()=>{
    const rows=mockText.mockAssets(seed).text.split('\n').map(JSON.parse)
    assert.throws(()=>protocol.parseAssets(protocol.jsonl(rows.map((r,i)=>({...r,name:i===rows.length-1?rows[0].name:r.name}))),seed.segments))
    assert.throws(()=>protocol.parseAssets(protocol.jsonl(rows.filter(r=>r.kind!=='scene')),seed.segments))
    assert.throws(()=>protocol.parseAssets(protocol.jsonl(rows.map(r=>({...r,segment_ordinals:[999]}))),seed.segments))
  })
  check('v8：用户输入中的美元替换符不会改写原文',()=>{
    const text="台词：$&、$`、$'"
    assert.ok(prompts.buildSegmentUserMessage({...seed,script:text}).endsWith(text))
    assert.ok(prompts.buildAssetUserMessage([{...seed.segments[0],text}],text,text).includes(text))
    const project={...seed,segments:[{...seed.segments[0],text}],config:{...seed.config,shotStyle:text}}
    assert.ok(prompts.buildShotUserMessage(project,[1]).includes(text))
  })
  check('v8：文档解析错误指出缺少的章节，模板 A/B 风格可省略',()=>{
    assert.throws(()=>new prompts.PromptBook('缺少章节'),/SEGMENT/)
    const plain=videoPrompts.buildReferenceImagePrompt(seed.assets[0],seed)
    assert.ok(!plain.includes('画面风格：'))
    assert.ok(videoPrompts.buildReferenceImagePrompt(seed.assets[0],{...seed,config:{...seed.config,shotStyle:'3D 卡通'}}).includes('画面风格：3D 卡通'))
  })
  check('v8：源码和构建产物无密钥，生产构建无费用角标',()=>{
    const env=(()=>{try{return readFileSync('.env.local','utf8')}catch{return ''}})()
    const key=env.match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim()
    const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)])
    for(const path of [...files('src'),...files('server'),...files('scripts'),...files('dist'),'vite.config.ts']) {
      const content=readFileSync(path)
      assert.ok(!key || !content.includes(Buffer.from(key)), '检测到密钥泄露：'+path)
      if(path.startsWith('dist/')) assert.ok(!content.includes(Buffer.from('已花 $')), '生产构建包含费用角标')
    }
  })

  await act(async()=>root.unmount());root=undefined
  console.log(`\n${results.length} checks passed.`)
} finally {
  globalThis.setTimeout=realTimeout
  await server.close()
  dom.window.close()
}
