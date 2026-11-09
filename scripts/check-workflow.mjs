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
  const legacy = await server.ssrLoadModule('/src/data/mock.ts')
  const { refPlaceholder } = await server.ssrLoadModule('/src/data/refPlaceholders.ts')
  const seed = { ...structuredClone(state().projects[0]), style: '写实电影风格', segments: legacy.sampleSegments(), assets: legacy.sampleAssets().map(a => ({...a, imgState:'done',imageUrl:refPlaceholder(a.kind,'16:9',a.name)})), shots:legacy.sampleShots() }
  seed.script = seed.segments.map(s=>s.text).join('')
  const timing = await server.ssrLoadModule('/src/utils/timeline.ts')
  const earlyParse = await server.ssrLoadModule('/src/services/parse.ts')
  const { SHOT_FIELDS } = await server.ssrLoadModule('/src/types.ts')
  for(const shot of seed.shots) {
    const names=seed.assets.map(a=>a.name).sort((a,b)=>b.length-a.length)
    for(const {key} of SHOT_FIELDS) shot[key]=shot[key].replace(new RegExp('(?<!@)('+names.join('|')+')','g'),'@$1')
    shot.shot='@苏可在@客厅。'+shot.shot
    shot.timeline=timing.normalizeTimeline(earlyParse.timelineLines(shot.timeline).slice(0,4).join('\n'),shot.dur)
  }
  seed.shots=earlyParse.parseShots(earlyParse.jsonl(seed.shots.map((s,i)=>earlyParse.encodeShot(s,i+1))),seed,[1,2,3])
  const reset = (project = seed) => useStore.setState({ projects: [structuredClone(project)], currentId: project.id, step: 1, toast: null })
  // v9 replaces the former two independent stale-state contracts.
  const reasons = (shot = p().shots[0]) => shot.outdated ?? []
  const hasA = shot => reasons(shot).some(r => r.kind !== 'video')
  const hasB = shot => reasons(shot).some(r => r.kind === 'video')
  const hasReason = (shot,text) => reasons(shot).some(r=>r.text===text)
  let work
  for (const [target,count] of [[60,4],[120,8],[91,7],[300,20],[600,40],[8,2],[4,1]]) {
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
  check('视频成功追加版本并成为当前版本，首次不标待更新',()=>{assert.ok(p().shots.every(s=>s.video.versions.length===1&&s.video.versions[0].preferred));assert.ok(p().shots.every(s=>!reasons(s).length))})
  check('整数时长边界、费用及模型支持范围',()=>{assert.equal(clampDuration(3),4);assert.equal(clampDuration(40),30);assert.equal(clampDuration(7.8),8);assert.equal(videoCost(15)+videoCost(12),4253);assert.ok(!supportsDuration('Kling 2.1',15));assert.ok(supportsDuration('Kling 2.1',10));assert.ok(supportsDuration('Seedance 2.0',12))})

  reset();state().updateSegment('s1',{text:p().segments[0].text+'修改。'})
  check('A：无视频修改原文也标镜头',()=>{assert.ok(hasA(p().shots[0]));assert.ok(p().shots.slice(1).every(s=>!reasons(s).length))})
  state().updateSegment('s1',{text:'再改。'});state().updateSegmentTitle('s1','新标题')
  check('A：同原因去重，标题不新增原因',()=>assert.deepEqual(reasons(),[{kind:'segText',text:'段落原文已修改'}]))
  state().dismissOutdated('sh1');state().updateSegment('s1',{text:'仅纠错。'})
  check('忽略后再次改原文总是标记待更新',()=>assert.ok(hasA(p().shots[0])))
  state().dismissOutdated('sh1')
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
  check('B：手改字段与节拍原因去重，统一时间段存储',()=>{assert.equal(reasons().filter(r=>r.key==='shotEdit').length,1);assert.equal(p().shots[0].timeline,timing.normalizeTimeline('抬手\n转头',p().shots[0].dur))})
  state().clearAssetImage('a2')
  check('B：清图标引用该资产的已有视频',()=>assert.ok(p().shots.every(s=>hasReason(s,'角色「苏可」参考图已更新'))))
  state().dismissAllOutdated();await state().generateAssetImages(['a2'])
  check('B：换图标引用该资产的已有视频',()=>assert.ok(p().shots.every(hasB)))
  state().dismissAllOutdated();state().updateAsset('a2',{prompt:'外观修订'})
  check('生图提示词编辑从不触发待更新',()=>assert.ok(p().shots.every(s=>!reasons(s).length)))
  state().updateSegment('s1',{text:p().segments[0].text+'修改。'});await state().regenerateShot('sh1')
  check('有视频重新生成镜头成功替换为一条 B 原因，旧版本保留',()=>{assert.deepEqual(reasons(),[{kind:'video',key:'shotEdit',text:'镜头已重新生成'}]);assert.deepEqual(p().shots.map(s=>s.video.versions),firstVersions)})
  await state().generateVideos(['sh1'])
  check('视频成功清除全部原因，追加新版本并自动成为当前版本',()=>{assert.deepEqual(reasons(),[]);assert.deepEqual(p().shots[0].video.versions.map(v=>v.tag),['v1','v2']);assert.deepEqual(p().shots[0].video.versions.map(v=>v.preferred),[false,true]);assert.deepEqual(p().shots[0].video.versions[0],{...firstVersions[0][0],preferred:false})})
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
  // Include controls rendered through portals into this isolated test document.
  const buttons=()=>[...document.querySelectorAll('button')]
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
  check('拆解页改原文总是待更新，无忽略或撤销入口',()=>{assert.equal(p().segments[0].text,'自动保存验收原文');assert.ok(container.textContent.includes('镜头 01 待更新'));assert.ok(!button('忽略改动'));assert.ok(!button('撤销'));assert.match(state().toast,/已保存，镜头 01 需要更新/)})
  await click(container.querySelector('button[title="点击编辑原文"]'))
  check('原文浮层不再有静默勾选框',()=>{assert.equal(container.querySelectorAll('input[type="checkbox"]').length,0);assert.ok(!container.textContent.includes('只改了错别字'))})
  await change(container.querySelector('textarea'),'再次改动')
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  check('再次保存仍标记且原因不重复',()=>assert.deepEqual(reasons(),[{kind:'segText',text:'段落原文已修改'}]))

  await resetLive();await state().generateVideos(['sh2']);state().updateShot('sh2',{action:'只影响视频'});state().updateSegment('s1',{text:'影响镜头设计'});state().addSegment('新增段','新增内容',8)
  await mount('/src/steps/GenShotModal.tsx',{project:p(),onClose(){},onConfirm(){}})
  check('生成镜头默认仅选无镜头段落与 A 类原因',()=>assert.deepEqual([...container.querySelectorAll('input[aria-label^="选择段落"]')].map(i=>i.checked),[true,false,false,true]))
  await resetLive();await state().generateVideos(['sh1']);state().updateShot('sh1',{action:'只影响视频'})
  await mount('/src/steps/GenShotModal.tsx',{project:p(),onClose(){},onConfirm(){}})
  check('只有 B 原因或全部最新时不回退为全选镜头',()=>assert.ok([...container.querySelectorAll('input[aria-label^="选择段落"]')].every(i=>!i.checked)))
  await resetLive();await state().generateVideos(['sh1','sh2']);state().updateSegment('s2',{text:'待更新原文'})
  await mountLive('/src/steps/Step4Shots.tsx')
  check('第 4 步默认选无视频和待更新镜头',()=>{const rows=p().shots.map(s=>container.querySelector(`#shot-${s.id} input[type="checkbox"]`).checked);assert.deepEqual(rows,[false,true,true])})
  check('镜头页标签外灰色忽略、底栏汇总，不再打开标签弹框',()=>{assert.ok(button('全部忽略'));assert.ok(button('忽略'));assert.ok(!button('待更新'));assert.ok(!button('全部保留'));assert.ok(container.textContent.includes('其中 1 个因剧本改动'))})
  const versionsBeforeIgnore=structuredClone(p().shots[1].video.versions)
  await click(button('忽略'))
  check('单条忽略清除原因、取消勾选、保留视频和其他选择',()=>{assert.deepEqual(p().shots[1].outdated,[]);assert.deepEqual(p().shots[1].video.versions,versionsBeforeIgnore);assert.deepEqual(p().shots.map(s=>container.querySelector(`#shot-${s.id} input[type="checkbox"]`).checked),[false,false,true]);assert.ok(!button('全部忽略'))})
  await act(async()=>state().updateSegment('s2',{text:'忽略后的新修改'}))
  check('镜头页新改动自动勾选并恢复标签',()=>{assert.ok(container.querySelector('#shot-sh2 input').checked);assert.ok(button('忽略'))})
  await toggleCheckbox(container.querySelector('#shot-sh2 input'),false)
  await act(async()=>state().updateSegmentTitle('s1','与选择无关的标题修改'))
  check('手动取消勾选不等于忽略，普通刷新不会重选',()=>{assert.ok(!container.querySelector('#shot-sh2 input').checked);assert.ok(p().shots[1].outdated.length);assert.ok(button('全部忽略'))})
  await act(async()=>state().updateSegment('s1',{text:'另一条剧本修改'}))
  await click(button('全部忽略'))
  check('全部忽略取消所有待更新镜头勾选、保留其他选择和视频',()=>{assert.ok(p().shots.every(s=>!s.outdated?.length));assert.deepEqual(p().shots.map(s=>container.querySelector(`#shot-${s.id} input[type="checkbox"]`).checked),[false,false,true]);assert.deepEqual(p().shots[1].video.versions,versionsBeforeIgnore);assert.ok(!button('全部忽略'));assert.ok(!button('忽略'))})
  await click(container.querySelector('#shot-sh2 button[title="更多"]'));await click(button('生成该镜头视频'))
  check('更多菜单仍可打开单个镜头视频生成确认',()=>assert.ok(button('确认并生成 1 段视频')))
  await click(button('取消'))
  await act(async()=>state().updateShot('sh1',{action:'成片页待更新'}));await mountLive('/src/steps/Step5Video.tsx');await click(button('待更新'))
  // The stale-result dialog is portaled above cards; costs are separate from labels.
  await click([...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.includes('重新生成视频')))
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
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('编辑提示词'))
  await change(container.querySelector('textarea'),'蓝色外套。')
  check('资产编辑只有生图提示词，不出现静默勾选',()=>{assert.equal(container.querySelectorAll('textarea').length,1);assert.ok(!container.textContent.includes('这次修改不影响'));assert.ok(container.querySelector('textarea').placeholder.includes('版式和风格会自动添加'))})
  await change(container.querySelector('input[aria-label="角色名称"]'),'客厅')
  check('改名也检查场景重名',()=>assert.equal(button('保存').disabled,true))
  await change(container.querySelector('input[aria-label="角色名称"]'),'小可');await click(button('保存'))
  check('改名同步预览包含普通原文，不列镜头 @引用',()=>{assert.ok(document.body.textContent.includes('同步替换段落和镜头文本？'));assert.ok(document.body.textContent.includes('段落 01 · 原文'));assert.ok(!document.body.textContent.includes('镜头 01 · 画面描述'))})
  await click([...document.querySelectorAll('button')].find(b=>b.textContent==='仅修改名称'))
  check('仅改名称仍更新 @引用且不触发状态',()=>{assert.ok(p().shots[0].shot.includes('@小可'));assert.ok(!reasons().length);assert.equal(p().assets[1].prompt,'蓝色外套。')})

  await resetLive()
  const statusProject = structuredClone(seed)
  for (const [index, videoState] of ['done', 'none', 'generating'].entries()) statusProject.shots[index].video.state = videoState
  await mount('/src/steps/Step4Shots.tsx', { project: statusProject })
  check('视频三种状态保留前置图标及生成中动画',()=>{
    for (const [index, label, icon] of [[0,'视频已生成','lucide-check'],[1,'视频待生成','lucide-video'],[2,'视频生成中','lucide-loader-circle']]) {
      const row=container.querySelector(`#shot-${statusProject.shots[index].id}`)
      const status=[...row.querySelectorAll('span')].find(el=>el.textContent===label)
      assert.ok(status)
      assert.ok(status.firstElementChild?.classList.contains(icon))
      if(index===2)assert.ok(status.firstElementChild.classList.contains('motion-safe:animate-spin'))
    }
  })
  await resetLive()
  const oldClientWidth = Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype,'clientWidth')
  Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.classList.contains('table-scroll') ? 2400 : 0}})
  await mountLive('/src/steps/Step4Shots.tsx')
  const widthKey = 'phanthy-shot-column-widths-compact-v1'
  const resizeHandle = () => container.querySelector('[role="separator"][aria-label="调整时间安排列宽"]')
  const tracks = () => container.querySelector('.table-scroll .grid').style.gridTemplateColumns.split(' ').map(parseFloat)
  const initialTracks = tracks()
  check('默认列宽保持紧凑，不随宽屏拉伸，时长与镜头合并',()=>{assert.deepEqual(initialTracks,[40,176,240,240,160,160,160,160,160,64]);const info=container.querySelector('#shot-sh1').children[1];assert.ok(info.textContent.includes('镜头'));assert.ok(info.querySelector('input[aria-label="镜头 01 时长"]'));assert.ok(resizeHandle().parentElement.parentElement.classList.contains('inset-0'))})
  const pointer = async(type, x) => act(async()=>Simulate[type](resizeHandle(), {button:0, pointerId:1, clientX:x}))
  dom.window.HTMLElement.prototype.setPointerCapture = function() {}
  dom.window.HTMLElement.prototype.releasePointerCapture = function() {}
  await pointer('pointerDown',100);await pointer('pointerMove',280)
  check('v11 拖动只加宽左侧时间安排列，固定列和其他文字列不变',()=>{assert.deepEqual(tracks(),initialTracks.map((w,i)=>i===3?w+180:w));assert.equal(document.body.style.userSelect,'none');assert.ok(!container.querySelector('[contenteditable="true"]'))})
  await pointer('pointerUp',280)
  check('v11 拖动完成恢复选字，列宽按字段持久化',()=>{assert.equal(document.body.style.userSelect,'');assert.equal(JSON.parse(localStorage.getItem(widthKey)).timeline,initialTracks[3]+180)})
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v11 重新挂载从浏览器存储恢复列宽',()=>assert.equal(tracks()[3],initialTracks[3]+180))
  await pointer('pointerDown',280);await pointer('pointerMove',-2000);await pointer('pointerCancel',-2000)
  check('v11 拖窄不小于最小宽度，取消拖动释放选字状态',()=>{assert.equal(tracks()[3],240);assert.equal(document.body.style.userSelect,'')})
  await act(async()=>Simulate.doubleClick(resizeHandle()))
  check('v11 双击恢复默认宽度并移除该字段记忆',()=>{assert.deepEqual(tracks(),initialTracks);assert.ok(!('timeline' in JSON.parse(localStorage.getItem(widthKey))))})
  await pointer('pointerDown',0);await pointer('pointerMove',5000);await pointer('pointerUp',5000)
  check('v11 不设最大列宽，表格内容宽度随列宽增大',()=>{assert.equal(tracks()[3],initialTracks[3]+5000);assert.equal(parseFloat(container.querySelector('.table-scroll > div').style.width),tracks().reduce((a,b)=>a+b,0))})
  await click(buttons().find(b=>b.textContent.startsWith('字段')))
  await click(button('时间安排'));await click(button('时间安排'))
  check('v11 字段隐藏后重显仍保留调整宽度',()=>assert.equal(tracks()[3],initialTracks[3]+5000))
  await act(async()=>Simulate.doubleClick(resizeHandle()))
  const initialFields=container.querySelectorAll('#shot-sh1 .cursor-text').length
  await click(button('背景范围'))
  check('字段显隐仍可用',()=>assert.equal(container.querySelectorAll('#shot-sh1 .cursor-text').length,initialFields+1))
  await act(async()=>Simulate.mouseDown(container.querySelector('.fixed.inset-0.z-50')))
  await click(button('筛选'));await change(container.querySelector('input[placeholder]'),'快速跟摇')
  dom.window.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true'}
  await click(container.querySelector('button[title="定位到该镜头"]'))
  check('筛选预览定位闪动保持',()=>{assert.ok(container.querySelector('#shot-sh3.row-flash'));assert.equal(container.querySelector('#shot-sh3').dataset.scrolled,'true')})
  await click(container.querySelector('#shot-sh1 .cursor-text'))
  const {placeEditorCaret,editorSelection}=await server.ssrLoadModule('/src/components/ShotTextEditor.tsx')
  const rich=()=>container.querySelector('[contenteditable="true"]')
  const beats=()=>[...container.querySelectorAll('[data-shot-editor="timeline"] [contenteditable="true"]')]
  const typeRich=async(el,text)=>act(async()=>{el.focus();el.textContent=text;placeEditorCaret(el,text.length);Simulate.input(el)})
  const key=async(el,key)=>act(async()=>Simulate.keyDown(el,{key}))
  const caret=(el,n)=>{el.focus();placeEditorCaret(el,n)}
  const paste=async(el,text)=>act(async()=>Simulate.paste(el,{clipboardData:{getData:()=>text}}))
  await typeRich(rich(),'@苏可站在@客厅。');await tick(750)
  check('单元格自动保存继续有效且编辑态已有双色标签',()=>{assert.equal(p().shots[0].shot,'@苏可站在@客厅。');assert.equal(rich().querySelectorAll('[contenteditable="false"]').length,2)})
  await key(rich(),'Escape');if(rich()) await key(rich(),'Escape')
  check('保存后 @恢复角色/场景标签',()=>{assert.ok(container.querySelector('#shot-sh1 .text-brand-light'));assert.ok(container.querySelector('#shot-sh1 .text-violet-200'))})
  await act(async()=>state().updateShot('sh1',{timeline:'① 抬头转身\n② 离开'}))
  await click(container.querySelectorAll('#shot-sh1 .cursor-text')[1])
  const bodyTexts=()=>beats().map(e=>timing.beatText(e.textContent))
  const prefixLength=el=>timing.beatPrefix(timing.readBeat(el.textContent)).length
  const enterLast=async()=>{const el=beats().at(-1);caret(el,el.textContent.length);await key(el,'Enter')}
  const mergeAtStart=async()=>{const el=beats().at(-1);caret(el,0);await key(el,'Backspace')}
  check('v14 时间段和正文在同一编辑区域，无时间标签或添加一拍按钮',()=>{assert.equal(beats().length,2);assert.match(beats()[0].textContent,/^0-\d+秒：抬头转身$/);assert.ok(!container.querySelector('button[aria-label="添加一拍"]'));assert.ok(!container.querySelector('[aria-label="修改第 1 拍结束秒数"]'))})
  const initialBeat=timing.readBeat(beats()[0].textContent)
  caret(beats()[0],prefixLength(beats()[0])+2);await key(beats()[0],'Enter')
  check('v14 回车拆拍并聚焦新拍时间段后，前半四舍五入',()=>{assert.deepEqual(bodyTexts(),['抬头','转身','离开']);assert.equal(document.activeElement,beats()[1]);assert.deepEqual(editorSelection(beats()[1]),[prefixLength(beats()[1]),prefixLength(beats()[1])]);assert.equal(timing.readBeat(beats()[0].textContent).end,Math.round(initialBeat.end/2))})
  caret(beats()[1],0);await key(beats()[1],'Backspace')
  check('v14 时间段前退格合并、取时间并集、光标留在正文连接处',()=>{assert.deepEqual(bodyTexts(),['抬头转身','离开']);assert.deepEqual(timing.readBeat(beats()[0].textContent),initialBeat);assert.deepEqual(editorSelection(beats()[0]),[prefixLength(beats()[0])+2,prefixLength(beats()[0])+2])})
  caret(beats()[0],0);await key(beats()[0],'Backspace')
  check('第一拍开头退格无效果',()=>assert.equal(bodyTexts()[0],'抬头转身'))
  const lastBefore=timing.readBeat(beats().at(-1).textContent)
  await enterLast()
  check('v14 最后一行末尾回车新增空拍，原时间对半分',()=>{assert.equal(document.activeElement,beats().at(-1));assert.equal(bodyTexts().at(-1),'');assert.equal(timing.readBeat(beats().at(-1).textContent).start,lastBefore.start+Math.round((lastBefore.end-lastBefore.start)/2));assert.deepEqual(editorSelection(beats().at(-1)),[prefixLength(beats().at(-1)),prefixLength(beats().at(-1))])})
  await mergeAtStart()
  check('新增空拍并退格删除',()=>assert.equal(beats().length,2))
  await enterLast()
  await paste(beats().at(-1),'① 0-2秒：@苏可抬头\n1. 2～4秒：转身\n1、走近\n1）停下\n(1) 点头\n（1）离开')
  check('多行粘贴逐行去全部序号和时间，保留引用标签',()=>{assert.deepEqual(bodyTexts().slice(2),['@苏可抬头','转身','走近','停下','点头','离开']);assert.ok(beats()[2].querySelector('[contenteditable="false"]'))})
  await enterLast();await key(beats().at(-1),'Escape')
  check('保存去空拍并保持模型、视频、界面节拍一致',()=>{assert.equal(earlyParse.timelineLines(p().shots[0].timeline).length,8);assert.equal(earlyParse.encodeShot(p().shots[0],1).timeline.length,8);assert.ok(p().shots[0].timeline.endsWith('秒：离开'))})
  await click(container.querySelector('#shot-sh1 button[title="更多"]'));await click(button('编辑镜头详情'))
  check('详情抽屉使用相同多拍编辑器和全部文字编辑器',()=>{assert.equal(beats().length,8);assert.ok(container.querySelectorAll('[data-shot-editor]').length>=7);assert.ok(!container.querySelector('button[aria-label="添加一拍"]'))})
  await enterLast()
  check('v14 抽屉回车新增并聚焦时间段后',()=>{assert.equal(beats().length,9);assert.equal(document.activeElement,beats().at(-1));assert.equal(bodyTexts().at(-1),'')})
  await mergeAtStart()
  await typeRich(beats()[0],'抬头');await tick(750)
  check('抽屉自动保存统一节拍格式',()=>assert.equal(timing.beatText(earlyParse.timelineLines(p().shots[0].timeline)[0]),'抬头'))
  await click(button('更多设定'))
  check('抽屉十个文字字段全部使用共享编辑器',()=>assert.equal(container.querySelectorAll('[data-shot-editor]').length,10))
  const background=container.querySelector('[aria-label="背景范围"]')
  const extra={...p().assets[1],id:'v10-new',name:'验收角色',alias:'测试别名',imageUrl:'v10-reference.png'}
  await act(async()=>useStore.setState(s=>({projects:s.projects.map(project=>({...project,assets:[...project.assets,extra]}))})))
  await typeRich(background,'＠')
  check('全角 @打开候选，已引用资产置顶且有缩略图',()=>{const opts=[...document.querySelectorAll('[role="option"]')];assert.equal(opts.length,p().assets.length);assert.ok(opts[0].textContent.includes('苏可'));assert.ok(opts.some(e=>e.querySelector('img')))})
  await key(background,'ArrowDown')
  check('候选向下选择，再向上回到首项',()=>assert.ok(document.querySelector('[role="option"][aria-selected="true"]').textContent.includes('客厅')))
  await key(background,'ArrowUp')
  await click([...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('验收角色')))
  check('鼠标确认候选也写正式名称',()=>assert.equal(background.textContent,'@验收角色'))
  await typeRich(background,'@')
  await act(async()=>Simulate.mouseUp(background))
  check('移动光标关闭候选',()=>assert.ok(!document.querySelector('[role="listbox"]')))
  await typeRich(background,'＠测试')
  check('按别名过滤始终显示正式名称',()=>{assert.equal(document.querySelectorAll('[role="option"]').length,1);assert.ok(document.querySelector('[role="option"]').textContent.includes('验收角色'))})
  await key(background,'Enter');await tick(750)
  check('回车选中写半角名称、无额外空格、整体标签且光标在末尾',()=>{assert.equal(background.textContent,'@验收角色');assert.ok(background.querySelector('[contenteditable="false"]'));assert.deepEqual(editorSelection(background),[5,5])})
  check('背景新引用不改变画面描述的参考图列表',()=>{assert.deepEqual(p().shots[0].assetIds,['a2','s_scene1']);assert.ok((p().shots[0].background).includes('@验收角色'))})
  const videoModule=await server.ssrLoadModule('/src/services/videoPrompt.ts')
  check('视频模板只给画面描述引用编号，背景其他名称保留普通文本',()=>{assert.ok(!videoModule.videoReferenceImages(p().shots[0],p()).some(r=>r.imageUrl==='v10-reference.png'));assert.ok(!videoModule.buildVideoPrompt(p().shots[0],p(),15).includes('@图片3'))})
  await key(background,'Backspace');await tick(750)
  check('标签后退格整体删除，所有字段均不再引用时移除参考图',()=>{assert.equal(background.textContent,'');assert.ok(!p().shots[0].assetIds.includes('v10-new'))})
  await typeRich(background,'@验收角色')
  check('手打完整名称也形成标签',()=>assert.ok(background.querySelector('[contenteditable="false"]')))
  await key(background,'Escape')
  check('Esc只关候选，抽屉仍在',()=>assert.ok(container.querySelector('[aria-label="背景范围"]')))
  await typeRich(background,'@不存在')
  check('无匹配候选和未知引用红色虚线',()=>{assert.ok(document.body.textContent.includes('没有匹配的角色或场景'));assert.equal(background.querySelector('.text-red-300').title,'找不到这个角色或场景')})
  await typeRich(background,'@ ')
  check('空格关闭候选',()=>assert.ok(!document.querySelector('[role="listbox"]')))
  await act(async()=>Simulate.compositionStart(background))
  await typeRich(background,'@测试')
  await key(background,'Enter');await key(background,'Escape')
  check('中文组字中不弹候选、不拦截回车、不转标签',()=>{assert.ok(!document.querySelector('[role="listbox"]'));assert.equal(background.textContent,'@测试');assert.ok(!background.querySelector('[contenteditable="false"]'));assert.ok(container.querySelector('[aria-label="背景范围"]'))})
  await act(async()=>Simulate.compositionEnd(background))
  check('组字结束后正常按别名查找候选',()=>assert.equal(document.querySelectorAll('[role="option"]').length,1))
  await key(background,'Tab')
  await typeRich(container.querySelector('[aria-label="走位说明"]'),'@验收角色在左侧')
  await key(container.querySelector('[aria-label="走位说明"]'),'Escape');await tick(750)
  check('走位说明新引用保存后顺序正确，不显示额外建议',()=>{assert.deepEqual(p().shots[0].assetIds,['a2','s_scene1']);assert.ok(!container.textContent.includes('字，建议'))})

  await resetLive()
  await mount('/src/components/ShotTextEditor.tsx',{value:Array.from({length:21},(_,i)=>`第${i+1}拍`).join('\n'),timeline:true,assets:[],assetIds:[],label:'时间安排',onChange(){}})
  check('编辑器超过二十拍仍完整显示并使用整数时间段',()=>{assert.equal(beats().length,21);assert.match(beats()[20].textContent,/^\d+-15秒：第21拍$/)})
  await resetLive()
  localStorage.setItem(widthKey,'{broken')
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v11 存储损坏回退默认宽度',()=>assert.deepEqual(tracks(),initialTracks))
  await resetLive()
  const storagePrototype=Object.getPrototypeOf(localStorage),getItem=storagePrototype.getItem,setItem=storagePrototype.setItem
  storagePrototype.getItem=function(key){if(key===widthKey)throw Error('storage disabled');return getItem.call(this,key)}
  storagePrototype.setItem=function(key,value){if(key===widthKey)throw Error('storage disabled');return setItem.call(this,key,value)}
  try {
    await mountLive('/src/steps/Step4Shots.tsx')
    await pointer('pointerDown',0);await pointer('pointerMove',64);await pointer('pointerUp',64)
    check('v11 浏览器禁止存储时仍能读取默认值和调整列宽',()=>assert.equal(tracks()[3],initialTracks[3]+64))
  } finally {
    storagePrototype.getItem=getItem;storagePrototype.setItem=setItem
    if(oldClientWidth)Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',oldClientWidth)
    else delete dom.window.HTMLElement.prototype.clientWidth
    await resetLive();localStorage.removeItem(widthKey)
  }
  // Enlarged UI must keep drag distances in viewport pixels and stored widths in design units.
  document.documentElement.style.fontSize='18px'
  try {
    await mountLive('/src/steps/Step4Shots.tsx')
    const enlargedTracks=tracks()
    await pointer('pointerDown',100);await pointer('pointerMove',190);await pointer('pointerUp',190)
    check('放大界面后拖动 90px 只增加目标列 90px，重新挂载保持宽度',()=>{
      assert.deepEqual(tracks(),enlargedTracks.map((w,i)=>i===3?w+90:w))
      assert.equal(JSON.parse(localStorage.getItem(widthKey)).timeline,(enlargedTracks[3]+90)/1.125)
    })
    await mountLive('/src/steps/Step4Shots.tsx')
    check('放大后的固定列、行高和表格总宽保持一致',()=>{
      assert.equal(tracks()[3],enlargedTracks[3]+90)
      assert.equal(tracks()[1],176*1.125)
      assert.equal(container.querySelector('.shot-table-row').style.height,'7.5rem')
      assert.equal(parseFloat(container.querySelector('.table-scroll > div').style.width),tracks().reduce((a,b)=>a+b,0))
    })
  } finally {
    document.documentElement.style.removeProperty('font-size')
    await resetLive();localStorage.removeItem(widthKey)
  }
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
    assert.equal(prompts.buildSegmentUserMessage({...seed,script:'测试剧本',config:{...seed.config,durMode:'auto'}}),'duration_mode：auto\ntarget_seconds：\n风格参考：\n剧本：\n测试剧本')
    assert.equal(prompts.buildSegmentUserMessage({...seed,script:'测试剧本',config:{...seed.config,durMode:'manual',targetDur:62}}),'duration_mode：manual\ntarget_seconds：62\n风格参考：\n剧本：\n测试剧本')
  })
  check('提示词：提取与镜头用户消息保留段号、别名、风格和手改字段',()=>{
    assert.ok(prompts.buildAssetUserMessage(seed.segments,'暖光').includes('风格参考：暖光\n剧本段落：'))
    const project=structuredClone(seed);project.assets[1].alias='小可';project.style='暖光';project.shots[1].action='手改主要动作'
    const message=prompts.buildShotUserMessage(project,[2,3],[project.shots[1]])
    assert.ok(message.includes('本次需要生成镜头的段号：2,3'));assert.ok(!message.includes('别名：小可'));assert.ok(message.includes('风格参考：暖光'));assert.ok(message.includes('手改主要动作'))
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
        assert.equal(segments.length,Math.max(Math.ceil(target/15),Math.min(3,Math.floor(target/4))))
        assert.equal(segments.reduce((n,s)=>n+s.dur,0),target)
      })
      assert.ok(warnings.every(w=>w.includes('不是 5 的倍数') || w.includes('超过 15 秒')))
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
  check('JSONL：资产载入丢弃旧字段，所属段落由程序计算',()=>{
    const assets=protocol.parseAssets(protocol.jsonl(['character','scene'].map((kind,i)=>({type:'asset',client_key:`test-${i}`,kind,name:`名称${i}`,alias:'别名',importance:'major',description:'设定',prompt:'图片描述',segment_ordinals:[1,3]}))))
    assert.deepEqual(assets.map(a=>a.kind),['char','scene'])
    assets.forEach(a=>{assert.equal(a.alias,undefined);assert.equal(a.importance,undefined);assert.ok(!('desc' in a));assert.equal(a.prompt,'图片描述');assert.deepEqual(a.belongSegs,[])})
  })
  check('JSONL：非连续请求段号保持不变，4 拍数组分配时间段，asset_ids 写入',()=>{
    const rows=[2,3].map(no=>({...protocol.encodeShot(seed.shots[no-1],no),timeline:['甲','乙','丙','丁'],asset_ids:['a2','s_scene1']}))
    const warnings=captureWarnings(()=>{
      const shots=protocol.parseShots(protocol.jsonl(rows),seed,[2,3])
      assert.deepEqual(shots.map(s=>s.segId),['s2','s3']);assert.deepEqual(shots[0].assetIds,seed.shots[1].assetIds)
      assert.equal(shots[0].timeline,timing.normalizeTimeline('甲\n乙\n丙\n丁',shots[0].dur))
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
  check('迁移：assetIds 统一按画面描述推导，6 拍保持',()=>{
    const old=structuredClone(seed);old.shots.forEach(s=>delete s.assetIds)
    const migrated=migrateProjects([old])[0];assert.ok(migrated.shots.every(s=>s.assetIds.includes('a2')&&s.assetIds.includes('s_scene1')))
    migrated.shots[0].assetIds=[];migrated.shots[0].timeline='① 甲\n② 乙\n③ 丙\n④ 丁\n⑤ 戊\n⑥ 己'
    assert.deepEqual(migrateProjects([migrated])[0].shots[0].assetIds,seed.shots[0].assetIds);assert.ok(migrated.shots[0].timeline.endsWith('秒：己'))
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
    assert.equal(v1Snapshot.resolution,'720p');assert.equal(v1Snapshot.ratio,seed.config.ratio);assert.equal(v1Snapshot.audio,true)
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
  check('视频信息 UI：展示当前版本提示词与参考图快照',()=>{
    assert.ok(container.textContent.includes('视频提示词'));assert.ok(container.textContent.includes('本段总时长 22 秒，'));assert.ok(container.textContent.includes('生成时的参考图'));assert.ok(container.textContent.includes('新名字'))
    assert.ok(container.querySelector('button[aria-label="选择视频版本"]'))
  })
  await click(container.querySelector('button[aria-label="选择视频版本"]'));await click(document.querySelector('[role="menuitemradio"][aria-label="第 1 版"]'))
  check('视频信息 UI：切换版本显示生成时的时长、原名、原图与原提示词',()=>{
    assert.ok(container.querySelector('[role="dialog"]').textContent.includes('时长15s'));assert.ok(container.textContent.includes('本段总时长 15 秒，'))
    assert.ok([...container.querySelectorAll('img')].some(img=>img.alt.includes('苏可')&&img.getAttribute('src')===seed.assets[1].imageUrl))
    assert.ok(!container.textContent.includes('本段总时长 22 秒，'))
    assert.equal(utils.currentVersion(p().shots[0].video).tag,'v2')
  })
  let copiedPrompt
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copiedPrompt=text}}})
  await click(button('复制'))
  check('视频信息 UI：复制所查看版本的原始提示词',()=>{assert.equal(copiedPrompt,v1Snapshot.videoPrompt);assert.ok(button('已复制'))})
  await click(container.querySelector('button[aria-label="选择视频版本"]'));await click(document.querySelector('[role="menuitemradio"][aria-label="第 2 版"]'))
  check('视频信息 UI：切版重置复制反馈并同步参数',()=>{assert.ok(button('复制'));assert.ok(container.querySelector('[role="dialog"]').textContent.includes('时长22s'))})
  await resetLive()
  await state().generateVideos(['sh1','sh2','sh3'])
  await mountLive('/src/steps/Step4Shots.tsx')
  await click(container.querySelector('button[title="更多"]'));await click(button('生成该镜头视频'))
  await click(button('Seedance 2.5'));await click(button('Seedance 2.0'))
  await click(button('确认并生成 1 段视频'));await tick(10)
  await act(async()=>state().generateVideos(['sh1'],'Seedance 2.0'))
  check('v12：生成模型写入版本和项目，成功版本自动成为当前版本',()=>{
    assert.equal(p().shots[0].video.versions.at(-1).model,'Seedance 2.0')
    assert.equal(p().shots[0].video.versions.at(-1).cost,videoCost(p().shots[0].dur))
    assert.equal(p().lastVideoModel,'Seedance 2.0');assert.equal(utils.currentVersion(p().shots[0].video).tag,'v3')
  })
  await mountLive('/src/steps/Step5Video.tsx')
  check('v12：多版本卡片显示总数和最近三版，单版本没有版本标记',()=>{
    assert.equal(container.querySelectorAll('button[aria-label="共 3 版"]').length,1)
    assert.equal(container.querySelectorAll('button[aria-label^="镜头 01 v"]').length,3)
    assert.equal(container.querySelectorAll('button[aria-label^="镜头 02 v"]').length,0)
  })
  await click(container.querySelector('button[aria-label="镜头 01 v1"]'))
  check('v12：卡片切换同步封面、项目封面、下载对象并持久化',()=>{
    const first=p().shots[0].video.versions[0]
    assert.equal(utils.currentVersion(p().shots[0].video).tag,'v1');assert.equal(utils.projectCover(p()),first.url)
    assert.ok([...container.querySelectorAll('[style]')].some(el=>el.style.backgroundImage.includes(first.url)))
    assert.equal(utils.videoDownloads(p().shots)[0].filename,'镜头01_v1.mp4')
    const reloaded=migrateProjects(JSON.parse(localStorage.getItem('phanthy.projects.v2')))[0]
    assert.equal(utils.currentVersion(reloaded.shots[0].video).tag,'v1');assert.equal(reloaded.lastVideoModel,'Seedance 2.0')
    assert.ok(!container.querySelector('button[title="暂停"]'))
  })
  await mountLive('/src/steps/Step5Video.tsx')
  check('v12：重新进入成片页仍选中已保存版本',()=>assert.equal(container.querySelector('button[aria-label="镜头 01 v1"]').getAttribute('aria-pressed'),'true'))
  await click(button('批量下载'))
  check('v12：批量菜单显示当前/全部段数',()=>{assert.ok(container.textContent.includes('下载当前版本3 段视频'));assert.ok(container.textContent.includes('下载全部版本5 段视频'))})
  await click(buttons().find(b=>b.textContent.startsWith('下载当前版本')))
  check('v12：当前版本批量下载使用明确文件名',()=>assert.match(state().toast,/镜头01_v1.mp4、镜头02_v1.mp4、镜头03_v1.mp4/))
  await click(button('批量下载'));await click(buttons().find(b=>b.textContent.startsWith('下载全部版本')))
  check('v12：全部下载按镜头、版本排序，超过三段省略',()=>assert.match(state().toast,/镜头01_v1.mp4、镜头01_v2.mp4、镜头01_v3.mp4 等 5 段/))
  await click(container.querySelector('button[title="更多"]'));await click(button('下载全部版本'))
  check('v12：卡片全部下载只包括该镜头',()=>assert.match(state().toast,/3 段视频：镜头01_v1.mp4、镜头01_v2.mp4、镜头01_v3.mp4/))
  await click(container.querySelector('button[aria-label="共 3 版"]'))
  check('v12：完整菜单倒序且显示时间、模型、花费和当前勾选',()=>{
    const items=[...document.querySelectorAll('[role="menuitemradio"]')]
    assert.deepEqual(items.map(el=>el.getAttribute('aria-label')),['第 3 版','第 2 版','第 1 版'])
    assert.match(items[0].textContent,/Seedance 2.0/);assert.match(items[0].textContent,/✦2363/);assert.match(items[0].textContent,/\d{2}-\d{2} \d{2}:\d{2}/)
    assert.equal(items[2].getAttribute('aria-checked'),'true')
  })
  await click(document.querySelector('[role="menuitemradio"][aria-label="第 2 版"]'))
  await click(container.querySelector('button[aria-label="镜头 01 v2"]').closest('.group'))
  await click(container.querySelector('button[aria-label="选择视频版本"]'))
  await click(document.querySelector('[role="menuitemradio"][aria-label="第 1 版"]'))
  check('v12：播放器切换即保存当前版本，标题与播放画面跟随',()=>{
    assert.equal(utils.currentVersion(p().shots[0].video).tag,'v1')
    assert.ok(container.textContent.includes('第 1 版'))
    assert.ok([...container.querySelectorAll('[style]')].filter(el=>el.style.backgroundImage.includes(p().shots[0].video.versions[0].url)).length>=2)
  })
  await click(container.querySelector('button[title="下载"]'))
  check('v12：播放器下载当前查看版本',()=>assert.match(state().toast,/镜头01_v1.mp4/))
  await click(container.querySelector('button[aria-label="关闭"]'))
  await act(async()=>state().generateVideos(['sh1'],'Seedance 2.0'))
  check('v12：超过三版只显示最近三版，最新成功版本自动选中',()=>{
    assert.equal(container.querySelector('button[aria-label="镜头 01 v1"]'),null)
    assert.equal(container.querySelector('button[aria-label="镜头 01 v4"]').getAttribute('aria-pressed'),'true')
    assert.ok(container.querySelector('button[aria-label="共 4 版"]'))
  })
  await mountLive('/src/steps/Step4Shots.tsx')
  await click(container.querySelector('button[title="更多"]'));await click(button('生成该镜头视频'))
  check('v12：单镜头生成弹窗带出项目上次模型',()=>assert.ok(button('Seedance 2.0')))
  await click(button('确认并生成 1 段视频'));await tick(10)
  check('v12：确认弹窗所选模型沿同一生成路径写入版本',()=>assert.equal(p().shots[0].video.versions.at(-1).model,'Seedance 2.0'))
  await act(async()=>state().updateSegment('s1',{dur:22}))
  await mountLive('/src/steps/Step4Shots.tsx')
  await click(container.querySelector('button[title="更多"]'));await click(button('生成该镜头视频'))
  check('v12：上次模型不支持本批时长则默认回退 2.5',()=>assert.ok(button('Seedance 2.5')))
  await click(button('Seedance 2.5'))
  check('v12：超时长模型禁用并保留原因',()=>assert.ok(buttons().some(b=>b.disabled&&b.textContent.includes('Seedance 2.0'))))
  await resetLive();await state().generateVideos(['sh1'])
  await mountLive('/src/steps/Step5Video.tsx');await click(button('批量下载'))
  check('v12：单版本直接下载，不出现版本菜单',()=>{assert.match(state().toast,/镜头01_v1.mp4/);assert.ok(!container.textContent.includes('下载当前版本'))})
  check('v12：模型输出 5 拍拒绝；mock 压到最多 4 拍，手动编辑不限制',()=>{
    const row=protocol.encodeShot(seed.shots[0],1)
    assert.throws(()=>protocol.parseShots(protocol.jsonl([{...row,timeline:Array(5).fill('抬头')}]),seed,[1]),/timeline 必须有 2–4 拍/)
    const project=structuredClone(seed);project.shots[0].timeline=protocol.formatTimeline(Array(7).fill('抬头'))
    const generated=protocol.parseShots(mockText.mockShots(project,[1]).text,project,[1])
    assert.ok(protocol.timelineLines(generated[0].timeline).length<=4)
    state().updateShot('sh1',{timeline:protocol.formatTimeline(Array(7).fill('抬头'))})
    assert.equal(protocol.timelineLines(p().shots[0].timeline).length,7)
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
    axis.forEach(([a,b],i)=>{assert.ok(b>=a&&a>=0&&Number.isInteger(a)&&Number.isInteger(b));if(i)assert.equal(a,axis[i-1][1])})
  })
  check('v13：4/15/30 秒时间轴首尾、连续、整数秒与对白权重',()=>{
    const beats=['抬头。','小雨说：“明天我们一起去看海好吗？”','点头。']
    for(const dur of [4,15,30]) {
      const axis=videoPrompts.timeAxis(beats,dur)
      assert.equal(axis[0][0],0);assert.equal(axis.at(-1)[1],dur)
      axis.forEach(([a,b],i)=>{assert.ok(b-a>=1);if(i)assert.equal(a,axis[i-1][1])})
      assert.ok(axis[1][1]-axis[1][0]>axis[0][1]-axis[0][0])
    }
    assert.equal(videoPrompts.timeAxis(['甲','乙'],6.5)[0][1],4)
  })
  const assertTimeline = (value, dur) => {
    const beats=timing.timelineLines(value).map(timing.readBeat)
    assert.ok(beats.length);assert.equal(beats[0].start,0);assert.equal(beats.at(-1).end,dur)
    beats.forEach((b,i)=>{assert.ok(Number.isInteger(b.start)&&Number.isInteger(b.end));assert.ok(b.end-b.start >= (beats.length<=dur?1:0));if(i)assert.equal(b.start,beats[i-1].end)})
    return beats
  }
  check('v13 模型正常时间段、所有连接符、小数、起点、缺口、末尾和缺失时间段',()=>{
    const project=structuredClone(seed);project.segments[0].dur=10
    const row=protocol.encodeShot(project.shots[0],1)
    for(const connector of ['-','–','—','~','～','到']) {
      const out=protocol.parseShots(protocol.jsonl([{...row,timeline:[`0${connector}3秒：甲`,`3${connector}7秒：乙`,`7${connector}10秒：丙`]}]),project,[1])[0]
      assert.equal(out.timeline,'0-3秒：甲\n3-7秒：乙\n7-10秒：丙')
    }
    for(const lines of [['0-3.5秒：甲','3.5–7秒：乙','7–10秒：丙'],['2–5秒：甲','5–7秒：乙','7–10秒：丙'],['0–3秒：甲','4–7秒：乙','7–12秒：丙'],['甲','乙','丙'],['0–3秒：甲','乙','7–10秒：丙']]) {
      let out
      const notes=captureWarnings(()=>out=protocol.parseShots(protocol.jsonl([{...row,timeline:lines}]),project,[1])[0])
      assertTimeline(out.timeline,10);assert.ok(notes.some(n=>n.startsWith('[JSONL]')&&n.includes('时间段已修正')))
    }
    assert.deepEqual(validation.styleNotes({...row,timeline:['0–3秒：十五个字的动作说明写在这个地方']},'镜头'),validation.styleNotes({...row,timeline:['十五个字的动作说明写在这个地方']},'镜头'))
  })
  check('v13 10→15/6/20 按半秒进一重排，保留全部正文和其他字段，无文本请求',()=>{
    const fetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('时长修改不能调用模型')}
    try {for(const [dur,ends] of [[15,[5,11,15]],[6,[2,4,6]],[20,[6,14,20]]]) {
      reset();state().updateSegment('s1',{dur:10});state().updateShot('sh1',{timeline:'0–3秒：甲\n3–7秒：乙\n7–10秒：丙'})
      const before=structuredClone(p().shots[0]);state().updateSegment('s1',{dur})
      const after=p().shots[0], beats=assertTimeline(after.timeline,dur)
      assert.deepEqual(beats.map(b=>b.end),ends);assert.deepEqual(beats.map(b=>b.text),['甲','乙','丙'])
      for(const k of Object.keys(before).filter(k=>!['dur','timeline','outdated'].includes(k)))assert.deepEqual(after[k],before[k])
    }} finally {globalThis.fetch=fetch}
  })
  check('v13 中间结束点带动下一起点；最后结束点仅修改尾拍及镜头段落时长，不启动重排',()=>{
    reset();state().updateSegment('s1',{dur:10});state().updateShot('sh1',{timeline:'0–3秒：甲\n3–7秒：乙\n7–10秒：丙'})
    p().shots[0].video.versions=[{id:'v13',dur:10}]
    let beats=assertTimeline(p().shots[0].timeline,10)
    beats=timing.changeBeatEnd(beats,0,4.4);assert.equal(beats[0].end,4);assert.equal(beats[1].start,4)
    state().updateShot('sh1',{timeline:timing.writeBeats(beats)})
    const next=timing.changeBeatEnd(beats,2,15.4);state().updateShot('sh1',{timeline:timing.writeBeats(next)})
    assert.deepEqual(next.slice(0,2),beats.slice(0,2));assert.equal(p().shots[0].dur,15);assert.equal(p().segments[0].dur,15)
    assertTimeline(p().shots[0].timeline,15);assert.ok(reasons().some(r=>r.key==='duration'))
    assert.equal(timing.changeBeatEnd(next,2,99).at(-1).end,30)
  })
  check('v13 拆拍、并拍、删除首拍与中拍、添加、粘贴均保留连续时间',()=>{
    const source=timing.normalizeBeats(['0–3秒：甲乙','3–7秒：丙','7–10秒：丁'],10)
    const split=timing.splitBeat(source,0,['甲','乙']);assert.equal(split[0].end,2)
    assert.deepEqual(timing.removeBeat(split,1,true),source)
    const first=timing.removeBeat(source,0),middle=timing.removeBeat(source,1)
    assert.equal(first[0].start,0);assert.equal(first[0].end,7);assert.equal(middle[0].end,7)
    for(const beats of [split,first,middle,timing.splitBeat(source,2,['丁','新增']),timing.splitBeat(source,1,['一','二','三'])]) assertTimeline(timing.writeBeats(beats),10)
    assert.deepEqual(['① 0-2秒：甲','2. 2～4秒：乙'].map(timing.beatText),['甲','乙'])
    const dense=timing.normalizeBeats(Array(21).fill('甲'),4)
    assertTimeline(timing.writeBeats(timing.changeBeatEnd(dense,0,-10)),4)
  })
  check('v13 旧数据加载按对白权重分配、幂等迁移，视频直接取编辑时间段',()=>{
    const project=structuredClone(seed);project.segments[0].dur=10;project.shots[0].timeline='① 甲\n② 说：“一二三四五六七八九十”\n③ 丙'
    migrateProjects([project]);const before=project.shots[0].timeline;const beats=assertTimeline(before,10)
    assert.ok(beats[1].end-beats[1].start>beats[0].end-beats[0].start);migrateProjects([project]);assert.equal(project.shots[0].timeline,before)
    project.shots[0].timeline='0–2秒：甲。\n2–8秒：乙；\n8–10秒：丙。'
    assert.ok(videoPrompts.buildVideoPrompt(project.shots[0],project,10).includes('0-2秒：甲；2-8秒：乙；8-10秒：丙'))
    assert.ok(videoPrompts.buildVideoPrompt(project.shots[0],project,15).includes('0-3秒：甲；3-12秒：乙；12-15秒：丙'))
  })
  check('v13 manual 差额优先加给 15 秒以下最长段，超过 15 秒只提示',()=>{
    assert.deepEqual(validation.fixTotal([5,5,10],45),[15,10,20])
    const rows=[{type:'meta',style:'写实电影风格'},{type:'segment',ordinal:1,title:'甲',text:'甲',duration_seconds:20}]
    const notes=captureWarnings(()=>validation.validateSegments(rows,'甲','auto'))
    assert.equal(rows[1].duration_seconds,20);assert.ok(notes.some(n=>n.includes('超过 15 秒')))
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
    const row=protocol.encodeShot(seed.shots[0],1)
    assert.throws(()=>protocol.parseShots(protocol.jsonl([{...row,shot:'@不存在的角色在@客厅'}]),seed,[1]))
    assert.doesNotThrow(()=>protocol.parseShots(protocol.jsonl([{...row,timeline:['停留十秒','转身']}]),seed,[1]))
  })
  check('v16：资产跨类型重名拒绝、空输出拒绝，旧段号字段丢弃',()=>{
    const rows=mockText.mockAssets(seed).text.split('\n').map(JSON.parse)
    assert.throws(()=>protocol.parseAssets(protocol.jsonl([{...rows[0],kind:'character'},rows[0]]),seed.segments))
    assert.throws(()=>protocol.parseAssets(protocol.jsonl(rows.filter(r=>r.kind!=='scene')),seed.segments))
    assert.doesNotThrow(()=>protocol.parseAssets(protocol.jsonl(rows.map(r=>({...r,segment_ordinals:[999]}))),seed.segments))
  })
  check('v8：用户输入中的美元替换符不会改写原文',()=>{
    const text="台词：$&、$`、$'"
    assert.ok(prompts.buildSegmentUserMessage({...seed,script:text}).endsWith(text))
    assert.ok(prompts.buildAssetUserMessage([{...seed.segments[0],text}],text).includes(text))
    const project={...seed,style:text,segments:[{...seed.segments[0],text}],config:{...seed.config,shotStyle:text}}
    assert.ok(prompts.buildShotUserMessage(project,[1]).includes(text))
  })
  check('v8：文档解析错误指出缺少的章节，模板 A/B 使用项目风格',()=>{
    assert.throws(()=>new prompts.PromptBook('缺少章节'),/SEGMENT/)
    const plain=videoPrompts.buildReferenceImagePrompt(seed.assets[0],seed)
    assert.ok(plain.includes('画面风格：写实电影风格'))
    assert.ok(videoPrompts.buildReferenceImagePrompt(seed.assets[0],{...seed,style:'3D 卡通'}).includes('画面风格：3D 卡通'))
  })
  check('v8：源码和构建产物无密钥，生产构建无费用角标',()=>{
    const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)])
    for(const path of [...files('src'),...files('server'),...files('scripts'),...files('dist'),'vite.config.ts']) {
      const content=readFileSync(path)
      assert.ok(!/sk-or-v1-[A-Za-z0-9_-]{20,}/.test(content.toString()), '检测到密钥泄露：'+path)
      if(path.startsWith('dist/')) assert.ok(!content.includes(Buffer.from('已花 $')), '生产构建包含费用角标')
    }
  })

  // Real DOM event paths with visible geometry and wall-clock timers.
  await resetLive();state().updateSegment('s1',{dur:10});state().updateShot('sh1',{timeline:'0–3秒：甲乙\n3–7秒：丙\n7–10秒：丁'})
  const getRect=HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect=function(){return {top:100,left:100,right:600,bottom:300,width:500,height:200,x:100,y:100,toJSON(){}}}
  try {
    await mountLive('/src/steps/Step4Shots.tsx')
    const cell=()=>container.querySelector('#shot-sh1 [data-shot-field="timeline"]')
    const spinner=()=>cell()?.querySelector('[aria-label="正在重排时间"]')
    await act(async()=>state().updateSegment('s1',{dur:15}))
    check('v13 可见节奏格立即转圈，不能进入编辑，存储已重排',()=>{assert.ok(spinner());assert.equal(cell().getAttribute('aria-busy'),'true');assertTimeline(p().shots[0].timeline,15)})
    await click(cell().querySelector('.cursor-text'));assert.equal(beats().length,0)
    await tick(550);await act(async()=>state().updateSegment('s1',{dur:20}));await tick(550)
    check('v13 快速连续改时长以最后一次重新计满一秒',()=>assert.ok(spinner()))
    await tick(500)
    check('v13 一秒后转圈结束，显示最后时长的时间段',()=>{assert.ok(!spinner());assert.match(cell().textContent,/20秒/);assertTimeline(p().shots[0].timeline,20)})
    await click(cell().querySelector('.cursor-text'))
    await typeRich(beats()[0],'0-5.5秒：甲乙');await act(async()=>Simulate.blur(beats()[0]));await tick(750)
    check('v13 编辑器结束点四舍五入，后拍起点自动跟随',()=>{const b=assertTimeline(p().shots[0].timeline,20);assert.equal(b[0].end,6);assert.equal(b[1].start,6)})
    const originalEnds=timing.timelineLines(p().shots[0].timeline).map(timing.readBeat)
    await typeRich(beats()[2],`${originalEnds[2].start}-25秒：丁`);await act(async()=>Simulate.blur(beats()[2]));await tick(750)
    check('v13 编辑器改最后结束点同步左侧时长，前拍不变、不转圈',()=>{assert.equal(p().segments[0].dur,25);assert.equal(container.querySelector('[aria-label="镜头 01 时长"]').value,'25');assert.deepEqual(timing.timelineLines(p().shots[0].timeline).map(timing.readBeat).slice(0,2),originalEnds.slice(0,2));assert.ok(!spinner())})
    await typeRich(beats()[0],'未保存的正文')
    await act(async()=>state().updateSegment('s1',{dur:15}))
    check('v15 打开的编辑器转圈期间保留正文并禁用编辑',()=>{assert.ok(spinner());assert.equal(beats().length,3);assert.ok(beats()[0].closest('[inert]'));assert.ok(container.textContent.includes('未保存的正文'))})
    await tick(1100)
    check('v13 重排保留待保存正文，旧自动保存不能回滚时长',()=>{assert.equal(p().shots[0].dur,15);assert.equal(bodyTexts()[0],'未保存的正文');assertTimeline(p().shots[0].timeline,15)})
    await key(beats()[0],'Escape')
    await click(container.querySelector('#shot-sh1 button[title="更多"]'));await click(button('编辑镜头详情'))
    await typeRich(beats()[0],'抽屉待保存正文');await act(async()=>state().updateSegment('s1',{dur:20}));await tick(1100)
    check('v13 抽屉重排保留待保存内容，自动保存不覆盖新时长',()=>{assert.equal(bodyTexts()[0],'抽屉待保存正文');assert.equal(p().shots[0].dur,20);assertTimeline(p().shots[0].timeline,20)})
  } finally {HTMLElement.prototype.getBoundingClientRect=getRect}
  await resetLive();await mountLive('/src/steps/Step4Shots.tsx')
  await act(async()=>state().updateSegment('s1',{dur:17}))
  check('v13 屏幕外时间段直接更新、不等待转圈',()=>assert.ok(!container.querySelector('[aria-label="正在重排时间"]')))

  // v14: row text edits, native focus/blur, autosave and status precedence.
  check('v14 时间整理不改正文空格和 @引用，损坏前缀的光标偏移仍按正文计算',()=>{
    const source=timing.normalizeBeats(['0-3秒：甲','3-7秒：乙','7-10秒：丙'],10)
    const result=timing.editBeat(source,1,'4-7秒：  @苏可转身  ')
    assert.equal(result[1].text,'  @苏可转身  ');assert.equal(result[0].end,4)
    assert.equal(timing.editableBeatText('乱-码秒：甲乙'),'甲乙')
  })
  check('v14 旧 en dash 数据迁移为标准半角连接符，保持正文与时间',()=>{
    const project=structuredClone(seed);project.segments[0].dur=10;project.shots[0].dur=10
    project.shots[0].timeline='0–3秒：@苏可甲\n3–7秒:乙\n7–10秒：丙'
    migrateProjects([project]);assert.equal(project.shots[0].timeline,'0-3秒：@苏可甲\n3-7秒：乙\n7-10秒：丙')
  })
  await resetLive()
  state().updateSegment('s1',{dur:10});state().updateShot('sh1',{timeline:'0-3秒：甲\n3-7秒：乙\n7-10秒：丙'})
  p().shots[0].video.state='done';p().shots[0].video.versions=[{id:'v14',dur:10}];p().shots[0].outdated=[]
  await mountLive('/src/steps/Step4Shots.tsx')
  await click(container.querySelector('#shot-sh1 [data-shot-field="timeline"] .cursor-text'))
  const leaveBeat=async(from,to)=>act(async()=>{beats()[from].focus();beats()[to].focus()})
  await typeRich(beats()[1],'4-7秒：@苏可乙改');await leaveBeat(1,2)
  check('v14 离开第二拍时起点带动前拍结尾，正文和资产标签保留',()=>{
    assert.deepEqual(beats().map(e=>e.textContent),['0-4秒：甲','4-7秒：@苏可乙改','7-10秒：丙'])
    assert.ok(beats()[1].querySelector('[data-asset-id="a2"]'))
  })
  await typeRich(beats()[0],'0-3.6秒：甲改');await leaveBeat(0,1)
  check('v14 小数四舍五入，改前拍结尾带动后拍起点',()=>assert.deepEqual(beats().slice(0,2).map(e=>e.textContent),['0-4秒：甲改','4-7秒：@苏可乙改']))
  await typeRich(beats()[0],'2-5秒：甲再改');await leaveBeat(0,1)
  check('v14 第一拍起点恢复 0，结束点独立生效',()=>{assert.equal(beats()[0].textContent,'0-5秒：甲再改');assert.match(beats()[1].textContent,/^5-7秒：/)})
  for(const [raw,body] of [['5-5秒：零长度正文','零长度正文'],['6.6-7秒：舍入不足一秒','舍入不足一秒'],['0-7秒：前拍不足一秒','前拍不足一秒'],['5-11秒：后拍不足一秒','后拍不足一秒'],['5-4秒：逆序正文','逆序正文'],['删除时间后的@苏可正文','删除时间后的@苏可正文'],['停顿几秒：然后@苏可转身','停顿几秒：然后@苏可转身'],['乱-码秒：乱码时间后的@苏可正文','乱码时间后的@苏可正文']]) {
    await typeRich(beats()[1],raw);await leaveBeat(1,2)
    check('v14 无效时间恢复，正文保留：'+body,()=>{assert.equal(beats()[1].textContent,'5-7秒：'+body);assert.equal(timing.readBeat(beats()[0].textContent).end,5);assert.equal(timing.readBeat(beats()[2].textContent).start,7)})
  }
  await typeRich(beats()[1],'4-7秒：自动保存@苏可');await tick(750)
  check('v14 未失焦也在自动保存前整理，asset_ids 重算并标记镜头字段',()=>{
    assert.equal(beats()[1].textContent,'4-7秒：自动保存@苏可');assert.equal(timing.readBeat(p().shots[0].timeline.split('\n')[0]).end,4)
    assert.ok(p().shots[0].assetIds.includes('a2'));assert.ok(reasons().some(r=>r.key==='shotEdit'))
  })
  await key(beats()[1],'Escape');if(beats().length)await key(beats()[1],'Escape')
  await act(async()=>state().updateSegment('s1',{text:'v15 上游原文修改'}))
  const status=()=>container.querySelector('#shot-sh1 [data-shot-status]')
  check('v14 左栏只有两行，待更新替代已生成且无深色底块、原因保留',()=>{
    assert.equal(status().parentElement.children.length,2);assert.equal(status().textContent,'待更新忽略')
    assert.ok(status().querySelector('.lucide-triangle-alert'));assert.ok(!status().textContent.includes('视频已生成'))
    assert.ok(status().firstElementChild.title.includes('段落原文已修改'));assert.ok(!status().firstElementChild.className.includes('bg-'))
  })
  const visibilityStyle=document.createElement('style')
  visibilityStyle.textContent=readFileSync('src/index.css','utf8').slice(readFileSync('src/index.css','utf8').indexOf('/* Only Step 4'))
  document.head.append(visibilityStyle)
  check('v14 忽略默认隐藏，CSS 由整行悬停或键盘焦点显示',()=>{
    assert.equal(window.getComputedStyle(status().querySelector('button')).visibility,'hidden')
    assert.match(visibilityStyle.textContent,/\.shot-table-row:hover \.shot-ignore,/)
    assert.match(visibilityStyle.textContent,/\.shot-table-row:focus-within \.shot-ignore\s*\{ visibility: visible;/)
  })
  await act(async()=>container.querySelector('[aria-label="镜头 01 时长"]').focus())
  // jsdom caches pseudo-class styles until a DOM mutation; invalidate after input.
  status().parentElement.parentElement.dataset.cssRefresh='focus'
  check('v14 键盘焦点进入整行后忽略可见',()=>assert.equal(window.getComputedStyle(status().querySelector('button')).visibility,'visible'))
  await act(async()=>document.activeElement.blur())
  const hoverRow=status().parentElement.parentElement
  hoverRow.dispatchEvent(new dom.window.MouseEvent('mouseover',{bubbles:true}));hoverRow.dataset.cssRefresh='hover'
  check('v14 悬停整行后忽略可见',()=>assert.equal(window.getComputedStyle(status().querySelector('button')).visibility,'visible'))
  hoverRow.dispatchEvent(new dom.window.MouseEvent('mouseout',{bubbles:true}));hoverRow.dataset.cssRefresh='leave'
  check('v14 离开整行后忽略重新隐藏',()=>assert.equal(window.getComputedStyle(status().querySelector('button')).visibility,'hidden'))
  visibilityStyle.remove()
  await act(async()=>useStore.setState(s=>({projects:s.projects.map(project=>({...project,shots:project.shots.map(shot=>shot.id==='sh1'?{...shot,video:{...shot.video,state:'generating'}}:shot)}))})))
  check('v14 生成中优先于待更新，第二行只有一个状态',()=>{assert.equal(status().textContent,'视频生成中');assert.ok(!status().querySelector('button'))})
  await act(async()=>useStore.setState(s=>({projects:s.projects.map(project=>({...project,shots:project.shots.map(shot=>shot.id==='sh1'?{...shot,video:{...shot.video,state:'done'}}:shot)}))})))
  await click(status().querySelector('button'))
  check('v15 忽略 A 后恢复已生成状态，B 原因仍保留',()=>{assert.equal(status().textContent,'视频已生成');assert.ok(!hasA(p().shots[0]));assert.ok(hasB(p().shots[0]))})
  await act(async()=>state().dismissOutdated('sh1'))
  await click(container.querySelector('#shot-sh1 [data-shot-field="timeline"] .cursor-text'))
  await typeRich(beats()[2],'7-99秒：尾拍扩展');await leaveBeat(2,1);await tick(750)
  check('v14 最后结束点 clamp 到 30，只改变尾拍且标记时长',()=>{
    const rows=assertTimeline(p().shots[0].timeline,30);assert.equal(rows[0].end,4);assert.equal(rows[1].end,7);assert.equal(rows[2].text,'尾拍扩展')
    assert.ok(reasons().some(r=>r.key==='duration'));assert.ok(!reasons().some(r=>r.key==='shotEdit'));assert.ok(!container.querySelector('[aria-label="正在重排时间"]'))
  })
  await typeRich(beats()[2],'7-1秒：小于相邻边界');await leaveBeat(2,1);await tick(750)
  check('v14 尾拍 clamp 后仍不足一秒则恢复原时间，正文保留',()=>{assert.equal(p().shots[0].dur,30);assert.equal(beats()[2].textContent,'7-30秒：小于相邻边界')})
  await typeRich(beats()[0],'0-5秒：关闭前保存@苏可');await key(beats()[0],'Escape');if(beats().length)await key(beats()[0],'Escape')
  check('v14 立即关闭编辑器也保存整理后的时间和正文',()=>{assert.equal(p().shots[0].timeline.split('\n')[0],'0-5秒：关闭前保存@苏可');assert.match(p().shots[0].timeline.split('\n')[1],/^5-7秒：/)})

  // v15: display scope is separate from generation selection and stored reasons.
  check('v15 产品源码（proposal 除外）不再包含旧字段名',()=>{
    const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='proposal'?[]:files(join(dir,e.name))):[join(dir,e.name)])
    for(const path of files('src').filter(p=>/\.(tsx?|css)$/.test(p)))assert.ok(!readFileSync(path,'utf8').includes('画面'+'节奏'),path)
  })
  await resetLive();await state().generateVideos(['sh1']);state().updateSegment('s1',{dur:12})
  await mountLive('/src/steps/Step4Shots.tsx',{},true)
  const stepHint=(n)=>buttons().find(b=>b.textContent.includes(`STEP 0${n}`))
  check('v15 已有视频改时长：第 4 步保持已生成，无提示条和黄点，仍默认勾选',()=>{
    assert.equal(container.querySelector('#shot-sh1 [data-shot-status]').textContent,'视频已生成')
    assert.ok(!button('全部忽略'));assert.equal(stepHint(4).title,'');assert.ok(!stepHint(4).querySelector('.bg-amber-400'))
    assert.ok(container.querySelector('#shot-sh1 input[type="checkbox"]').checked)
    assert.equal(stepHint(5).title,'1 个视频待更新');assert.ok(stepHint(5).querySelector('.bg-amber-400'))
  })
  await mountLive('/src/steps/Step2Segments.tsx',{},true)
  check('v15 B 类在第 2 步不显示镜头待更新',()=>assert.ok(!container.textContent.includes('镜头 01 待更新')))
  await mountLive('/src/steps/Step5Video.tsx',{},true)
  check('v15 B 类成片卡片待更新，悬停原因与步骤条数量正确',()=>{
    assert.ok(button('待更新').title.includes('时长改为 12 秒'));assert.equal(stepHint(5).title,'1 个视频待更新')
  })
  await act(async()=>state().updateSegment('s1',{text:'v15 改段落原文'}))
  await mountLive('/src/steps/Step2Segments.tsx',{},true)
  check('v15 A 类在第 2 步显示，只列上游原因',()=>{
    const badge=[...container.querySelectorAll('[title]')].find(e=>e.textContent==='镜头 01 待更新')
    assert.equal(badge.title,'段落原文已修改');assert.equal(stepHint(4).title,'1 个镜头待更新');assert.equal(stepHint(5).title,'1 个视频待更新')
  })
  await mountLive('/src/steps/Step5Video.tsx',{},true)
  check('v15 A/B 混合成片卡片悬停列出全部原因',()=>{
    assert.ok(button('待更新').title.includes('段落原文已修改'));assert.ok(button('待更新').title.includes('时长改为 12 秒'))
  })
  await mountLive('/src/steps/Step4Shots.tsx',{},true)
  check('v15 A/B 混合第 4 步只显示 A 原因与对应提示条',()=>{
    assert.equal(container.querySelector('#shot-sh1 [data-shot-status]').firstElementChild.title,'段落原文已修改')
    assert.ok(button('全部忽略'));assert.equal(stepHint(4).title,'1 个镜头待更新')
  })
  await click(button('忽略'))
  check('v15 第 4 步单条忽略仅清 A，B 与第 5 步黄点保留',()=>{
    assert.ok(!hasA(p().shots[0]));assert.ok(hasB(p().shots[0]));assert.equal(stepHint(4).title,'');assert.equal(stepHint(5).title,'1 个视频待更新')
    assert.equal(container.querySelector('#shot-sh1 [data-shot-status]').textContent,'视频已生成');assert.ok(!button('全部忽略'))
  })
  await act(async()=>{state().updateSegment('s1',{text:'再次修改原文'});state().updateSegment('s2',{text:'另一条原文'})})
  await click(button('全部忽略'))
  check('v15 第 4 步全部忽略仅清所有 A，保留 B',()=>{
    assert.ok(p().shots.every(s=>!hasA(s)));assert.ok(hasB(p().shots[0]));assert.equal(stepHint(4).title,'');assert.equal(stepHint(5).title,'1 个视频待更新')
  })
  await act(async()=>state().updateSegment('s1',{text:'保留前修改原文'}))
  await mountLive('/src/steps/Step5Video.tsx',{},true);await click(button('待更新'));await click(button('保留当前视频'))
  check('v15 第 5 步保留同时清 A/B，卡片与两处黄点消失',()=>{
    assert.deepEqual(reasons(),[]);assert.ok(!button('待更新'));assert.equal(stepHint(4).title,'');assert.equal(stepHint(5).title,'')
  })
  await act(async()=>{state().updateSegment('s1',{text:'生成前修改原文'});state().updateSegment('s1',{dur:15})})
  await act(async()=>state().generateVideos(['sh1']))
  check('v15 mock 重新生成视频成功清 A/B 和成片黄点',()=>{assert.deepEqual(reasons(),[]);assert.ok(!button('待更新'));assert.equal(stepHint(5).title,'')})
  await resetLive();state().updateSegment('s1',{text:'无视频的上游改动'})
  await mountLive('/src/steps/Step4Shots.tsx',{},true)
  check('v15 无视频的 A 类只计镜头黄点，不计视频黄点',()=>{
    assert.equal(stepHint(4).title,'1 个镜头待更新');assert.ok(!stepHint(5).querySelector('.bg-amber-400'))
  })
  await resetLive();await state().generateVideos(['sh1'])
  await pausedGeneration(1200,async release=>{
    work=state().generateVideos(['sh1']);state().updateSegment('s1',{text:'生成期间 A'});state().updateSegment('s1',{dur:12})
    state().dismissAllOutdated('design');await release();await work
  })
  check('v15 第 4 步忽略不会清除生成期间积压的 B 原因',()=>{assert.ok(!hasA(p().shots[0]));assert.ok(hasB(p().shots[0]))})

  await resetLive()
  localStorage.removeItem('phanthy-timeline-width-v15')
  localStorage.setItem(widthKey,JSON.stringify({shotInfo:208,shot:320,timeline:480,action:200}))
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v15 仅清旧时间安排列宽，其他列记忆保留',()=>{
    assert.deepEqual(JSON.parse(localStorage.getItem(widthKey)),{shotInfo:208,shot:320,action:200});assert.equal(tracks()[3],240)
    assert.equal(tracks()[2],320);assert.equal(tracks()[1],208);assert.equal(tracks()[4],200)
  })
  await act(async()=>Simulate.keyDown(resizeHandle(),{key:'ArrowRight'}))
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v15 列宽迁移仅一次，后续用户调整在重新挂载时保留',()=>{assert.equal(tracks()[3],256);assert.equal(JSON.parse(localStorage.getItem(widthKey)).timeline,256)})
  await act(async()=>Simulate.doubleClick(resizeHandle()))
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v15 双击恢复时间安排列默认值，不影响其他记忆',()=>{assert.equal(tracks()[3],240);assert.equal(tracks()[2],320)})
  localStorage.removeItem(widthKey)
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v15 时间安排与画面描述默认等宽 240',()=>{assert.equal(tracks()[3],240);assert.equal(tracks()[3],tracks()[2])})

  const reflowStyle=document.createElement('style')
  reflowStyle.textContent=readFileSync('src/index.css','utf8').split('/* Shared by the timeline cell, full-text editor and detail drawer. */')[1]
  document.head.append(reflowStyle)
  const normalRect=HTMLElement.prototype.getBoundingClientRect
  let reflowHeight=100
  HTMLElement.prototype.getBoundingClientRect=function(){return {top:100,left:100,right:340,bottom:100+reflowHeight,width:240,height:reflowHeight,x:100,y:100,toJSON(){}}}
  try {
    await resetLive();await mountLive('/src/steps/Step4Shots.tsx')
    await act(async()=>state().updateSegment('s1',{dur:12}))
    const timelineCell=()=>container.querySelector('#shot-sh1 [data-shot-field="timeline"]')
    check('v15 表格重排保留正文、35% 透明度与状态说明，行高不变',()=>{
      const cell=timelineCell(),content=cell.querySelector('.timeline-reflow-content')
      assert.ok(content.textContent.includes('秒：'));assert.equal(window.getComputedStyle(content).opacity,'0.35');assert.ok(content.hasAttribute('inert'))
      assert.ok(cell.querySelector('[role="status"]').textContent.includes('正在重排时间'));assert.equal(cell.parentElement.style.height,'7.5rem')
      assert.equal(cell.querySelector('path').getAttribute('stroke-linecap'),'round')
    })
    await tick(1100)
    check('v15 重排结束保留遮罩节点执行 200ms 淡出，正文恢复',()=>{
      const cell=timelineCell(),overlay=cell.querySelector('.timeline-reflow-overlay')
      assert.ok(!cell.querySelector('[role="status"]'));assert.equal(window.getComputedStyle(cell.querySelector('.timeline-reflow-content')).opacity,'1')
      assert.ok(window.getComputedStyle(overlay).transition.includes('200ms'));assert.equal(overlay.getAttribute('aria-hidden'),'true')
    })
    await click(timelineCell().querySelector('.cursor-text'))
    const editorBefore=beats()[0]
    await act(async()=>state().updateSegment('s1',{dur:15}))
    check('v15 全文编辑器重排沿用同组件，编辑器节点与正文保留',()=>{
      assert.equal(beats()[0],editorBefore);assert.ok(beats()[0].closest('[inert]'));assert.ok(beats()[0].closest('.timeline-reflow').querySelector('[role="status"]'))
    })
    await tick(1100);await key(beats()[0],'Escape')
    await click(container.querySelector('#shot-sh1 button[title="更多"]'));await click(button('编辑镜头详情'))
    const drawerBefore=beats()[0]
    await act(async()=>state().updateSegment('s1',{dur:20}))
    check('v15 详情抽屉重排沿用同组件，编辑器节点与正文保留',()=>{
      assert.equal(beats()[0],drawerBefore);assert.ok(beats()[0].closest('[inert]'));assert.ok(beats()[0].closest('.timeline-reflow').querySelector('[role="status"]'))
    })
    await tick(1100)
    reflowHeight=30
    await mount('/src/components/TimelineReflow.tsx',{busy:true,children:'短格正文'})
    check('v15 低高度仅显示圆弧，仍有可访问状态说明',()=>{
      assert.ok(!container.querySelector('.timeline-reflow-label'));assert.ok(container.querySelector('svg'));assert.equal(container.querySelector('[role="status"]').getAttribute('aria-label'),'正在重排时间')
    })
    check('v15 共享动画有淡入淡出、0.8 秒匀速圆弧与 reduced-motion 禁转',()=>{
      assert.match(reflowStyle.textContent,/opacity 150ms/);assert.match(reflowStyle.textContent,/opacity 200ms/)
      assert.match(reflowStyle.textContent,/\.8s linear infinite/);assert.match(reflowStyle.textContent,/@media \(prefers-reduced-motion: reduce\).*animation: none/)
    })
  } finally {HTMLElement.prototype.getBoundingClientRect=normalRect;reflowStyle.remove()}

  await act(async()=>root.unmount());root=undefined
  console.log(`\n${results.length} checks passed.`)
} finally {
  globalThis.setTimeout=realTimeout
  await server.close()
  dom.window.close()
}
