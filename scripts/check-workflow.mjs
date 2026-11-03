// Run with: node scripts/check-workflow.mjs. Uses existing Vite/React/jsdom only.
// Isolated localStorage and accelerated mock delays; never touches browser projects.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
const realTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...args) => realTimeout(fn, [900, 1200, 1400, 1600].includes(ms) ? 0 : ms, ...args)
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
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
  const reset = (project = seed) => useStore.setState({ projects: [structuredClone(project)], currentId: project.id, step: 1 })
  state().createProject('验收隔离项目')
  state().setScript('苏可与外卖员的故事')
  let work = state().startSegments(8)
  check('确认即推进：拆解', () => { assert.equal(state().step, 2); assert.equal(p().segStatus, 'generating'); assert.deepEqual(stepLocked(p()), [true, false, false, false, false]) })
  await work
  check('1：8 秒拆解与总时长', () => { assert.equal(p().config.segDur, 8); assert.deepEqual(p().segments.map((s) => s.dur), [8, 8, 8]); assert.equal(p().segments.reduce((n, s) => n + s.dur, 0), 24) })
  work = state().startAssets(); assert.equal(state().step, 3); assert.equal(p().assetStatus, 'generating'); await work
  work = state().startShots([1, 2, 3]); assert.equal(state().step, 4); assert.equal(p().shotStatus, 'generating'); await work
  const id1 = p().shots[0].id
  state().updateSegment('s1', { dur: 12 })
  check('2：时长待更新与改回移除', () => {
    assert.equal(p().shots[0].outdated[0].text, '时长已改为 12 秒，当前描述按 8 秒编写')
    state().updateSegment('s1', { dur: 8 }); assert.equal(p().shots[0].outdated.length, 0)
  })
  await state().generateVideos([id1]); state().updateSegment('s1', { dur: 12 }); await state().regenerateShot(id1)
  check('3：12 秒时间槽、清除待更新、保留旧视频', () => {
    const s = p().shots[0]; assert.equal(s.dur, 12); assert.deepEqual(s.timeline.split('\n').map((l) => l.split('：')[0]), ['0–5秒', '5–10秒', '10–12秒']); assert.equal(s.outdated.length, 0); assert.equal(s.video.versions[0].dur, 8); assert.equal(s.video.staleReason, '镜头已重新生成')
  })
  check('时间槽边界 4/5/6/7/10/11/12/15', () => {
    for (const [dur, slots] of [[4,[[0,4]]],[5,[[0,5]]],[6,[[0,6]]],[7,[[0,5],[5,7]]],[10,[[0,5],[5,10]]],[11,[[0,5],[5,11]]],[12,[[0,5],[5,10],[10,12]]],[15,[[0,5],[5,10],[10,15]]]]) assert.deepEqual(utils.timeSlots(dur), slots)
    assert.equal(utils.buildTimeline(['0–5秒：甲','5–10秒：乙','10–15秒：丙'], 4), '0–4秒：甲；乙；丙')
  })
  check('4：整数与范围归一', () => { assert.equal(clampDuration(3), 4); assert.equal(clampDuration(20), 15); assert.equal(clampDuration(7.8), 8) })
  check('5：15+12 秒价格 4,253', () => assert.equal(videoCost(15) + videoCost(12), 4253))
  check('6：模型时长能力', () => { assert.equal(supportsDuration('Kling 2.1', 15), false); assert.equal(supportsDuration('Kling 2.1', 12), false); assert.equal(supportsDuration('Seedance 2.0', 12), true); assert.equal(supportsDuration('Seedance 1.5', 15), false) })
  await state().generateVideos([id1]); state().updateSegment('s1', { dur: 15 })
  check('7：多版本时长不可变、最新自动采用', () => { assert.deepEqual(p().shots[0].video.versions.map((v) => v.dur), [8,12]); assert.equal(utils.preferredVersion(p().shots[0].video).dur, 12); assert.deepEqual(p().shots[0].video.versions.map((v) => v.preferred), [false,true]) })
  check('8：仅剧本锁定，未到达仍禁入', () => { assert.deepEqual(stepLocked(p()), [true,false,false,false,false]); assert.deepEqual(stepUnlocked({...p(), assetStatus:'none', shotStatus:'none', shots:[]}), [true,true,false,false,false]) })
  reset()
  state().updateSegment('s2', { text: p().segments[1].text + '修改。' })
  check('10/11：正文传播、提示与保留不扣费', () => {
    assert.equal(p().assetsHint, true); assert.equal(state().toast, '已保存，镜头 02 需要更新'); const balance = p().balance
    state().dismissOutdated('sh2'); assert.equal(p().balance, balance); assert.equal(p().shots[1].outdated.length, 0)
  })
  state().updateSegment('s2', { dur: 12 }); state().dismissOutdated('sh2')
  check('11b：保留描述恢复时长', () => { assert.equal(p().segments[1].dur, 15); assert.equal(state().toast, '已保留当前描述，时长恢复为 15 秒') })
  await state().extractAssets()
  check('10：重新提取清除提示、全部镜头标记', () => { assert.equal(p().assetsHint, false); assert.equal(utils.outdatedShots(p()).length, 3) })
  reset(); await state().generateVideos(['sh1','sh2','sh3'])
  state().updateAsset('a2', { desc: '新外观' }); state().updateAsset('a2', { desc: '新外观二' })
  check('12：资产描述传播及同 key 去重', () => { assert.equal(utils.outdatedShots(p()).length, 3); assert.equal(p().shots[0].outdated.length, 1) })
  p().shots.forEach((s) => state().dismissOutdated(s.id)); await state().generateAssetImages(['a2'])
  check('12：参考图只标视频 stale', () => { assert.equal(utils.outdatedShots(p()).length, 0); assert.ok(p().shots.every((s) => s.video.staleReason === '角色「苏可」参考图已更新')) })
  reset(); const hits = utils.renameOccurrences(p(), '苏可'); state().renameAsset('a2', '苏苏', true)
  check('13：同步替换覆盖所有命中，不产生待更新/stale', () => { assert.ok(hits.length > 3); assert.equal(utils.renameOccurrences(p(), '苏可').length, 0); assert.equal(p().assets[1].name, '苏苏'); assert.equal(utils.outdatedShots(p()).length, 0); assert.ok(p().shots.every((s) => !s.video.stale)) })
  const others = structuredClone([p().shots[0], p().shots[2]])
  await state().generateShots([2])
  check('14：局部生成保留其他镜头', () => assert.deepEqual([p().shots[0],p().shots[2]], others))
  state().addSegment('第四段', '苏苏走出客厅。', 7)
  check('15：新段落未生成选择器', () => assert.deepEqual(utils.ungeneratedSegments(p()).map((s) => s.no), [4]))
  await state().generateShots([4]); await state().generateVideos([p().shots[3].id]); state().deleteSegment('s2')
  check('16：删除段落级联与编号', () => { assert.equal(p().shots.length, 3); assert.ok(!p().shots.some((s) => s.segId === 's2')); assert.deepEqual(p().shots.map((s) => s.no), [1,2,3]); assert.equal(p().shots[2].video.versions.length, 1) })
  reset(); state().updateSegment('s2', {dur:12}); state().updateSegment('s3', {text:'新原文'})
  await state().startVideos(['sh1','sh2','sh3'])
  check('17：待更新镜头按旧时长生成', () => { assert.equal(state().step,5); assert.equal(utils.outdatedShots(p()).length,2); assert.ok(p().shots.every((s) => s.video.versions[0].dur === 15)) })
  work = state().generateShots([2]); const bal = p().balance; await state().extractAssets()
  check('18：生成互斥', () => { assert.equal(p().assetStatus,'done'); assert.equal(p().balance,bal); assert.equal(utils.shotGenerationBlocked(p()),'正在生成镜头，完成后可操作') }); await work
  check('19/20：固定版式、外观提示词', () => { assert.ok(templates.buildAssetImagePrompt(p().assets[0]).startsWith(templates.CHAR_LAYOUT + '\n\n')); assert.ok(templates.buildAssetImagePrompt(p().assets[2]).startsWith(templates.SCENE_LAYOUT)); assert.ok(!p().assets[0].prompt.includes('三视图')) })
  const legacy = structuredClone(seed); delete legacy.config.segDur
  legacy.segments.forEach((s) => {s.dur = '15s'}); legacy.segments[1].dur = 'invalid'
  legacy.shots.forEach((s) => { delete s.segId; delete s.dur; s.video.versions = [{tag:'v1',preferred:true}] })
  check('21：原 LS_KEY 旧数据迁移', () => { const m=migrateProjects([legacy])[0]; assert.equal(m.config.segDur,15); assert.deepEqual(m.segments.map((s)=>s.dur),[15,15,15]); assert.deepEqual(m.shots.map((s)=>s.segId),['s1','s2','s3']); assert.ok(m.shots.every((s)=>s.dur===15&&s.video.versions[0].dur===15)) })
  check('22：项目状态、封面及采用版本回退', () => { assert.equal(utils.projectStatus(seed),'待生成视频'); const video=p().shots[0].video; assert.equal(utils.preferredVersion({...video,versions:video.versions.map((v)=>({...v,preferred:false}))}).tag,'v1'); assert.equal(utils.projectCover(p()),p().shots[0].video.versions[0].url) })

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
  reset()
  let saved
  await mount('/src/components/DurationChip.tsx',{value:15,title:'段落时长',onSave:n=>{saved=n}})
  await click(button('15 秒'))
  let input=container.querySelector('input')
  await change(input,'3'); await act(async()=>Simulate.blur(input))
  check('4 UI：越界收回并闪红',()=>{assert.equal(input.value,'4');assert.ok(container.querySelector('.text-red-400'))})
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  assert.equal(saved,undefined)
  await click(button('15 秒')); input=container.querySelector('input');await change(input,'12')
  await act(async()=>{Simulate.keyDown(input,{key:'Enter'});window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter'}))})
  check('DurationChip Enter 保存、Esc 取消',()=>assert.equal(saved,12))
  await mount('/src/steps/VideoConfirmModal.tsx',{shots:[{...seed.shots[0],dur:15},{...seed.shots[1],dur:12,outdated:[{kind:'segDur',text:'时长修改'}]}],balance:10000,onClose(){},onConfirm(){}})
  assert.ok(container.textContent.includes('4,253'))
  await click(button('Seedance 2.0'));await click(button('Kling 2.1'))
  check('6/17 UI：不支持提示置灰，待更新说明',()=>{assert.equal(button('确认并生成 2 段视频').disabled,true);assert.ok(container.textContent.includes('Kling 2.1 仅支持'));assert.ok(container.textContent.includes('仍会按旧描述生成。'))})
  await click(button('Kling 2.1'));await click(button('Seedance 2.0'));assert.equal(button('确认并生成 2 段视频').disabled,false)
  await mount('/src/steps/Step2Segments.tsx',{project:seed})
  check('9 UI：无重新拆解入口，可新增可编辑',()=>{assert.ok(button('新增剧本段落'));assert.ok(!container.textContent.includes('重新拆解'));assert.equal(container.querySelectorAll('button[title="点击编辑标题"]').length,3)})
  await click(container.querySelector('button[title="点击编辑原文"]'));let textarea=container.querySelector('textarea');await change(textarea,'自动保存验收原文')
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  check('11 UI：正文 Escape 立即保存',()=>assert.equal(p().segments[0].text,'自动保存验收原文'))
  await mount('/src/steps/GenShotModal.tsx',{project:p(),onClose(){},onConfirm(){}})
  check('GenShotModal 默认只选待更新',()=>{assert.deepEqual([...container.querySelectorAll('label input')].map((i)=>i.checked),[true,false,false])})
  await mount('/src/steps/Step3Assets.tsx',{project:seed})
  await click(button('重新提取'))
  check('重新提取文案',()=>assert.ok(container.textContent.includes('同名角色和场景会保留已生成的参考图；已生成的镜头会标记为待更新。')))
  await click(button('取消'))
  await click(container.querySelector('button[aria-label="更多操作"]'));await click(button('AI 重新生成图片'))
  check('19 UI：角色版式与比例默认值',()=>{assert.ok(container.textContent.includes('出图版式'));assert.ok(button('16:9'));assert.ok(container.querySelector('textarea').placeholder.includes('只写外观'))})
  await click(button('展开'));assert.ok(container.textContent.includes(templates.CHAR_LAYOUT))
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[2]);await click(button('AI 重新生成图片'))
  check('20 UI：场景版式与 9:16 默认比例',()=>{assert.ok(button('9:16'));assert.ok(container.textContent.includes(templates.SCENE_LAYOUT_SUMMARY));assert.ok(container.querySelector('textarea').placeholder.includes('只写空间'))})
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('编辑角色设定'))
  const name=container.querySelector('input[aria-label="角色名称"]')
  await change(name,'外卖员')
  check('13 UI：重名禁止保存',()=>{assert.ok(container.textContent.includes('已存在同名角色'));assert.equal(button('保存').disabled,true)})
  await change(name,'苏苏');await click(button('保存'))
  check('13 UI：同步替换预览包含来源与红删绿增',()=>{assert.ok(document.body.textContent.includes('同步替换分镜文本？'));assert.ok(document.body.querySelector('.line-through'));assert.ok(document.body.textContent.includes('段落 01 · 原文'));assert.ok(document.body.textContent.includes('镜头 01 · 画面描述'))})
  await click([...document.querySelectorAll('button')].find((b)=>b.textContent==='同步替换并保存'))
  check('13 UI：同步保存关闭弹窗、不标待更新',()=>{assert.equal(p().assets[1].name,'苏苏');assert.equal(utils.renameOccurrences(p(),'苏可').length,0);assert.equal(utils.outdatedShots(p()).length,1)}) // prior body edit remains; rename adds nothing
  const missingProject=structuredClone(seed);missingProject.segments.push({id:'s4',no:4,title:'新段落',dur:8,text:'苏可走出房门。'})
  await mount('/src/steps/Step4Shots.tsx',{project:missingProject})
  check('15 UI：新段落提示',()=>assert.ok(container.textContent.includes('段落 04 尚未生成镜头')))
  await click(button('去生成'))
  check('15 UI：去生成只选新段落',()=>assert.deepEqual([...container.querySelectorAll('label input')].map((i)=>i.checked),[false,false,false,true]))
  const deletionProject=structuredClone(seed);deletionProject.shots[0].video.versions=[{tag:'v1',dur:15,preferred:true,createdAt:1},{tag:'v2',dur:12,preferred:false,createdAt:2}]
  await mount('/src/steps/Step2Segments.tsx',{project:deletionProject})
  await click(container.querySelector('button[aria-label="删除段落"]'))
  check('16 UI：级联删除确认写明镜号和版本数',()=>assert.ok(container.textContent.includes('对应的镜头 01 及其 2 个视频版本会一起删除，无法恢复。')))
  await mount('/src/steps/Step4Shots.tsx',{project:seed})
  await click(buttons().find((b)=>b.textContent.startsWith('字段')))
  const initialFields=container.querySelectorAll('#shot-sh1 .cursor-text').length
  await click(button('背景范围'))
  check('22 UI：字段显隐',()=>assert.equal(container.querySelectorAll('#shot-sh1 .cursor-text').length,initialFields+1))
  await act(async()=>Simulate.mouseDown(container.querySelector('.fixed.inset-0.z-50')))
  await click(button('筛选'))
  let filterInput=container.querySelector('input[placeholder]')
  await change(filterInput,'快速跟摇')
  const hit=button('03' + '15 秒' + '快速跟摇镜头。起幅对准沙发上的苏可，随其移动快速跟摇，落幅定格在大毛绒熊后探出的苏可') ?? container.querySelector('button[title="定位到该镜头"]')
  dom.window.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true'}
  await click(hit)
  check('22 UI：筛选预览定位与闪动',()=>{assert.ok(container.querySelector('#shot-sh3.row-flash'));assert.equal(container.querySelector('#shot-sh3').dataset.scrolled,'true')})
  await click(container.querySelector('#shot-sh1 .cursor-text'))
  textarea=container.querySelector('textarea');await change(textarea,'单元格自动保存验收');await act(async()=>new Promise(r=>realTimeout(r,750)))
  check('22 UI：单元格自动保存',()=>assert.equal(p().shots[0].shot,'单元格自动保存验收'))
  await act(async()=>Simulate.keyDown(textarea,{key:'Escape'}))
  await click(container.querySelector('#shot-sh1 button[title="更多"]'));await click(button('编辑镜头详情'))
  check('22 UI：详情抽屉仍可用',()=>assert.ok(container.querySelectorAll('textarea').length>=7))
  const pendingProject=structuredClone(seed);pendingProject.shotStatus='generating'
  await mount('/src/steps/Step4Shots.tsx',{project:pendingProject})
  check('18 UI：镜头生成时重生成按钮禁用并有提示',()=>{assert.equal(button('重新生成镜头').disabled,true);assert.equal(button('重新生成镜头').title,'正在生成镜头，完成后可操作')})
  await mount('/src/steps/Step3Assets.tsx',{project:pendingProject})
  check('18 UI：镜头生成时重新提取按钮禁用',()=>assert.equal(button('重新提取').disabled,true))
  pendingProject.shotStatus='done';pendingProject.assetStatus='generating'
  await mount('/src/steps/Step4Shots.tsx',{project:pendingProject})
  check('18 UI：提取时禁止重新生成镜头',()=>{assert.equal(button('重新生成镜头').disabled,true);assert.ok(button('重新生成镜头').title.includes('角色与场景'))})
  const twoVersions=structuredClone(seed.shots[0]);twoVersions.dur=12;twoVersions.video={state:'done',stale:true,staleReason:'镜头已重新生成',versions:[{tag:'v1',dur:8,createdAt:1,preferred:false},{tag:'v2',dur:12,createdAt:2,preferred:true}]}
  await mount('/src/components/VideoPlayer.tsx',{shot:twoVersions,onClose(){}})
  check('7/22 UI：播放器采用版本时长',()=>assert.ok(container.textContent.includes('/ 0:12')))
  await click(button('v1'))
  check('22 UI：切换旧版本按 8 秒播放',()=>assert.ok(container.textContent.includes('/ 0:08')))
  await mount('/src/steps/Step5Video.tsx',{project:{...seed,shots:[twoVersions]}})
  check('7 UI：成片卡片真实时长与 stale 原因',()=>{assert.ok(container.textContent.includes('12 秒'));assert.ok(container.querySelector('[title="镜头已重新生成"]'))})
  await click(container.querySelector('button[title="更多"]'));await click(button('查看镜头信息'))
  check('7 UI：镜头信息显示采用版本时长',()=>assert.ok(container.textContent.includes('时长：12 秒')))
  await act(async()=>root.unmount());root=undefined
  console.log(`\n${results.length} checks passed.`)
} finally {
  globalThis.setTimeout=realTimeout
  await server.close()
  dom.window.close()
}
