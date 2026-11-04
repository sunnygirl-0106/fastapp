// Run with: node scripts/check-workflow.mjs. Uses existing Vite/React/jsdom only.
// Isolated localStorage and accelerated mock delays; never touches browser projects.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
  const reset = (project = seed) => useStore.setState({ projects: [structuredClone(project)], currentId: project.id, step: 1, toast: null })
  state().createProject('验收隔离项目')
  state().setScript('苏可与外卖员的故事')
  let work = state().startSegments('manual', 60)
  check('确认即推进：拆解', () => { assert.equal(state().step, 2); assert.equal(p().segStatus, 'generating'); assert.deepEqual(stepLocked(p()), [true, false, false, false, false]) })
  await work
  check('v5 1：拆解按字数分配 27/16/17 秒并保存目标', () => { assert.equal(p().config.durMode, 'manual'); assert.equal(p().config.targetDur, 60); assert.deepEqual(p().segments.map(s=>s.dur),[27,16,17]) })
  work = state().startAssets(); assert.equal(state().step, 3); assert.equal(p().assetStatus, 'generating'); await work
  work = state().startShots([1, 2, 3]); assert.equal(state().step, 4); assert.equal(p().shotStatus, 'generating'); await work
  check('v5：首次生成沿用段落时长且合计 60 秒', () => { assert.equal(p().shots.reduce((n,s)=>n+s.dur,0),60); assert.ok(new Set(p().shots.map(s=>s.dur)).size > 1); assert.ok(p().segments.every(seg=>seg.dur===p().shots.find(s=>s.segId===seg.id).dur)) })
  const id1 = p().shots[0].id
  state().updateSegment('s1', {dur:8}); await state().regenerateShot(id1)
  state().updateSegment('s1', { dur: 12 })
  check('v6 2/3：时长同步生效，无视频不标待更新或 stale', () => {
    assert.equal(p().shots[0].dur,12);assert.equal(p().segments[0].dur,12);assert.equal(p().shots[0].outdated.length,0);assert.ok(!p().shots[0].video.stale)
    state().updateSegment('s1', { dur: 8 }); assert.equal(p().shots[0].outdated.length, 0)
  })
  await state().generateVideos([id1]); state().updateSegment('s1', { dur: 12 }); await state().regenerateShot(id1)
  check('v5 16：12 秒镜头有序节拍、清除待更新、保留旧视频', () => {
    const s = p().shots[0]; assert.equal(s.dur, 12); assert.equal(s.timeline,seed.shots[0].timeline); assert.equal(s.outdated.length, 0); assert.equal(s.video.versions[0].dur, 8); assert.equal(s.video.staleReason, '镜头已重新生成')
  })
  check('v5 18：清理秒数/圈号/空行、默认节拍与幂等', () => {
    assert.equal(utils.buildBeats([' 0–5秒：甲', '5-10 秒: ② 乙', '⑩ 丙', '   ']), '① 甲\n② 乙\n③ 丙')
    assert.equal(utils.buildBeats([' ', '① ', '0—5 秒：']), '① 保持当前画面与动作')
    const beats = utils.buildBeats(['0–5秒：甲','5–10秒：乙','10–15秒：丙'])
    assert.equal(utils.buildBeats(beats.split('\n')), beats)
  })
  check('v5 18：超过 5 拍平均合并、内容顺序保留、再次调用不变', () => {
    const beats = utils.buildBeats(Array.from({length:10},(_,i)=>`${String.fromCodePoint(0x2460+i)} 内容${i+1}`))
    assert.equal(beats,'① 内容1；内容2\n② 内容3；内容4\n③ 内容5；内容6\n④ 内容7；内容8\n⑤ 内容9；内容10')
    assert.equal(utils.buildBeats(beats.split('\n')), beats)
  })
  check('4：整数与范围归一', () => { assert.equal(clampDuration(3), 4); assert.equal(clampDuration(40), 30); assert.equal(clampDuration(7.8), 8) })
  check('5：15+12 秒价格 4,253', () => assert.equal(videoCost(15) + videoCost(12), 4253))
  check('6：模型时长能力', () => { assert.equal(supportsDuration('Kling 2.1', 15), false); assert.equal(supportsDuration('Kling 2.1', 12), false); assert.equal(supportsDuration('Seedance 2.0', 12), true); assert.equal(supportsDuration('Seedance 1.5', 15), false) })
  await state().generateVideos([id1]); state().updateSegment('s1', { dur: 15 })
  check('7：多版本时长不可变、最新自动采用', () => { assert.deepEqual(p().shots[0].video.versions.map((v) => v.dur), [8,12]); assert.equal(utils.preferredVersion(p().shots[0].video).dur, 12); assert.deepEqual(p().shots[0].video.versions.map((v) => v.preferred), [false,true]) })
  check('8：仅剧本锁定，未到达仍禁入', () => { assert.deepEqual(stepLocked(p()), [true,false,false,false,false]); assert.deepEqual(stepUnlocked({...p(), assetStatus:'none', shotStatus:'none', shots:[]}), [true,true,false,false,false]) })
  reset()
  state().updateSegment('s2', { text: p().segments[1].text + '修改。' })
  check('10/11：正文传播、提示与保留不扣费', () => {
    assert.ok(!p().assetsHint); assert.equal(state().toast, '已保存，镜头 02 需要更新'); const balance = p().balance
    state().dismissOutdated('sh2'); assert.equal(p().balance, balance); assert.equal(p().shots[1].outdated.length, 0)
  })
  state().updateSegment('s2', { dur: 12 }); state().dismissOutdated('sh2')
  check('v6 10：保留描述不恢复时长', () => { assert.equal(p().segments[1].dur,12);assert.equal(p().shots[1].dur,12);assert.equal(state().toast,'已保留当前描述') })
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
  check('17：上游待更新仍可生成视频，使用当前时长', () => { assert.equal(state().step,5);assert.equal(utils.outdatedShots(p()).length,1);assert.deepEqual(p().shots.map(s=>s.video.versions[0].dur),[15,12,15]) })
  work = state().generateShots([2]); const bal = p().balance; await state().startAssets()
  check('18：生成互斥', () => { assert.equal(p().assetStatus,'done'); assert.equal(p().balance,bal); assert.equal(utils.shotGenerationBlocked(p()),'正在生成镜头，完成后可操作') }); await work
  check('19/20：参考图按模板 A/B 使用用户描述并追加固定要求', () => {
    p().assets.forEach(a=>{
      const prompt=templates.buildAssetImagePrompt(a)
      assert.ok(prompt.includes(a.prompt))
      if(a.kind==='char') {assert.ok(prompt.includes('角色三视图参考图，纯白背景，横向布局。'));assert.ok(prompt.endsWith('无其他人物，无文字，无水印，无背景场景。'))}
      else {assert.ok(prompt.startsWith('无人物空场景参考图。'));assert.ok(prompt.includes(`场景名：${a.name}。`));assert.ok(prompt.includes('同一部剧统一摄影体系：'))}
    })
  })
  const legacy = structuredClone(seed); delete legacy.config.durMode; legacy.config.segDur=8
  legacy.segments.forEach((s) => {s.dur = '15s'}); legacy.segments[1].dur = 'invalid'
  legacy.shots.forEach((s) => { delete s.segId; delete s.dur; s.video.versions = [{tag:'v1',preferred:true}] })
  check('21：原 LS_KEY 旧数据迁移', () => { const m=migrateProjects([legacy])[0]; assert.equal(m.config.durMode,'auto'); assert.ok(!('segDur' in m.config)); assert.deepEqual(m.segments.map((s)=>s.dur),[15,15,15]); assert.deepEqual(m.shots.map((s)=>s.segId),['s1','s2','s3']); assert.ok(m.shots.every((s)=>s.dur===15&&s.video.versions[0].dur===15)) })
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
  await mount('/src/components/DurationStepper.tsx',{value:15,title:'段落时长',variant:'inline',onChange:n=>{saved=n}})
  let input=container.querySelector('input')
  await change(input,'3'); await act(async()=>Simulate.blur(input))
  check('4 UI：越界收回并闪红',()=>{assert.equal(input.value,'4');assert.ok(container.querySelector('.text-red-400'))})
  saved=undefined
  await change(input,'12');await act(async()=>Simulate.keyDown(input,{key:'Escape'}))
  assert.equal(input.value,'15');assert.equal(saved,undefined)
  await change(input,'12');await act(async()=>Simulate.keyDown(input,{key:'Enter'}))
  check('DurationStepper Enter 保存、Esc 取消',()=>assert.equal(saved,12))
  await mount('/src/steps/VideoConfirmModal.tsx',{shots:[{...seed.shots[0],dur:15},{...seed.shots[1],dur:12,outdated:[{kind:'segText',text:'段落原文已修改'}]}],balance:10000,onClose(){},onConfirm(){}})
  assert.ok(container.textContent.includes('4,253'))
  await click(button('Seedance 2.5'))
  check('v3 12/17 UI：禁用不支持的选项但保留确认和待更新说明',()=>{assert.equal(button('Kling 2.1').disabled,true);assert.equal(button('Kling 2.1').title,'Kling 2.1 仅支持 5 秒或 10 秒');assert.equal(button('确认并生成 2 段视频').disabled,false);assert.ok(container.textContent.includes('仍会按旧描述生成。'));assert.equal(button('Seedance 2.0').disabled,false)})
  await click(button('Seedance 2.0'));assert.equal(button('确认并生成 2 段视频').disabled,false)
  await mount('/src/steps/Step2Segments.tsx',{project:seed})
  check('v7 10：已有资产时重新拆解禁用，仍可新增可编辑',()=>{assert.ok(button('新增剧本段落'));assert.equal(button('重新拆解').disabled,true);assert.equal(container.querySelectorAll('button[title="点击编辑标题"]').length,3)})
  await click(container.querySelector('button[title="点击编辑原文"]'));let textarea=container.querySelector('textarea');await change(textarea,'自动保存验收原文')
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  check('11 UI：正文 Escape 立即保存',()=>assert.equal(p().segments[0].text,'自动保存验收原文'))
  await mount('/src/steps/GenShotModal.tsx',{project:p(),onClose(){},onConfirm(){}})
  check('GenShotModal 默认只选待更新',()=>{assert.deepEqual([...container.querySelectorAll('input[aria-label^="选择段落"]')].map((i)=>i.checked),[true,false,false])})
  check('GenShotModal 段落列表：四列、选中可调未选只读、待更新胶囊紧跟标题',()=>{
    const rows=[...container.querySelectorAll('label')].filter(row=>row.querySelector('input[aria-label^="选择段落"]'))
    const header=[...container.querySelectorAll('.grid')].find(el=>el.textContent.includes('标题 / 剧本内容'))
    assert.ok(header);assert.equal(header.children.length,4);assert.ok(!header.textContent.includes('状态'))
    rows.forEach((row,i)=>{assert.equal(row.children.length,4);assert.equal(row.className.split(' ')[1],header.className.split(' ')[1]);if(i===0)assert.equal(row.querySelector('input[type="number"]').value,'15');else {assert.equal(row.lastElementChild.textContent,'15 秒');assert.ok(row.lastElementChild.classList.contains('text-white/40'))}})
    const badge=rows[0].querySelector('.text-amber-300')
    assert.ok(badge);assert.equal(badge.textContent,'待更新');assert.equal(badge.previousElementSibling.textContent,p().segments[0].title)
    assert.ok(badge.classList.contains('rounded-full'));assert.ok(badge.classList.contains('bg-amber-400/10'));assert.ok(badge.classList.contains('text-[11px]'));assert.ok(badge.classList.contains('shrink-0'))
    assert.ok(rows.slice(1).every(row=>!row.textContent.includes('待更新')))
    assert.ok(!rows.some(row=>row.textContent.includes('已生成')))
  })
  await mount('/src/steps/Step3Assets.tsx',{project:seed})
  check('v7 11：第 3 步无重新提取入口',()=>{assert.ok(!button('重新提取'));assert.ok(!button('无需提取'))})
  await click(container.querySelector('button[aria-label="更多操作"]'));await click(button('AI 重新生成图片'))
  check('19 UI：角色生成恢复自由描述和 1:1 比例',()=>{assert.ok(!container.textContent.includes('出图版式'));assert.ok(!button('展开'));assert.ok(button('1:1'));assert.ok(container.querySelector('textarea').placeholder.includes('画面风格'))})
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[2]);await click(button('AI 重新生成图片'))
  check('20 UI：场景生成恢复自由描述和 1:1 比例',()=>{assert.ok(button('1:1'));assert.ok(!container.textContent.includes('出图版式'));assert.ok(container.querySelector('textarea').placeholder.includes('画面风格'))})
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})))
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('编辑角色设定'))
  const name=container.querySelector('input[aria-label="角色名称"]')
  await change(name,'外卖员')
  check('13 UI：重名禁止保存',()=>{assert.ok(container.textContent.includes('已存在同名角色'));assert.equal(button('保存').disabled,true)})
  await change(name,'苏苏');await click(button('保存'))
  check('13 UI：同步替换预览包含来源与红删绿增',()=>{assert.ok(document.body.textContent.includes('同步替换段落和镜头文本？'));assert.ok(document.body.querySelector('.line-through'));assert.ok(document.body.textContent.includes('段落 01 · 原文'));assert.ok(document.body.textContent.includes('镜头 01 · 画面描述'))})
  await click([...document.querySelectorAll('button')].find((b)=>b.textContent==='同步替换并保存'))
  check('13 UI：同步保存关闭弹窗、不标待更新',()=>{assert.equal(p().assets[1].name,'苏苏');assert.equal(utils.renameOccurrences(p(),'苏可').length,0);assert.equal(utils.outdatedShots(p()).length,1)}) // prior body edit remains; rename adds nothing
  const missingProject=structuredClone(seed);missingProject.segments.push({id:'s4',no:4,title:'新段落',dur:8,text:'苏可走出房门。'})
  await mount('/src/steps/Step4Shots.tsx',{project:missingProject})
  check('15 UI：新段落提示',()=>assert.ok(container.textContent.includes('段落 04 尚未生成镜头')))
  await click(button('去生成'))
  check('15 UI：去生成只选新段落',()=>assert.deepEqual([...container.querySelectorAll('input[aria-label^="选择段落"]')].map((i)=>i.checked),[false,false,false,true]))
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
  check('v7 11：镜头生成时也无重新提取入口',()=>assert.ok(!button('重新提取')))
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
  // v2: reactive mounted pages exercise the full control -> store -> UI path.
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
  await resetLive()
  await mountLive('/src/steps/Step2Segments.tsx',{},true)
  check('v5：第 2 步卡片调节器和页头合计',()=>{assert.ok(container.textContent.includes('共 3 个剧本段落 · 预计成片时长约 45 秒'));assert.equal(container.querySelectorAll('input[type="number"]').length,3)})
  await click(button('新增剧本段落'))
  check('v7 6：新增段落默认 15 秒',()=>{assert.equal(container.querySelectorAll('input[type="number"]').length,4);assert.equal(container.querySelector('input[aria-label="新增段落时长"]').value,'15')})
  await change(container.querySelector('input[placeholder]'),'默认时长段落');await change(container.querySelector('textarea'),'新增原文');await click(button('添加'))
  check('v7：新增沿用用户时长且不亮圆点',()=>{assert.equal(p().segments[3].dur,15);assert.equal(dots().length,0)})
  await click(container.querySelector('button[title="点击编辑原文"]'))
  await change(container.querySelector('textarea'),'只修正错别字')
  await tick(850)
  await toggleCheckbox(container.querySelector('label input'),true)
  await click(button('收起'))
  check('v2 8：先编辑再勾选，整次保存不传播',()=>{assert.equal(p().segments[0].text,'只修正错别字');assert.equal(state().toast,'已保存');assert.ok(!p().assetsHint);assert.equal(utils.outdatedShots(p()).length,0);assert.equal(dots().length,0)})
  await click(container.querySelector('button[title="点击编辑原文"]'))
  assert.equal(container.querySelector('label input').checked,false)
  await change(container.querySelector('textarea'),'发生新剧情');await click(button('收起'))
  check('v2 9：再次打开默认不勾选，普通编辑仍传播',()=>{assert.ok(!p().assetsHint);assert.equal(utils.outdatedShots(p()).length,1);assert.equal(dots().length,1)})
  await mountLive('/src/steps/Step4Shots.tsx',{},true)
  check('v2 3/7/9：独立时长列与批量提示',()=>{
    assert.equal(container.querySelector('#shot-sh1').style.gridTemplateColumns.split(' ').slice(0,3).join(' '),'44px 150px 132px')
    assert.ok(container.textContent.includes('字段7/10'));assert.ok(button('全部保留当前描述'));assert.ok(!container.textContent.includes('更新 1 个待更新镜头'))
    assert.ok(!container.textContent.includes('描述按'));assert.ok(!container.textContent.includes('不生成'))
    assert.ok(button('待更新').title.endsWith('点击处理'))
    assert.ok(button('全部保留当前描述').compareDocumentPosition(button('去生成')) & window.Node.DOCUMENT_POSITION_FOLLOWING)
  })
  await click(button('✦50 全部重新生成'))
  check('v2 9：批量重新生成只选待更新段落',()=>assert.deepEqual([...container.querySelectorAll('input[aria-label^="选择段落"]')].map(i=>i.checked),[true,false,false,false]))
  await click(button('取消'));await click(button('全部保留当前描述'))
  check('v2 10：无时长修改直接全部保留',()=>{assert.equal(utils.outdatedShots(p()).length,0);assert.equal(state().toast,'已保留 1 个镜头的当前描述');assert.ok(!button('全部保留当前描述'));assert.equal(dots().length,0)})
  await mountLive('/src/steps/Step3Assets.tsx',{},true)
  check('v7 11：无资产提示条和步骤圆点',()=>{assert.ok(!p().assetsHint);assert.equal(dots().length,0);assert.ok(!button('无需提取'));assert.ok(!container.textContent.includes('段落内容有修改'))})
  await resetLive()
  await mountLive('/src/steps/GenShotModal.tsx',{onClose(){},onConfirm(){}})
  const rowChecks = () => [...container.querySelectorAll('input[aria-label^="选择段落"]')].map(i=>i.checked)
  const beforeChecks=rowChecks()
  check('v4：生成弹窗选中行可调时长与整行 label',()=>{assert.equal(container.querySelectorAll('input[type="number"]').length,3);assert.ok(container.textContent.includes('生成镜头设计'));assert.ok(!container.textContent.includes('共 45 秒'));assert.equal(container.querySelectorAll('label input[type="checkbox"]').length,3);assert.deepEqual(rowChecks(),beforeChecks)})
  await resetLive()
  await mountLive('/src/steps/Step4Shots.tsx',{},true)
  const decrement=()=>container.querySelector('#shot-sh1 button[aria-label="减少时长"]')
  await click(decrement());await click(decrement());await click(decrement())
  check('v2 4：连点先更新数字、800ms 前不提交',()=>{assert.equal(container.querySelector('#shot-sh1 input[type="number"]').value,'12');assert.equal(p().segments[0].dur,15);assert.ok(container.textContent.includes('预计成片时长约 42 秒'));assert.ok(!button('稍后'))})
  await tick(850)
  check('v6 1/2：停下后同步提交，无待更新、圆点、小卡片或 toast',()=>{assert.equal(p().segments[0].dur,12);assert.equal(p().shots[0].dur,12);assert.equal(utils.outdatedShots(p()).length,0);assert.equal(dots().length,0);assert.ok(!button('稍后'));assert.equal(state().toast,null)})
  check('v6 1：时长调节器无未生效 tooltip 和琥珀色',()=>{assert.ok(!container.querySelector('[title*="重新生成镜头后生效"]'));assert.ok(!container.querySelector('#shot-sh1 .text-amber-200'))})
  input=container.querySelector('#shot-sh1 input[type="number"]');await change(input,'15');await act(async()=>Simulate.keyDown(input,{key:'Enter'}))
  check('v2 6：改回原时长不弹卡片并清除状态',()=>{assert.equal(p().segments[0].dur,15);assert.equal(utils.outdatedShots(p()).length,0);assert.equal(dots().length,0);assert.ok(!button('稍后'));assert.ok(!container.querySelector('#shot-sh1 .text-amber-200'))})
  await click(decrement());await act(async()=>Simulate.keyDown(input,{key:'Escape'}));await tick(850)
  check('v2 4：Esc 取消待提交步进修改',()=>{assert.equal(input.value,'15');assert.equal(p().segments[0].dur,15);assert.ok(!button('稍后'))})
  await change(input,'12');await act(async()=>Simulate.blur(input));await act(async()=>state().regenerateShot('sh1'))
  check('v5 17：立即生成保留节拍并清除琥珀状态',()=>{assert.equal(p().shots[0].dur,12);assert.equal(p().shots[0].timeline,seed.shots[0].timeline);assert.equal(dots().length,0);assert.ok(!container.querySelector('#shot-sh1 .text-amber-200'))})
  await change(input,'10');await act(async()=>Simulate.blur(input))
  await act(async()=>{state().updateSegment('s1',{text:'上游变更'})})
  check('v6 10：上游待更新仍可全部保留',()=>assert.ok(button('全部保留当前描述')))
  await click(button('全部保留当前描述'))
  check('v6 10：全部保留直接执行，不弹二次确认也不恢复时长',()=>{assert.equal(p().segments[0].dur,10);assert.equal(p().shots[0].dur,10);assert.equal(utils.outdatedShots(p()).length,0);assert.equal(dots().length,0);assert.ok(!button('确定'));assert.equal(state().toast,'已保留 1 个镜头的当前描述')})
  await act(async()=>{state().updateSegment('s1',{dur:9,text:'再次变更'});state().updateSegment('s3',{dur:8,text:'第三段变更'})})
  check('v6 10：多个上游原因显示批量保留入口',()=>assert.ok(button('全部保留当前描述')))
  await click(button('全部保留当前描述'))
  check('v6 10：批量保留不恢复时长且不扣费',()=>{assert.equal(p().segments[0].dur,9);assert.equal(p().segments[2].dur,8);assert.equal(utils.outdatedShots(p()).length,0);assert.equal(state().toast,'已保留 2 个镜头的当前描述');assert.equal(p().balance,seed.balance-50)})
  await resetLive()
  await mountLive('/src/steps/Step3Assets.tsx',{},true)
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('编辑角色设定'))
  assert.equal(container.querySelector('label input'),null)
  await change(container.querySelector('textarea'),'角色描述纠错')
  assert.ok(container.textContent.includes('这次修改不影响已生成的 3 个镜头'))
  await toggleCheckbox(container.querySelector('label input'),true);await click(button('保存'))
  check('v2 12：资产设定静默保存',()=>{assert.equal(p().assets[1].desc,'角色描述纠错');assert.equal(utils.outdatedShots(p()).length,0);assert.equal(state().toast,'设定已保存');assert.equal(dots().length,0)})
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('编辑角色设定'))
  await change(container.querySelector('textarea'),'角色设定再次变化');assert.equal(container.querySelector('label input').checked,false);await click(button('保存'))
  check('v2 12：资产静默选择不跨编辑保留',()=>{assert.equal(utils.outdatedShots(p()).length,3);assert.equal(dots().length,1)})
  await resetLive()
  await state().generateVideos(['sh1'])
  state().updateSegment('s1',{dur:12,text:'上游变化'});state().updateSegment('s1',{text:'修正错别字'},{silent:true})
  state().updateAsset('a2',{desc:'无画面影响',imageUrl:'test-image'},{silent:true})
  check('v2 silent：保留已有待更新、参考图视频 stale 规则不变',()=>{assert.equal(p().shots[0].outdated.length,1);assert.equal(p().shots[0].outdated[0].kind,'segText');assert.ok(!p().assetsHint);assert.equal(p().shots[0].video.stale,true);assert.equal(p().shots[0].video.staleReason,'角色「苏可」参考图已更新')})
  const migrated=structuredClone(seed);migrated.segments[0].dur=12;migrated.shots[0].outdated=[{kind:'segDur',text:'时长已改为 12 秒，当前描述按 15 秒编写'}];migrated.shots[0].video={state:'done',versions:[{tag:'v1',dur:15,preferred:true,createdAt:1}]}
  check('v6 12：存量时长原因移除、同步时长并标记视频 stale',()=>{const s=migrateProjects([migrated])[0].shots[0];assert.equal(s.dur,12);assert.deepEqual(s.outdated,[]);assert.equal(s.video.stale,true);assert.equal(s.video.staleReason,'时长改为 12 秒')})
  await mountLive('/src/steps/Step4Shots.tsx',{},true)

  let generating
  act(()=>{generating=state().generateShots([1])})
  check('v2 14：开始重新生成后立即隐藏镜头决策圆点',()=>{assert.equal(p().shotStatus,'generating');assert.equal(dots().length,0);assert.ok([...container.querySelectorAll('input[type="number"]')].every(i=>i.disabled));assert.ok(container.querySelector('[title="正在生成镜头，完成后可调整"]'))})
  await act(async()=>generating)
  await act(async()=>state().updateSegment('s1',{text:'再次修改原文'}))
  await mountLive('/src/steps/Step3Assets.tsx',{},true)
  check('v7 11：改原文后不出现资产决策圆点',()=>assert.ok(!container.querySelector('button[title="段落有修改，可重新提取"]')))
  await resetLive()
  await mount('/src/components/DurationStepper.tsx',{value:4,variant:'inline',onChange(){}})
  check('v2 4：下限按钮禁用',()=>assert.equal(container.querySelector('button[aria-label="减少时长"]').disabled,true))
  await mount('/src/components/DurationStepper.tsx',{value:30,variant:'inline',onChange(){}})
  check('v2 4：上限按钮禁用',()=>assert.equal(container.querySelector('button[aria-label="增加时长"]').disabled,true))
  const missingAssets=structuredClone(seed)
  missingAssets.assets.forEach(a=>{a.imgState='none';delete a.imageUrl})
  await mount('/src/steps/Step3Assets.tsx',{project:missingAssets})
  await click(buttons().find(b=>b.textContent.includes('生成全部参考图')))
  check('参考图回退：一键补全无固定版式、描述可编辑、统一比例仍可选',()=>{assert.ok(container.textContent.includes('一键补全参考图'));assert.ok(!container.textContent.includes('出图版式'));assert.ok(!container.textContent.includes('固定'));assert.ok(!button('展开'));assert.equal(container.querySelectorAll('textarea').length,3);assert.ok(button('1:1'));assert.ok([...container.querySelectorAll('textarea')].every(t=>t.placeholder.includes('画面风格')))})
  await change(container.querySelector('textarea'),'自由填写的画面风格与构图')
  check('参考图回退：自由描述不受模板约束',()=>assert.equal(container.querySelector('textarea').value,'自由填写的画面风格与构图'))
  await click(container.querySelector('button[aria-label="关闭"]'))
  await click(container.querySelector('button[aria-label="更多操作"]'));await click(button('编辑角色设定'))
  check('参考图回退：设定编辑无固定版式说明',()=>{assert.ok(!container.textContent.includes('出图版式'));assert.ok(container.textContent.includes('参考图描述'));assert.ok(container.querySelectorAll('textarea')[1].placeholder.includes('画面风格'))})
  // v3: 第 9 节验收，沿用真实组件事件和独立 store。
  await resetLive()
  await act(async()=>{ state().createProject('成片时长验收'); state().setScript('测试剧本') })
  await mountLive('/src/steps/Step1Script.tsx',{locked:false})
  await click(buttons().find(b=>b.textContent.includes('拆解剧本')))
  let target=container.querySelector('input[aria-label="目标成片时长"]')
  check('v3 1：成片时长默认自动、指定默认 60 且禁用',()=>{assert.ok(!container.textContent.includes('单段时长'));assert.ok(container.textContent.includes('成片时长'));assert.equal(container.querySelector('input[type="radio"]').checked,true);assert.equal(target.disabled,true);assert.equal(target.value,'60');assert.ok(container.textContent.includes('本步把剧本拆成段落，并按原文长短给每段预分配时长，之后可随时调整。'))})
  await toggleCheckbox(container.querySelectorAll('input[type="radio"]')[1],true)
  check('v3 1：指定自动聚焦并启用输入',()=>{assert.equal(target.disabled,false);assert.equal(document.activeElement,target);assert.equal(target.value,'60')})
  for(const [raw,expected] of [['2','4'],['700','600'],['8.6','9']]) {
    await change(target,raw);await act(async()=>Simulate.blur(target))
    check(`v3 1：指定 ${raw} 收回 ${expected} 并闪红`,()=>{assert.equal(target.value,expected);assert.ok(target.classList.contains('text-red-400'))})
  }
  await change(target,'60');await click(buttons().find(b=>b.textContent.includes('确认并')));await tick(20)
  check('v3 1/2：确认写入模式与时长并推进',()=>{assert.equal(p().config.durMode,'manual');assert.equal(p().config.targetDur,60);assert.equal(state().step,2);assert.deepEqual(p().segments.map(s=>s.dur),[27,16,17])})
  await mountLive('/src/steps/Step1Script.tsx',{locked:true})
  check('v3 1：锁定后无时长修改入口',()=>{assert.equal(container.querySelector('input[type="number"]'),null);assert.ok(!buttons().some(b=>b.textContent.includes('拆解剧本')))})
  await mountLive('/src/steps/Step2Segments.tsx')
  check('v5 1：指定模式页头和三张卡片时长',()=>{assert.ok(container.textContent.includes('共 3 个剧本段落 · 目标 60 秒 · 当前合计 60 秒'));assert.deepEqual([...container.querySelectorAll('input[type="number"]')].map(i=>Number(i.value)),[27,16,17])})
  await mountLive('/src/steps/GenShotModal.tsx',{onClose(){},onConfirm(){}})
  check('v4 1：未生成预分配时长、合计与生成后修改提示',()=>{assert.ok(container.textContent.includes('生成镜头设计'));assert.ok(container.textContent.includes('选择要生成镜头的段落（3）'));assert.ok(container.textContent.includes('成片时长：目标 60 秒 · 当前合计 60 秒'));assert.ok(container.textContent.includes('生成后也可以随时修改。'));assert.ok(!container.textContent.includes('生成时确定'));assert.equal(container.querySelectorAll('input[type="number"]').length,3);assert.ok(container.textContent.includes('已选 3/3 段'))})
  check('GenShotModal 未生成段落：可调时长，无旧状态文案',()=>{
    const rows=[...container.querySelectorAll('label')].filter(row=>row.querySelector('input[aria-label^="选择段落"]'))
    rows.forEach(row=>{const input=row.lastElementChild.querySelector('input[type="number"]');assert.ok(input);assert.equal(input.min,'4');assert.equal(input.max,'30');assert.equal(row.children.length,4);assert.ok(!row.textContent.includes('未生成'));assert.ok(!row.textContent.includes('待分配'));assert.ok(!row.textContent.includes('待更新'))})
  })
  // 手调为 8、24、28 秒，验证生成沿用段落值，8 -> 12 后正好 64 秒。
  await act(async()=>{state().updateSegment('s1',{text:'甲'.repeat(20),dur:8});state().updateSegment('s2',{text:'乙'.repeat(60),dur:24});state().updateSegment('s3',{text:'丙'.repeat(70),dur:28});await state().startShots([1,2,3])})
  await mountLive('/src/steps/Step4Shots.tsx',{},true)
  check('v5：生成沿用手调 8/24/28，页头合计 60',()=>{assert.deepEqual(p().shots.map(s=>s.dur),[8,24,28]);assert.ok(container.textContent.includes('目标 60 秒 · 当前合计 60 秒'))})
  target=container.querySelector('input[aria-label="镜头 01 时长"]');await change(target,'12');check('v3 5：页头随输入即时预览，提交仍按原交互',()=>{assert.ok(container.textContent.includes('当前合计 64 秒'));assert.equal(p().segments[0].dur,8)});await act(async()=>Simulate.blur(target))
  check('v3 5：手调后合计 64，无重新分配入口',()=>{assert.ok(container.textContent.includes('目标 60 秒 · 当前合计 64 秒'));assert.ok(!container.textContent.includes('重新分配'));const header=[...container.querySelectorAll('p')].find(e=>e.textContent.includes('当前合计'));assert.ok(header);assert.ok(!header.className.includes('amber')&&!header.className.includes('red'))})
  await act(async()=>state().addSegment('新增段落','丁'.repeat(30),4))
  const beforeDur=p().segments.slice(0,3).map(s=>s.dur)
  await mountLive('/src/steps/GenShotModal.tsx',{initialSelection:[4],onClose(){},onConfirm(){}})
  check('v7：新增镜头沿用指定时长并计入合计',()=>{assert.equal(container.querySelector('input[type="number"]').value,'4');assert.ok(container.textContent.includes('当前合计 68 秒'));assert.deepEqual(rowChecks(),[false,false,false,true])})
  await act(async()=>state().generateShots([4]))
  check('v7：新增使用指定的 4 秒，不重新分配其他段落',()=>{assert.deepEqual(p().segments.slice(0,3).map(s=>s.dur),beforeDur);assert.equal(p().segments[3].dur,4)})
  // v6 14–18: real inline/drawer editing, upstream reasons, and legacy cleanup.
  await resetLive()
  await mountLive('/src/steps/Step4Shots.tsx',{},true)
  const editShotCell = async(index,value) => {
    await click(container.querySelectorAll('#shot-sh2 .cursor-text')[index])
    const editor=container.querySelector('textarea');await change(editor,value);await tick(750)
    await act(async()=>Simulate.keyDown(editor,{key:'Escape'}))
  }
  const assertNoShotDecision = () => {assert.equal(utils.outdatedShots(p()).length,0);assert.ok(!button('待更新'));assert.ok(!button('全部保留当前描述'));assert.equal(dots().length,0)}
  await editShotCell(0,'雨夜中的苏可')
  check('v6 14：无视频就地改画面描述，无待更新、提示条或圆点',()=>{assert.equal(p().shots[1].shot,'雨夜中的苏可');assertNoShotDecision();assert.ok(!p().shots[1].video.stale);assert.equal(p().shots[1].video.versions.length,0);assert.ok(container.querySelector('#shot-sh2').textContent.includes('尚未生成视频'))})
  await act(async()=>state().generateVideos(['sh2']))
  const unchangedShot=structuredClone(p().shots[1])
  const unchangedToast=state().toast
  await click(container.querySelector('#shot-sh2 .cursor-text'))
  textarea=container.querySelector('textarea');await act(async()=>Simulate.blur(textarea));await tick(750)
  await act(async()=>Simulate.keyDown(textarea,{key:'Escape'}))
  await act(async()=>state().updateShot('sh2',{shot:unchangedShot.shot}))
  check('v6 16：字段失焦、同值提交均不改镜头、视频或 toast',()=>{assert.equal(JSON.stringify(p().shots[1]),JSON.stringify(unchangedShot));assert.equal(state().toast,unchangedToast);assertNoShotDecision()})
  await editShotCell(2,'冒雨前行')
  check('v6 15 / v3 7：有视频就地改主要动作只标视频 stale',()=>{assert.equal(p().shots[1].action,'冒雨前行');assertNoShotDecision();assert.equal(p().shots[1].video.stale,true);assert.equal(p().shots[1].video.staleReason,'镜头描述已修改');assert.ok(container.querySelector('#shot-sh2').textContent.includes('需重新生成'))})
  await act(async()=>state().generateVideos(['sh2']))
  await click(container.querySelector('#shot-sh2 button[title="更多"]'));await click(button('编辑镜头详情'))
  const drawer=container.querySelector('.animate-slideInRight')
  const drawerField=[...drawer.querySelectorAll('textarea')].find(el=>el.parentElement.firstElementChild.textContent==='主要动作')
  await change(drawerField,'在雨中快步前行');await tick(750);await click(container.querySelector('button[aria-label="关闭"]'))
  check('v6 15：详情抽屉编辑同样只标已有视频 stale',()=>{assert.equal(p().shots[1].action,'在雨中快步前行');assertNoShotDecision();assert.equal(p().shots[1].video.stale,true);assert.equal(p().shots[1].video.staleReason,'镜头描述已修改');assert.ok(container.querySelector('#shot-sh2').textContent.includes('需重新生成'))})
  await act(async()=>{state().updateSegment('s2',{text:'变化的上游原文'})})
  await editShotCell(0,'雨夜中的苏可手改')
  check('v6 17：手改保留段落原文原因，既不新增也不清除',()=>{assert.deepEqual(p().shots[1].outdated,[{kind:'segText',text:'段落原文已修改'}]);assert.ok(button('待更新'));assert.ok(button('全部保留当前描述'));assert.equal(dots().length,1)})
  const versionsBeforeRegenerate=structuredClone(p().shots[1].video.versions)
  await click(button('待更新'));await click(button('✦50 重新生成'));await tick(20)
  check('v6 17 / v3 8：重新生成使用手改内容、清除待更新、保留视频版本',()=>{assert.equal(p().shots[1].shot,'雨夜中的苏可手改');assert.equal(p().shots[1].action,'在雨中快步前行');assertNoShotDecision();assert.deepEqual(p().shots[1].video.versions,versionsBeforeRegenerate);assert.equal(p().shots[1].video.staleReason,'镜头已重新生成')})
  await act(async()=>{state().updateShot('sh2',{shot:'雨夜中的苏可二'});state().updateShot('sh2',{shot:'雨夜中的苏可三'});state().updateShot('sh2',{action:'冒雨前行'})})
  check('v6 / v3 7：多次改同字段、不同字段均不产生待更新原因',()=>{assertNoShotDecision();assert.equal(p().shots[1].video.staleReason,'镜头描述已修改')})
  await act(async()=>state().updateSegment('s2',{text:'再次修改原文'}))
  await click(button('待更新'));await click(button('保留当前描述'))
  check('v3 9：保留当前描述清除上游原因并保留修改',()=>{assert.equal(p().shots[1].outdated.length,0);assert.equal(p().shots[1].shot,'雨夜中的苏可三');assert.equal(p().shots[1].action,'冒雨前行');assert.equal(dots().length,0)})
  await act(async()=>{state().updateAsset('a2',{desc:'角色设定变更'});state().updateAsset('s_scene1',{desc:'场景设定变更'})})
  const upstreamReasons=structuredClone(p().shots[1].outdated)
  await editShotCell(0,'保留上游原因的手改')
  check('v6：直接编辑保留角色与场景原因及其 key',()=>{assert.deepEqual(upstreamReasons.map(r=>r.key),['a2','s_scene1']);assert.deepEqual(p().shots[1].outdated,upstreamReasons)})
  check('v6 18：存量 shotEdit 清理、保留 segText/asset，迁移幂等',()=>{
    const old=structuredClone(seed)
    const edit={kind:'shotEdit',key:'shot',text:'画面描述已修改'}
    const text={kind:'segText',text:'段落原文已修改'}
    const asset={kind:'asset',key:'a2',text:'角色「苏可」设定已修改'}
    old.shots[0].outdated=[edit];old.shots[1].outdated=[edit,text];old.shots[2].outdated=[edit,text,asset]
    old.shots[0].video={state:'done',stale:true,staleReason:'镜头描述已修改',versions:[{tag:'v1',dur:15,preferred:true,createdAt:1}]}
    const video=structuredClone(old.shots[0].video)
    const migrated=migrateProjects([old])[0]
    assert.deepEqual(migrated.shots.map(s=>s.outdated),[[],[text],[text,asset]])
    assert.deepEqual(migrated.shots[0].video,video)
    assert.deepEqual(migrateProjects([structuredClone(migrated)])[0],migrated)
  })
  const fields=(await server.ssrLoadModule('/src/types.ts')).SHOT_FIELDS
  const allEdits=Object.fromEntries(fields.map(({key})=>[key,key==='timeline'?'0–5秒：雨夜甲\n5–15秒：雨夜乙':`手改${key}雨夜`]))
  await act(async()=>{state().updateShot('sh2',allEdits);state().updateSegment('s2',{text:'变化的原文',dur:4});await state().generateShots([2])})
  check('v5 17：4 秒重新生成保留所有文本与每一拍',()=>{const s=p().shots[1];fields.filter(f=>f.key!=='timeline').forEach(({key})=>assert.equal(s[key],allEdits[key]));assert.equal(s.timeline,'① 雨夜甲\n② 雨夜乙');assert.equal(s.dur,4);assert.equal(s.outdated.length,0)})
  await act(async()=>{state().updateSegment('s2',{dur:20});await state().regenerateShot('sh2')})
  await mount('/src/steps/VideoConfirmModal.tsx',{shots:[p().shots[1]],balance:10000,onClose(){},onConfirm(){}})
  check('v3 11：20 秒镜头默认 2.5 可确认',()=>{assert.ok(button('Seedance 2.5'));assert.equal(button('确认并生成 1 段视频').disabled,false)})
  await click(button('Seedance 2.5'))
  check('v3 11：2.0 和 Kling 禁用及 tooltip',()=>{assert.equal(button('Seedance 2.0').disabled,true);assert.equal(button('Seedance 2.0').title,'镜头 02（20 秒）超出 Seedance 2.0 的 15 秒上限');assert.equal(button('Kling 2.1').disabled,true);assert.equal(button('Kling 2.1').title,'Kling 2.1 仅支持 5 秒或 10 秒')})
  await click(button('Seedance 2.0'));assert.equal(button('确认并生成 1 段视频').disabled,false)
  await mount('/src/steps/VideoConfirmModal.tsx',{shots:[1,2,3].map(no=>({...seed.shots[0],no,dur:20})),balance:20000,onClose(){},onConfirm(){}})
  await click(button('Seedance 2.5'))
  check('v3 11：多镜头禁用原因汇总',()=>assert.equal(button('Seedance 2.0').title,'镜头 01、02 等 3 个镜头超出 Seedance 2.0 的 15 秒上限'))
  await mountLive('/src/steps/Step4Shots.tsx')
  await click(container.querySelector('#shot-sh1 button[title="更多"]'))
  check('v3 13：菜单称镜头',()=>assert.ok(button('重新生成该镜头')))
  const {readdir,readFile}=await import('node:fs/promises')
  const scan=async(dir)=>{for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='proposal')continue;const path=`${dir}/${entry.name}`;if(entry.isDirectory())await scan(path);else if(/\.tsx?$/.test(entry.name)){const code=await readFile(path,'utf8');assert.ok(!code.split('\n').map(line=>line.split('//')[0]).join('\n').includes('分镜'),path);assert.ok(!code.includes('时间安排'),path)}}}
  await scan('src');check('v5 15：工作流界面无分镜与时间安排文案（排除方案页）',()=>{})
  await resetLive()
  await act(async()=>{state().createProject('自动时长验收');state().setScript('自动剧本');await state().startSegments()})
  await mountLive('/src/steps/Step2Segments.tsx')
  check('v3 2：自动模式页头',()=>assert.ok(container.textContent.includes('共 3 个剧本段落 · 预计成片时长约 39 秒')))
  await mountLive('/src/steps/GenShotModal.tsx',{onClose(){},onConfirm(){}})
  check('v3 3：自动模式生成弹窗',()=>assert.ok(container.textContent.includes('成片时长：自动，按内容确定')))
  await act(async()=>state().startShots([1,2,3]))
  check('v3 自动分配：按字数除以 6，夹取 4–15 秒',()=>p().segments.forEach(seg=>assert.equal(seg.dur,Math.min(15,Math.max(4,Math.round(seg.text.length/6))))))
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v3 自动模式镜头页头',()=>assert.ok(container.textContent.includes(`已生成 3 个镜头 · 预计成片时长约 ${p().shots.reduce((n,s)=>n+s.dur,0)} 秒`)))

  // v4/v5: modal drafts and stable selection, then real Step3/Step4 confirmation paths.
  const nativeClick = async(el) => { assert.ok(el,'native click target exists'); await act(async()=>el.click()) }
  const durationRows = () => [...container.querySelectorAll('label')].filter(row=>row.querySelector('input[aria-label^="选择段落"]'))
  const durationValues = () => durationRows().map(row=>{const input=row.querySelector('input[type="number"]');return input ? Number(input.value) : null})
  const modalTotal = () => [...container.querySelectorAll('div')].find(el=>el.textContent.startsWith('成片时长：') && el.children.length===0)
  await resetLive()
  await act(async()=>{
    state().createProject('v4 指定时长');state().setScript('逐段时长验收');await state().startSegments('manual',60);await state().startAssets();await state().generateAssetImages(p().assets.map(a=>a.id))
    state().updateSegment('s1',{text:'甲'.repeat(20),dur:8});state().updateSegment('s2',{text:'乙'.repeat(60),dur:24});state().updateSegment('s3',{text:'丙'.repeat(70),dur:28})
  })
  await mountLive('/src/steps/Step3Assets.tsx')
  const openShots = async() => click(buttons().find(b=>b.textContent.includes('生成镜头设计')))
  await openShots()
  check('v5：按段落当前值预填 8/24/28，三行均为 sm inline 调节器',()=>{
    assert.deepEqual(durationValues(),[8,24,28]);assert.equal(modalTotal().textContent,'成片时长：目标 60 秒 · 当前合计 60 秒')
    assert.ok(container.textContent.includes('可在下方逐段调整（4–30 秒），生成后也可以随时修改。'))
    assert.ok(!container.textContent.includes('生成时确定'));assert.ok(durationRows().every(row=>row.className.includes('_128px]') && row.querySelector('.h-7')))
  })
  await nativeClick(durationRows()[0].querySelector('[aria-label="增加时长"]'))
  await nativeClick(durationRows()[0].querySelector('[aria-label="增加时长"]'))
  check('v4 2：立即加 2 秒只更新本行与合计，偏离不警示、不写入项目',()=>{
    assert.deepEqual(durationValues(),[10,24,28]);assert.equal(modalTotal().textContent,'成片时长：目标 60 秒 · 当前合计 62 秒')
    assert.ok(!/amber|red/.test(modalTotal().className));assert.deepEqual(p().segments.map(seg=>seg.dur),[8,24,28])
  })
  const firstCell=()=>durationRows()[0].lastElementChild
  for(const el of [firstCell().querySelector('[aria-label="减少时长"]'),firstCell().querySelector('[aria-label="增加时长"]'),firstCell().querySelector('input'),firstCell().querySelector('span'),firstCell()]) {
    await nativeClick(el);assert.deepEqual(rowChecks(),[true,true,true])
  }
  check('v4 3：原生点击加减、输入、秒字和单元格空白均不切换勾选',()=>assert.deepEqual(durationValues(),[10,24,28]))
  await nativeClick(durationRows()[2].querySelector('span.truncate'))
  check('v5 6：点标题取消 03，显示灰色 28 秒，其余值和合计不变',()=>{
    assert.deepEqual(rowChecks(),[true,true,false]);assert.deepEqual(durationValues(),[10,24,null]);assert.equal(durationRows()[2].lastElementChild.textContent,'28 秒');assert.ok(durationRows()[2].lastElementChild.classList.contains('text-white/40'));assert.ok(modalTotal().textContent.endsWith('当前合计 62 秒'))
  })
  await nativeClick(durationRows()[2].lastElementChild)
  assert.deepEqual(rowChecks(),[true,true,false])
  await nativeClick(durationRows()[2].querySelector('span.truncate'))
  check('v5 6：重选 03 所有行保持原值',()=>assert.deepEqual(durationValues(),[10,24,28]))
  await nativeClick(durationRows()[0].querySelector('span.truncate'));await nativeClick(durationRows()[0].querySelector('span.truncate'))
  check('v4：手改行取消再勾选仍保持手改值',()=>assert.deepEqual(durationValues(),[10,24,28]))
  await click(button('取消'));assert.equal(container.querySelector('input[aria-label="段落 01 时长"]'),null)
  await openShots()
  check('v5 7：取消后重新打开恢复段落存储值',()=>{assert.deepEqual(durationValues(),[8,24,28]);assert.deepEqual(p().segments.map(seg=>seg.dur),[8,24,28])})
  const allCheckbox=container.querySelector('input[type="checkbox"]')
  await nativeClick(allCheckbox)
  check('v5：全不选合计仍为所有段落之和、隐藏提示、禁用生成',()=>{assert.deepEqual(rowChecks(),[false,false,false]);assert.ok(modalTotal().textContent.endsWith('当前合计 60 秒'));assert.ok(!container.textContent.includes('生成后也可以随时修改。'));assert.equal(button('生成全部（0）').disabled,true)})
  await nativeClick(allCheckbox)
  assert.deepEqual(durationValues(),[8,24,28])
  target=container.querySelector('input[aria-label="段落 01 时长"]')
  await change(target,'3');await act(async()=>Simulate.blur(target))
  check('v4：弹窗低于 4 秒收回并闪红',()=>{assert.equal(target.value,'4');assert.ok(target.classList.contains('text-red-400'));assert.deepEqual(durationValues(),[4,24,28])})
  await change(target,'31');await act(async()=>Simulate.blur(target))
  check('v4：弹窗超过 30 秒收回并闪红',()=>{assert.equal(target.value,'30');assert.ok(target.classList.contains('text-red-400'));assert.deepEqual(durationValues(),[30,24,28])})
  await change(target,'10')
  check('v4：合法输入立即更新合计、不带动其他行',()=>{assert.deepEqual(durationValues(),[10,24,28]);assert.ok(modalTotal().textContent.endsWith('当前合计 62 秒'))})
  // Synchronous act inspects the state before the asynchronous mock completes.
  act(()=>Simulate.click(button('生成全部（3）')))
  check('v4 7：Step3 确认时已写入时长并置 generating、切至第 4 步',()=>{assert.equal(state().step,4);assert.equal(p().shotStatus,'generating');assert.deepEqual(p().segments.map(s=>s.dur),[10,24,28])})
  await tick(20)
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v4 7：生成结果保留弹窗 62 秒合计且无待更新',()=>{assert.deepEqual(p().shots.map(s=>s.dur),[10,24,28]);assert.ok(container.textContent.includes('目标 60 秒 · 当前合计 62 秒'));assert.equal(utils.outdatedShots(p()).length,0)})
  target=container.querySelector('input[aria-label="镜头 01 时长"]');await change(target,'12');await act(async()=>Simulate.blur(target))
  check('v6：第 4 步改时长同步生效，不产生待更新',()=>{assert.deepEqual(p().shots[0].outdated,[]);assert.equal(p().shots[0].dur,12);assert.equal(p().segments[0].dur,12);assert.ok(!button('稍后'))})
  await act(async()=>state().updateSegment('s1',{text:'上游原文修改'}))
  await click(button('待更新'));await click(button('保留当前描述'))
  check('v6：保留当前描述不恢复原时长',()=>{assert.equal(p().segments[0].dur,12);assert.equal(utils.outdatedShots(p()).length,0)})
  await act(async()=>{await state().generateVideos([p().shots[0].id]);state().updateSegment('s1',{text:'上游原文再次修改'})})
  await click(button('重新生成镜头'))
  check('v4 9：Step4 默认只选待更新 01，按当前时长预填，其他行灰色只读',()=>{
    assert.deepEqual(rowChecks(),[true,false,false]);assert.deepEqual(durationValues(),[12,null,null]);assert.ok(modalTotal().textContent.endsWith('当前合计 64 秒'))
    durationRows().slice(1).forEach((row,i)=>{assert.equal(row.lastElementChild.textContent,`${[24,28][i]} 秒`);assert.ok(row.lastElementChild.classList.contains('text-white/40'))})
  })
  await nativeClick(durationRows()[1].lastElementChild);assert.deepEqual(rowChecks(),[true,false,false])
  const untouchedShots=structuredClone(p().shots.slice(1))
  const oldVersions=structuredClone(p().shots[0].video.versions)
  await change(container.querySelector('input[aria-label="段落 01 时长"]'),'16')
  assert.ok(modalTotal().textContent.endsWith('当前合计 68 秒'))
  act(()=>Simulate.click(button('生成全部（1）')))
  check('v4 10：Step4 确认立即使用 16 秒，未勾选时长不变',()=>{assert.equal(p().shotStatus,'generating');assert.deepEqual(p().segments.map(s=>s.dur),[16,24,28])})
  await tick(20)
  check('v5：重生成使用 16 秒、有序节拍、无待更新、其他镜头和旧视频版本保留',()=>{
    assert.equal(p().shots[0].dur,16);assert.equal(utils.outdatedShots(p()).length,0);assert.ok(p().shots[0].timeline.startsWith('① '));assert.ok(!p().shots[0].timeline.includes('秒：'));assert.deepEqual(p().shots.slice(1),untouchedShots)
    assert.deepEqual(p().shots[0].video.versions,oldVersions);assert.equal(p().shots[0].video.stale,true);assert.equal(p().shots[0].video.staleReason,'镜头已重新生成');assert.ok(container.textContent.includes('当前合计 68 秒'))
  })
  await mountLive('/src/steps/Step2Segments.tsx')
  await click(button('新增剧本段落'));await change(container.querySelector('input[placeholder]'),'段落四');await change(container.querySelector('textarea'),'丁'.repeat(30));await change(container.querySelector('input[aria-label="新增段落时长"]'),'4');await act(async()=>Simulate.blur(container.querySelector('input[aria-label="新增段落时长"]')));await click(button('添加'))
  await mountLive('/src/steps/Step4Shots.tsx');await click(button('去生成'))
  check('v7：第 2 步新增 04 后仅选 04，沿用用户设置的 4 秒',()=>{assert.deepEqual(rowChecks(),[false,false,false,true]);assert.deepEqual(durationValues(),[null,null,null,4]);assert.ok(modalTotal().textContent.endsWith('当前合计 72 秒'))})
  await click(button('取消'))
  // Editing other segments does not reallocate the already-added segment.
  await act(async()=>{state().updateSegment('s1',{dur:12});state().updateSegment('s2',{dur:10});state().updateSegment('s3',{dur:10})})
  await click(button('去生成'))
  check('v5：剩余预算变正也不重新分配新增段落',()=>{assert.deepEqual(durationValues(),[null,null,null,4]);assert.ok(modalTotal().textContent.endsWith('当前合计 36 秒'))})
  await click(button('取消'))
  // Existing-shot edits and selection changes do not alter any other durations.
  await mountLive('/src/steps/GenShotModal.tsx',{initialSelection:[1,4],onClose(){},onConfirm(){}})
  await change(container.querySelector('input[aria-label="段落 01 时长"]'),'20')
  check('v4：已有镜头手调不立即带动新段落',()=>assert.deepEqual(durationValues(),[20,null,null,4]))
  await nativeClick(durationRows()[3].querySelector('span.truncate'));await nativeClick(durationRows()[3].querySelector('span.truncate'))
  check('v5：勾选变化不重新分配任何行',()=>assert.deepEqual(durationValues(),[20,null,null,4]))
  await resetLive()
  await act(async()=>{state().createProject('v4 自动时长');state().setScript('自动模式验收');await state().startSegments();await state().startAssets();await state().generateAssetImages(p().assets.map(a=>a.id));state().updateSegment('s1',{text:'甲'.repeat(12)});state().updateSegment('s2',{text:'乙'.repeat(60)});state().updateSegment('s3',{text:'丙'.repeat(120)})})
  await mountLive('/src/steps/Step2Segments.tsx')
  check('v5 13：自动页头合计 39 秒、三张卡片可调，改正文不重分配',()=>{assert.ok(container.textContent.includes('共 3 个剧本段落 · 预计成片时长约 39 秒'));assert.deepEqual([...container.querySelectorAll('input[type="number"]')].map(i=>Number(i.value)),[15,12,12])})
  await mountLive('/src/steps/Step3Assets.tsx');await openShots()
  check('v5 13：自动预填 15/12/12 秒与预计合计 39 秒',()=>{assert.deepEqual(durationValues(),[15,12,12]);assert.equal(modalTotal().textContent,'成片时长：自动，按内容确定 · 预计合计 39 秒')})
  await change(container.querySelector('input[aria-label="段落 01 时长"]'),'18')
  await nativeClick(durationRows()[2].querySelector('span.truncate'));await nativeClick(durationRows()[2].querySelector('span.truncate'))
  check('v4 8：自动模式可手改到 18 秒，勾选变化保持手改且其余值不变',()=>{assert.deepEqual(durationValues(),[18,12,12]);assert.ok(modalTotal().textContent.endsWith('预计合计 42 秒'))})
  await click(button('生成全部（3）'));await tick(20)
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v4 8：自动确认优先使用弹窗值，生成后合计一致',()=>{assert.deepEqual(p().shots.map(s=>s.dur),[18,12,12]);assert.ok(container.textContent.includes('预计成片时长约 42 秒'));assert.equal(utils.outdatedShots(p()).length,0)})
  // Verify the callback includes only selected IDs and cancellation never writes drafts.
  let confirmed
  await mountLive('/src/steps/GenShotModal.tsx',{initialSelection:[2],onClose(){},onConfirm:(segNos,durations)=>{confirmed={segNos,durations}}})
  await change(container.querySelector('input[aria-label="段落 02 时长"]'),'11');await click(button('生成全部（1）'))
  check('v4：onConfirm 仅携带勾选段落的 id 与时长',()=>{assert.deepEqual(confirmed,{segNos:[2],durations:{s2:11}});assert.equal(p().segments[1].dur,12)})

  // v5: document acceptance flow, including Step2 previews and cross-page state.
  await resetLive()
  await act(async()=>{
    state().createProject('v5 完整验收');state().setScript('拆解与时长联动验收')
    await state().startSegments('manual',60);await state().startAssets();await state().generateAssetImages(p().assets.map(a=>a.id))
  })
  const segmentValues = () => [...container.querySelectorAll('input[aria-label^="段落 "]')].map(i=>Number(i.value))
  const segmentInput = (no=1) => container.querySelector(`input[aria-label="段落 ${String(no).padStart(2,'0')} 时长"]`)
  const durationControl = (no=1) => segmentInput(no).parentElement.parentElement
  const normalTooltip = ''
  await act(async()=>useStore.setState({toast:null}))
  await mountLive('/src/steps/Step2Segments.tsx')
  check('v5 1/3：拆解完成卡片 27/16/17、页头 60 秒、无 tooltip 与紧凑样式',()=>{
    assert.deepEqual(segmentValues(),[27,16,17]);assert.ok(container.textContent.includes('共 3 个剧本段落 · 目标 60 秒 · 当前合计 60 秒'))
    assert.equal(durationControl().title,normalTooltip);assert.ok(durationControl().querySelector('.h-7'))
    assert.equal(durationControl().parentElement.nextElementSibling.getAttribute('aria-label'),'删除段落')
  })
  await nativeClick(durationControl().querySelector('[aria-label="增加时长"]'));await nativeClick(durationControl().querySelector('[aria-label="增加时长"]'))
  check('v5 2：第 2 步连点即时预览 62 秒，800ms 前存储仍是 27',()=>{
    assert.deepEqual(segmentValues(),[29,16,17]);assert.deepEqual(p().segments.map(s=>s.dur),[27,16,17]);assert.ok(container.textContent.includes('当前合计 62 秒'))
    const header=[...container.querySelectorAll('p')].find(e=>e.textContent.includes('当前合计'))
    assert.ok(!/amber|red/.test(header.className));assert.ok(!container.textContent.includes('重新分配'))
  })
  await tick(850)
  check('v6 8：第 2 步停下提交，无 toast、其他段落不变',()=>{
    assert.deepEqual(p().segments.map(s=>s.dur),[29,16,17]);assert.equal(state().toast,null);assert.ok(!button('稍后'))
    assert.deepEqual(JSON.parse(localStorage.getItem('phanthy.projects.v2')).find(x=>x.id===p().id).segments.map(s=>s.dur),[29,16,17])
  })
  for (const el of [durationControl().querySelector('[aria-label="减少时长"]'),durationControl().querySelector('[aria-label="增加时长"]'),segmentInput(),durationControl().querySelector('span'),durationControl()]) await nativeClick(el)
  check('v5 4：点击调节器各处不进入标题或原文编辑',()=>{
    assert.equal(container.querySelectorAll('button[title="点击编辑标题"]').length,3);assert.equal(container.querySelector('textarea'),null);assert.deepEqual(segmentValues(),[29,16,17])
  })
  await tick(850)
  await mountLive('/src/steps/Step3Assets.tsx');await openShots()
  check('v5 5：弹窗沿用 29/16/17、合计 62、新副文案',()=>{
    assert.deepEqual(durationValues(),[29,16,17]);assert.equal(modalTotal().textContent,'成片时长：目标 60 秒 · 当前合计 62 秒')
    assert.ok(container.textContent.includes('可在下方逐段调整（4–30 秒），生成后也可以随时修改。'))
    assert.ok(!container.textContent.includes('时长已按原文长短预先分配'));assert.ok(!container.textContent.includes('生成时确定'))
  })
  await nativeClick(durationRows()[2].querySelector('span.truncate'))
  check('v5 6：取消 03 仍计入 17 秒，其他行不变',()=>{assert.deepEqual(durationValues(),[29,16,null]);assert.equal(durationRows()[2].lastElementChild.textContent,'17 秒');assert.ok(modalTotal().textContent.endsWith('当前合计 62 秒'))})
  await nativeClick(durationRows()[2].querySelector('span.truncate'))
  assert.deepEqual(durationValues(),[29,16,17])
  await change(segmentInput(2),'20');await nativeClick(durationRows()[1].querySelector('span.truncate'))
  check('v5：取消勾选手改行显示存储值、合计排除该行草稿',()=>{assert.equal(durationRows()[1].lastElementChild.textContent,'16 秒');assert.ok(modalTotal().textContent.endsWith('当前合计 62 秒'))})
  await nativeClick(durationRows()[1].querySelector('span.truncate'))
  check('v5：重新勾选恢复 20 秒草稿及 66 秒合计',()=>{assert.deepEqual(durationValues(),[29,20,17]);assert.ok(modalTotal().textContent.endsWith('当前合计 66 秒'))})
  await click(button('取消'));await mountLive('/src/steps/Step2Segments.tsx')
  check('v5 7：取消弹窗后第 2 步仍为 29/16/17',()=>{assert.deepEqual(segmentValues(),[29,16,17]);assert.deepEqual(p().segments.map(s=>s.dur),[29,16,17])})
  await mountLive('/src/steps/Step3Assets.tsx');await openShots();await change(segmentInput(2),'20')
  act(()=>Simulate.click(button('生成全部（3）')))
  check('v5 8：确认立即写入 29/20/17 并进入第 4 步 generating',()=>{assert.deepEqual(p().segments.map(s=>s.dur),[29,20,17]);assert.equal(state().step,4);assert.equal(p().shotStatus,'generating')})
  await tick(20);await mountLive('/src/steps/Step4Shots.tsx')
  check('v5 8/16：生成后合计 66、无待更新、每个镜头都是无秒数圈号节拍',()=>{
    assert.deepEqual(p().shots.map(s=>s.dur),[29,20,17]);assert.equal(utils.outdatedShots(p()).length,0);assert.ok(container.textContent.includes('目标 60 秒 · 当前合计 66 秒'))
    p().shots.forEach(s=>{assert.ok(s.timeline.split('\n').every(l=>/^[①-⑤] /.test(l)));assert.ok(!/秒\s*[：:]/.test(s.timeline))})
  })
  await mountLive('/src/steps/Step2Segments.tsx')
  check('v5 8：第 2 步同步 29/20/17、有镜头同值保持无 tooltip',()=>{assert.deepEqual(segmentValues(),[29,20,17]);assert.equal(durationControl().title,normalTooltip);assert.equal(container.querySelector('.text-amber-200'),null)})
  await change(segmentInput(),'25');await act(async()=>Simulate.blur(segmentInput()))
  check('v6 8：第 2 步改成 25 秒立即同步，无待更新、琥珀色或 tooltip',()=>{
    assert.ok(!container.textContent.includes('镜头待更新'));assert.ok(!segmentInput().classList.contains('text-amber-200'));assert.equal(durationControl().title,'');assert.ok(!button('稍后'))
    assert.deepEqual(p().shots[0].outdated,[]);assert.equal(p().shots[0].dur,25)
  })
  await act(async()=>state().updateSegment('s1',{text:'原文变化'}))
  await mountLive('/src/steps/Step4Shots.tsx');await click(button('待更新'))
  check('v6 10：待更新弹层不再包含时长恢复说明',()=>{assert.ok(!container.textContent.includes('时长恢复'));assert.ok(!container.textContent.includes('时长改回'))})
  await click(button('保留当前描述'))
  check('v6 10：保留上游修改的当前描述，不恢复时长',()=>{assert.equal(state().toast,'已保留当前描述');assert.equal(utils.outdatedShots(p()).length,0);assert.equal(p().segments[0].dur,25)})
  await act(async()=>state().updateSegment('s1',{dur:29}))
  await mountLive('/src/steps/Step2Segments.tsx')
  check('v6：手动改回 29 秒仍无琥珀色或 tooltip',()=>{assert.deepEqual(segmentValues(),[29,20,17]);assert.equal(container.querySelector('.text-amber-200'),null);assert.equal(durationControl().title,normalTooltip)})
  await click(button('新增剧本段落'));await change(container.querySelector('input[placeholder]'),'段落四');await change(container.querySelector('textarea'),'新增内容');await change(container.querySelector('input[aria-label="新增段落时长"]'),'4');await act(async()=>Simulate.blur(container.querySelector('input[aria-label="新增段落时长"]')));await click(button('添加'))
  check('v7：新增段落手填 4 秒，原段落不变，合计 70',()=>{assert.deepEqual(segmentValues(),[29,20,17,4]);assert.deepEqual(p().segments.map(s=>s.dur),[29,20,17,4]);assert.ok(container.textContent.includes('当前合计 70 秒'))})
  await click(container.querySelectorAll('button[aria-label="删除段落"]')[3]);await click(button('删除段落'))
  check('v5 12：删除新增段落不重新分配，其余合计回到 66',()=>{assert.deepEqual(segmentValues(),[29,20,17]);assert.ok(container.textContent.includes('当前合计 66 秒'))})
  await change(segmentInput(),'3');await act(async()=>Simulate.blur(segmentInput()))
  check('v5：第 2 步越界收回到 4 秒并闪红',()=>{assert.equal(segmentInput().value,'4');assert.ok(segmentInput().classList.contains('text-red-400'))})
  await change(segmentInput(),'31');await act(async()=>Simulate.blur(segmentInput()))
  check('v5：第 2 步越界收回到 30 秒并闪红',()=>{assert.equal(segmentInput().value,'30');assert.ok(segmentInput().classList.contains('text-red-400'))})
  // Hold only the mock generation delay so disabled controls are inspected before completion.
  let releaseGeneration
  globalThis.setTimeout=(fn,ms,...args)=>ms===1600 ? (releaseGeneration=()=>fn(...args),0) : realTimeout(fn,ms,...args)
  act(()=>{generating=state().generateShots([1])})
  check('v5：正在生成镜头时第 2 步调节器禁用且无 tooltip',()=>{
    assert.equal(p().shotStatus,'generating');assert.ok([...container.querySelectorAll('input[type="number"]')].every(i=>i.disabled));assert.equal(durationControl().hasAttribute('title'),false)
  })
  globalThis.setTimeout=(fn,ms,...args)=>realTimeout(fn,[900,1200,1400,1600].includes(ms)?0:ms,...args)
  await act(async()=>{releaseGeneration();await generating})
  await mountLive('/src/steps/Step4Shots.tsx')
  target=container.querySelector('input[aria-label="镜头 01 时长"]');await change(target,'12');await act(async()=>Simulate.blur(target))
  check('v6：第 4 步改时长不弹小卡片',()=>{assert.ok(!button('稍后'));assert.ok(!container.textContent.includes('镜头内容才会按'));assert.equal(p().shots[0].dur,12)})
  check('v5 15：列头与来源名使用画面节奏、字段 key 保持 timeline',()=>{
    assert.ok(container.textContent.includes('画面节奏'));assert.equal(fields.find(f=>f.key==='timeline').label,'画面节奏')
    assert.ok(utils.renameOccurrences(p(),'苏可').some(hit=>hit.source==='镜头 01 · 画面节奏'))
  })
  await click(buttons().find(b=>b.textContent.startsWith('字段')))
  check('v5 15：字段显隐面板显示画面节奏',()=>assert.ok(button('画面节奏')))
  await act(async()=>Simulate.mouseDown(container.querySelector('.fixed.inset-0.z-50')))
  await click(container.querySelector(`[id="shot-${p().shots[0].id}"] button[title="更多"]`));await click(button('编辑镜头详情'))
  check('v5 15：详情抽屉显示画面节奏',()=>{const drawer=container.querySelector('.animate-slideInRight');assert.ok(drawer);assert.ok(drawer.textContent.includes('画面节奏'))})
  await click(container.querySelector('button[aria-label="关闭"]'))
  const firstShotId=p().shots[0].id
  await act(async()=>{state().updateSegment('s1',{dur:4});await state().regenerateShot(firstShotId)})
  const shortBeats=p().shots[0].timeline
  await act(async()=>{state().updateSegment('s1',{dur:30});await state().regenerateShot(firstShotId)})
  check('v5 16：同一段落 4 秒与 30 秒镜头画面节奏完全相同',()=>{assert.equal(p().shots[0].dur,30);assert.equal(p().shots[0].timeline,shortBeats)})
  await act(async()=>{state().updateShot(firstShotId,{timeline:'① 用户手改第一拍\n② 用户手改第二拍\n③ 用户手改第三拍'});state().updateSegment('s1',{dur:4});await state().regenerateShot(firstShotId)})
  check('v5 17：先手改再改时长重新生成，每一拍保留',()=>assert.equal(p().shots[0].timeline,'① 用户手改第一拍\n② 用户手改第二拍\n③ 用户手改第三拍'))

  check('v5 14：存量已拆解无镜头仅补缺失时长、已有值不动',()=>{
    const old=structuredClone(seed);old.config={...old.config,durMode:'manual',targetDur:60};old.shots=[];old.shotStatus='none'
    old.segments[0].dur=29;delete old.segments[1].dur;delete old.segments[2].dur
    const migrated=migrateProjects([old])[0]
    assert.deepEqual(migrated.segments.map(s=>s.dur),[29,15,16]);assert.deepEqual(migrateProjects([structuredClone(migrated)])[0],migrated)
    old.config.durMode='auto';old.segments.forEach(s=>delete s.dur)
    assert.deepEqual(migrateProjects([old])[0].segments.map(s=>s.dur),[15,12,12])
  })
  check('v5 18：存量镜头秒数迁移为有序节拍且重复迁移不变',()=>{
    const old=structuredClone(seed);old.shots[0].timeline='0–5秒：甲\n5–10秒：乙'
    const migrated=migrateProjects([old])[0];assert.equal(migrated.shots[0].timeline,'① 甲\n② 乙')
    assert.deepEqual(migrateProjects([structuredClone(migrated)])[0],migrated)
  })
  check('v5：分配器只扣除其他段落、最大余数、夹取上下限与空输入',()=>{
    const project=structuredClone(seed);project.config={...project.config,durMode:'manual',targetDur:60};project.shots=[]
    project.segments.forEach(s=>delete s.dur)
    assert.deepEqual([...utils.allocateSegmentDurations(project,project.segments).values()],[27,16,17])
    assert.ok(project.segments.every(s=>s.dur===undefined)) // allocation itself has no mutations
    project.segments[0].dur=20;project.segments[1].dur=15;project.segments[2].dur=10
    const fresh={id:'new',no:4,title:'新增',text:'原文'}
    assert.equal(utils.allocateSegmentDurations(project,[fresh]).get('new'),15)
    project.config.targetDur=45;assert.equal(utils.allocateSegmentDurations(project,[fresh]).get('new'),4)
    project.config.targetDur=4;assert.equal(utils.allocateSegmentDurations(project,[fresh]).get('new'),4)
    project.config.targetDur=600;assert.equal(utils.allocateSegmentDurations(project,[fresh]).get('new'),30)
    project.config.targetDur=61;project.segments.forEach(s=>s.text='')
    assert.deepEqual([...utils.allocateSegmentDurations(project,project.segments).values()],[21,20,20])
    assert.equal(utils.allocateSegmentDurations(project,[]).size,0)
    project.config.durMode='auto'
    assert.deepEqual([...utils.allocateSegmentDurations(project,[{...fresh,text:''},{...fresh,id:'long',text:'字'.repeat(240)}]).values()],[4,15])
  })

  // v7: duration boundaries, redo, asset changes and generation races.
  const pausedGeneration = async(ms, run) => {
    const previous = globalThis.setTimeout
    const pending = []
    globalThis.setTimeout = (fn, delay, ...args) => delay === ms ? (pending.push(() => fn(...args)), 0) : previous(fn, delay, ...args)
    const release = async() => { assert.ok(pending.length,'generation is waiting'); await act(async()=>pending.shift()()) }
    try { await run(release) } finally { globalThis.setTimeout = previous }
  }
  await resetLive()
  for (const [target,count] of [[60,3],[120,4],[91,4],[300,10],[600,20],[8,2],[4,1]]) {
    await act(async()=>{state().createProject(`v7 ${target} 秒`);state().setScript('样例');await state().startSegments('manual',target)})
    check(`v7 1–4：${target} 秒拆为 ${count} 段且合计精确`,()=>{
      assert.equal(p().segments.length,count);assert.equal(p().segments.reduce((n,s)=>n+s.dur,0),target)
      assert.ok(p().segments.every(s=>Number.isInteger(s.dur)&&s.dur>=4&&s.dur<=30))
      assert.equal(p().segments.map(s=>s.text).join(''),seed.segments.map(s=>s.text).join(''))
      assert.equal(new Set(p().segments.map(s=>s.id)).size,count)
      assert.equal(state().toast,`已生成 ${count} 个剧本段落`)
      if(target===60) {assert.deepEqual(p().segments.map(s=>s.dur),[27,16,17]);assert.deepEqual(p().segments.map(s=>s.id),['s1','s2','s3'])}
      if(target===8) assert.deepEqual(p().segments.map(s=>s.dur),[4,4])
    })
    if(target===120) {
      await mountLive('/src/steps/Step2Segments.tsx')
      check('v7 2：120 秒页头显示精确合计',()=>assert.ok(container.textContent.includes('目标 120 秒 · 当前合计 120 秒')))
      await act(async()=>root.unmount());root=undefined
    }
  }
  check('v7：allocateExact 全部合法目标、偏斜权重和分组保真',()=>{
    for(let total=4;total<=600;total++) {
      const n=Math.max(Math.ceil(total/30),Math.min(3,Math.floor(total/4)))
      for(const weights of [Array(n).fill(0),Array.from({length:n},(_,i)=>i===0?10000:1),Array.from({length:n},(_,i)=>i*i+3)]) {
        const result=utils.allocateExact(total,weights)
        assert.equal(result.reduce((a,b)=>a+b,0),total)
        assert.ok(result.every(v=>Number.isInteger(v)&&v>=4&&v<=30))
      }
    }
    assert.deepEqual(utils.allocateExact(60,[1000,1,1]),[30,15,15])
    for(const text of ['甲乙丙丁戊己庚辛壬癸','甲，乙；丙，丁；戊己庚辛','甲。乙！丙？丁…戊己庚辛']) {
      const parts=utils.splitSegmentText(text,5);assert.equal(parts.length,5);assert.ok(parts.every(Boolean));assert.equal(parts.join(''),text)
    }
  })
  await act(async()=>{state().createProject('v7 自动');state().setScript('样例');await state().startSegments()})
  check('v7 5：自动模式保持 3 段及 15/12/12 秒',()=>assert.deepEqual(p().segments.map(s=>s.dur),[15,12,12]))
  await mountLive('/src/steps/Step2Segments.tsx')
  await click(button('新增剧本段落'));await change(container.querySelector('input[placeholder]'),'新增九秒段落');await change(container.querySelector('textarea'),'新增原文')
  target=container.querySelector('input[aria-label="新增段落时长"]');assert.equal(target.value,'15');await change(target,'9');await act(async()=>Simulate.blur(target));await click(button('添加'))
  check('v7 6：新增 9 秒直接保存、合计增加、无额外提示',()=>{assert.equal(p().segments[3].dur,9);assert.ok(container.textContent.includes('预计成片时长约 48 秒'));assert.equal(state().toast,'已新增剧本段落')})
  await click(button('重新拆解'))
  check('v7 8：重新拆解确认说明、自动模式预填、无锁定提示',()=>{assert.ok(container.textContent.includes('确认重新拆解剧本'));assert.ok(container.textContent.includes('当前 4 个段落（包括你的手动修改）会被覆盖'));assert.ok(!container.textContent.includes('将锁定'));assert.equal(container.querySelector('input[type="radio"]').checked,true);assert.ok(container.textContent.includes('50 星钻'))})
  await toggleCheckbox(container.querySelectorAll('input[type="radio"]')[1],true);await change(container.querySelector('input[aria-label="目标成片时长"]'),'120')
  const redoBalance=p().balance
  await pausedGeneration(1600,async release=>{
    await click(button('确认并重新拆解'))
    check('v7 8：重新拆解确认即 generating，停留第 2 步',()=>{assert.equal(state().step,2);assert.equal(p().segStatus,'generating');assert.ok(container.textContent.includes('正在拆解剧本'))})
    await release()
  })
  check('v7 8/9：重新拆解覆盖段落、保存 120 秒配置、扣费 50',()=>{assert.equal(p().segments.length,4);assert.equal(p().config.targetDur,120);assert.equal(p().balance,redoBalance-50);assert.equal(p().segments.reduce((n,s)=>n+s.dur,0),120);assert.ok(!p().segments.some(s=>s.title==='新增九秒段落'))})
  await click(button('重新拆解'))
  check('v7 8：再次打开预填上次指定模式和 120 秒',()=>{assert.equal(container.querySelectorAll('input[type="radio"]')[1].checked,true);assert.equal(container.querySelector('input[aria-label="目标成片时长"]').value,'120')})
  await click(button('取消'))
  await pausedGeneration(1600,async release=>{
    act(()=>{work=state().startAssets()})
    const before=JSON.stringify(p())
    await act(async()=>state().restartSegments('manual',60))
    check('v7 10：提取开始后 UI 与 store 均禁止重新拆解',()=>{assert.equal(button('重新拆解').disabled,true);assert.equal(button('重新拆解').title,'已开始提取角色与场景，不能重新拆解，可以直接修改段落');assert.equal(JSON.stringify(p()),before)})
    await release();await act(async()=>work)
  })
  const beforeRedo=JSON.stringify(p());await act(async()=>state().restartSegments('auto'))
  check('v7 10：提取完成后直接调用重新拆解也无效',()=>assert.equal(JSON.stringify(p()),beforeRedo))
  await mountLive('/src/steps/Step3Assets.tsx')
  check('v7：首次镜头生成仍强制补齐参考图',()=>{assert.ok(buttons().some(b=>b.textContent.includes('生成全部参考图')));assert.ok(!buttons().some(b=>b.textContent.includes('生成镜头设计')))})

  await resetLive()
  await act(async()=>{state().updateSegment('s1',{text:p().segments[0].text+'健身教练出现。'});state().dismissAllOutdated()})
  await mountLive('/src/steps/Step2Segments.tsx',{},true)
  check('v7 11：改原文无重新提取提示、无第 3 步圆点',()=>{assert.ok(!p().assetsHint);assert.ok(!container.textContent.includes('重新提取'));assert.equal(dots().length,0)})
  await mountLive('/src/steps/Step3Assets.tsx',{},true)
  check('v7 12/27：新增卡片与底栏新文案',()=>{assert.ok(button('新增角色'));assert.ok(button('新增场景'));assert.ok(container.textContent.includes('生成视频时会参考这些角色与场景图，保持画面一致'));assert.ok(!button('重新提取'));assert.ok(!button('无需提取'))})
  await click(button('新增角色'))
  check('v7 13：新增角色名称为空禁止添加',()=>assert.equal(button('添加').disabled,true))
  await change(container.querySelector('input[aria-label="角色名称"]'),'苏可')
  check('v7 13：同类型重名禁止添加',()=>{assert.ok(container.textContent.includes('已存在同名角色'));assert.equal(button('添加').disabled,true)})
  await change(container.querySelector('input[aria-label="角色名称"]'),'健身教练');await change(container.querySelector('textarea'),'穿运动服，短发');await click(button('添加'))
  const coach=p().assets.find(a=>a.name==='健身教练')
  check('v7 14：新增角色默认参考图描述、引用镜头待更新、生成参考图入口',()=>{assert.ok(coach.prompt.includes('健身教练'));assert.ok(coach.prompt.includes('穿运动服'));assert.equal(coach.imgState,'none');assert.equal(coach.importance,'minor');assert.deepEqual(p().shots[0].outdated,[{kind:'asset',key:coach.id,text:'角色「健身教练」已新增'}]);assert.equal(utils.outdatedShots(p()).length,1);assert.equal(state().toast,'已新增角色，1 个镜头需要更新');assert.ok(container.textContent.includes('待生成参考图'));assert.ok(buttons().some(b=>b.textContent.includes('生成全部参考图')))})
  await act(async()=>state().dismissAllOutdated());await click(button('新增角色'));await change(container.querySelector('input[aria-label="角色名称"]'),'未登场人物');await click(button('添加'))
  check('v7 15：新增无引用角色不产生待更新',()=>{assert.equal(utils.outdatedShots(p()).length,0);assert.equal(state().toast,'已新增角色')})
  await act(async()=>{state().updateSegment('s2',{text:p().segments[1].text+'走到训练室。'});state().dismissAllOutdated()})
  await click(button('新增场景'));await change(container.querySelector('input[aria-label="场景名称"]'),'训练室');await click(button('添加'))
  check('v7：新增场景自动记录所属段落并标记引用镜头',()=>{const scene=p().assets.find(a=>a.name==='训练室');assert.deepEqual(scene.belongSegs,[2]);assert.deepEqual(p().shots[1].outdated,[{kind:'asset',key:scene.id,text:'场景「训练室」已新增'}]);assert.equal(state().toast,'已新增场景，1 个镜头需要更新')})
  const assetCount=p().assets.length
  await act(async()=>{state().addAsset('char',{name:' ',desc:'',prompt:''});state().addAsset('char',{name:'健身教练',desc:'',prompt:''})})
  check('v7：store 拒绝空名称和同类型重名',()=>assert.equal(p().assets.length,assetCount))

  await resetLive();await act(async()=>state().generateVideos(['sh1','sh2','sh3']))
  await mountLive('/src/steps/Step3Assets.tsx')
  const openAssetSetting=async()=>{await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('编辑角色设定'))}
  await openAssetSetting();await change(container.querySelectorAll('textarea')[1],'参考图提示词改动')
  check('v7 17：只改参考图描述不显示静默勾选框',()=>assert.equal(container.querySelector('label input'),null))
  await click(button('保存'))
  check('v7 17：只改提示词不标镜头或视频',()=>{assert.equal(utils.outdatedShots(p()).length,0);assert.ok(p().shots.every(s=>!s.video.stale));assert.equal(state().toast,'设定已保存')})
  await openAssetSetting();await change(container.querySelector('textarea'),'新人物设定')
  check('v7 17：改描述仍显示静默勾选框',()=>assert.ok(container.querySelector('label input')))
  await click(button('保存'))
  check('v7 17：改描述仍标引用镜头待更新',()=>{assert.equal(utils.outdatedShots(p()).length,3);assert.ok(p().shots.every(s=>!s.video.stale))})
  await act(async()=>state().dismissAllOutdated())
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('AI 重新生成图片'));await change(container.querySelector('textarea'),'生成新图的提示词')
  await click(button('确认生成'));await tick(20)
  check('v7 16：生图弹窗改提示词只因换图标视频 stale',()=>{assert.equal(utils.outdatedShots(p()).length,0);assert.ok(p().shots.every(s=>s.video.staleReason==='角色「苏可」参考图已更新'))})
  await act(async()=>p().shots.forEach(s=>state().dismissVideoStale(s.id)))
  await openAssetSetting();await change(container.querySelector('input[aria-label="角色名称"]'),'苏小可');await click(button('保存'));await click([...document.querySelectorAll('button')].find(b=>b.textContent==='同步替换并保存'))
  check('v7 18：改名同步替换只标文本被替换的已有视频',()=>{assert.equal(utils.renameOccurrences(p(),'苏可').length,0);assert.equal(utils.outdatedShots(p()).length,0);assert.ok(p().shots.every(s=>s.video.staleReason==='镜头描述已修改'))})
  await click(container.querySelectorAll('button[aria-label="更多操作"]')[1]);await click(button('删除角色'))
  check('v7 19：删除资产确认文案包含镜头和视频影响',()=>assert.ok(container.textContent.includes('「苏小可」被 3 个镜头引用。删除后，这些镜头会标记为待更新，已生成的视频会标记为需重新生成。')))
  await click(button('删除角色'))
  check('v7 19：删除资产同时标记引用镜头及已有视频',()=>{assert.equal(utils.outdatedShots(p()).length,3);assert.ok(p().shots.every(s=>s.video.staleReason==='角色「苏小可」已删除'))})

  await resetLive();await act(async()=>{state().updateSegment('s1',{dur:20});await state().generateVideos(['sh1']);state().updateSegment('s1',{dur:24});state().updateSegment('s1',{dur:20})})
  await mountLive('/src/steps/Step4Shots.tsx')
  check('v7 7：改回采用版本时长仍保留需重新生成',()=>{assert.equal(p().shots[0].video.stale,true);assert.equal(p().shots[0].video.staleReason,'时长改为 24 秒');assert.ok(button('需重新生成'))})
  await click(button('需重新生成'))
  check('v7 20：视频浮层显示标题和原因',()=>{assert.ok(container.textContent.includes('镜头 01 的视频需要重新生成'));assert.ok(container.textContent.includes('时长改为 24 秒'))})
  await click(buttons().find(b=>b.textContent.endsWith('重新生成视频')&&b.textContent.startsWith('✦')))
  check('v7 20：重新生成入口只打开当前镜头确认框',()=>{assert.ok(button('确认并生成 1 段视频'));assert.ok(container.textContent.includes('1 段视频 · 共 20 秒'))})
  await click(button('取消'));await click(button('需重新生成'));await click(button('保留当前视频'))
  check('v7 20：保留视频清除提示、版本不变',()=>{assert.equal(p().shots[0].video.stale,false);assert.equal(p().shots[0].video.staleReason,undefined);assert.equal(p().shots[0].video.versions.length,1);assert.ok(container.querySelector('#shot-sh1').textContent.includes('视频已生成'));assert.equal(state().toast,'已保留当前视频')})
  await act(async()=>state().updateShot('sh1',{action:'新动作'}));await mountLive('/src/steps/Step5Video.tsx');await click(button('· 需重新生成'));await click(button('保留当前视频'))
  check('v7 21：成片页保留当前视频后提示消失',()=>{assert.ok(!button('· 需重新生成'));assert.equal(state().toast,'已保留当前视频')})
  await act(async()=>state().updateShot('sh1',{action:'另一个动作'}));await click(button('· 需重新生成'));await click(button('去镜头页重新生成'))
  check('v7 21：成片页浮层跳回第 4 步',()=>assert.equal(state().step,4))

  await resetLive()
  const otherShots=JSON.stringify([p().shots[0],p().shots[2]])
  await pausedGeneration(1600,async release=>{
    act(()=>{work=state().generateShots([2])})
    await act(async()=>{state().updateSegment('s2',{text:'苏可走向窗边。'});state().updateSegment('s2',{text:'苏可走向门口。'})})
    await release();await act(async()=>work)
  })
  check('v7 22：镜头生成期间原文修改保留、同原因去重、其他段不变',()=>{assert.deepEqual(p().shots[1].outdated,[{kind:'segText',text:'段落原文已修改'}]);assert.equal(JSON.stringify([p().shots[0],p().shots[2]]),otherShots)})
  await act(async()=>state().generateShots([2]))
  check('v7：积压原因完成后清空，下次生成无旧原因',()=>assert.deepEqual(p().shots[1].outdated,[]))
  await resetLive()
  await pausedGeneration(1600,async release=>{
    act(()=>{work=state().generateShots([2])})
    await act(async()=>state().updateAsset('a2',{desc:'生成过程中角色外观变化'}))
    await release();await act(async()=>work)
  })
  check('v7 23：镜头生成期间角色描述改动保留',()=>assert.deepEqual(p().shots[1].outdated,[{kind:'asset',key:'a2',text:'角色「苏可」设定已修改'}]))
  // First-time generation has no existing shot for reference lookup.
  for(const mutation of ['desc','delete','add','silent','prompt']) {
    await resetLive()
    await act(async()=>useStore.setState({projects:[{...p(),shots:[],shotStatus:'none'}]}))
    await pausedGeneration(1600,async release=>{
      act(()=>{work=state().startShots([2])})
      await act(async()=>{
        if(mutation==='desc') state().updateAsset('a2',{desc:'生成中修改'})
        if(mutation==='delete') state().deleteAsset('a2')
        if(mutation==='add') state().addAsset('char',{name:'抱枕',desc:'新角色',prompt:''})
        if(mutation==='silent') state().updateSegment('s2',{text:'苏可纠错'},{silent:true})
        if(mutation==='prompt') state().updateAsset('a2',{prompt:'仅生图提示词'})
      })
      await release();await act(async()=>work)
    })
    check(`v7：首次镜头生成中 ${mutation} 按段落引用记录积压`,()=>{
      const reasons=p().shots[0].outdated
      if(mutation==='silent'||mutation==='prompt') assert.deepEqual(reasons,[])
      else {assert.equal(reasons.length,1);assert.equal(reasons[0].kind,'asset');assert.ok(reasons[0].text.endsWith(mutation==='desc'?'设定已修改':mutation==='delete'?'已删除':'已新增'))}
    })
  }
  await resetLive()
  await pausedGeneration(1200,async release=>{
    act(()=>{work=state().startVideos(['sh1','sh2'])})
    await act(async()=>state().updateShot('sh1',{action:'生成期间改主要动作'}))
    await release();await release();await act(async()=>work)
  })
  check('v7 24：首个视频生成中改动作，新版本 stale；未改镜头正常完成',()=>{assert.equal(p().shots[0].video.versions.length,1);assert.equal(p().shots[0].video.staleReason,'镜头描述已修改');assert.equal(p().shots[0].video.stale,true);assert.equal(p().shots[1].video.stale,false);assert.equal(p().shots[1].video.state,'done')})
  await pausedGeneration(1200,async release=>{
    act(()=>{work=state().generateVideos(['sh1'])})
    await act(async()=>{state().updateShot('sh1',{action:'又一动作'});state().updateSegment('s1',{dur:24});state().updateSegment('s1',{dur:15})})
    await release();await act(async()=>work)
  })
  check('v7：生成中改时长再改回也积压、最后原因优先、版本时长保持生成输入',()=>{assert.equal(p().shots[0].video.staleReason,'时长改为 15 秒');assert.equal(p().shots[0].video.stale,true);assert.deepEqual(p().shots[0].video.versions.map(v=>v.dur),[15,15]);assert.deepEqual(p().shots[0].video.versions.map(v=>v.preferred),[false,true])})
  await act(async()=>state().generateVideos(['sh1']))
  check('v7：视频积压原因只消费一次，新生成完成正常清除',()=>{assert.equal(p().shots[0].video.stale,false);assert.equal(p().shots[0].video.versions.length,3)})
  await resetLive()
  await pausedGeneration(1200,async release=>{
    act(()=>{work=state().generateVideos(['sh1'])})
    await act(async()=>state().clearAssetImage('a2'))
    await release();await act(async()=>work)
  })
  check('v7：没有旧版本时生成中换参考图也不会丢 stale',()=>assert.equal(p().shots[0].video.staleReason,'角色「苏可」参考图已更新'))
  await resetLive()
  await act(async()=>useStore.setState({projects:[structuredClone(seed),{...structuredClone(seed),id:'second-project'}]}))
  await pausedGeneration(1600,async release=>{
    let first,second
    act(()=>{first=state().generateShots([2]);state().openProject('second-project');second=state().generateShots([2])})
    await act(async()=>state().updateSegment('s2',{text:'只改第二个项目'}))
    await release();await release();await act(async()=>Promise.all([first,second]))
  })
  check('v7：切换项目后相同段落 ID 的积压原因隔离',()=>{assert.deepEqual(state().projects[0].shots[1].outdated,[]);assert.deepEqual(state().projects[1].shots[1].outdated,[{kind:'segText',text:'段落原文已修改'}])})
  await resetLive()
  await act(async()=>useStore.setState({projects:[structuredClone(seed),{...structuredClone(seed),id:'second-project'}]}))
  await pausedGeneration(1200,async release=>{
    let first,second
    act(()=>{first=state().generateVideos(['sh1']);state().openProject('second-project');second=state().generateVideos(['sh1'])})
    await act(async()=>state().updateShot('sh1',{action:'只改第二个项目'}))
    await release();await release();await act(async()=>Promise.all([first,second]))
  })
  check('v7：切换项目后相同镜头 ID 的视频积压原因隔离',()=>{assert.equal(state().projects[0].shots[0].video.stale,false);assert.equal(state().projects[1].shots[0].video.staleReason,'镜头描述已修改')})

  await resetLive();await act(async()=>{await state().generateVideos(['sh2']);await state().generateVideos(['sh2'])})
  await mountLive('/src/steps/Step4Shots.tsx')
  const beforeDelete=JSON.stringify(p())
  const openDelete=async()=>{await click(container.querySelector('#shot-sh2 button[title="更多"]'));await click(button('删除镜头'))}
  await openDelete()
  check('v7 25：删除镜头先确认，显示 2 个视频版本和段落保留说明',()=>{assert.ok(container.textContent.includes('该镜头已生成的 2 个视频版本会一起删除，无法恢复。'));assert.ok(container.textContent.includes('对应段落会保留'))})
  await click(button('取消'))
  check('v7 25：取消删除不修改项目',()=>assert.equal(JSON.stringify(p()),beforeDelete))
  await openDelete();await click(button('删除镜头'))
  check('v7 25：删除后段落保留，提示段落 02 尚未生成镜头',()=>{assert.equal(p().segments.length,3);assert.ok(!p().shots.some(s=>s.id==='sh2'));assert.ok(container.textContent.includes('段落 02 尚未生成镜头'))})
  await resetLive();await mountLive('/src/steps/Step4Shots.tsx');await openDelete()
  check('v7：无视频镜头删除确认不显示版本损失文案',()=>{assert.ok(container.textContent.includes('确定删除镜头 02 吗？对应段落会保留，之后可以重新生成镜头。'));assert.ok(!container.textContent.includes('个视频版本会一起删除'))})
  await click(button('取消'));await click(button('重新生成镜头'));await change(container.querySelector('textarea'),'  冷色电影感  ');await click(button('生成全部（3）'));await tick(20)
  await click(button('重新生成镜头'))
  check('v7 26：确认生成后按项目保存风格、再次打开预填',()=>{assert.equal(p().config.shotStyle,'冷色电影感');assert.equal(container.querySelector('textarea').value,'冷色电影感');assert.equal(JSON.parse(localStorage.getItem('phanthy.projects.v2')).find(x=>x.id===p().id).config.shotStyle,'冷色电影感')})
  await change(container.querySelector('textarea'),'未确认草稿');await click(button('取消'));await act(async()=>state().regenerateShot('sh2'))
  check('v7 26：取消不写风格、单镜头重生成保留项目风格',()=>assert.equal(p().config.shotStyle,'冷色电影感'))
  await click(button('重新生成镜头'));await change(container.querySelector('textarea'),'   ');await click(button('生成全部（3）'));await tick(20)
  check('v7 26：空白风格确认后清除保存值',()=>assert.equal(p().config.shotStyle,undefined))
  check('v7：迁移清除弃用 assetsHint，改回时长不清除 stale',()=>{
    const old=structuredClone(seed);old.assetsHint=true
    old.shots[0].video={state:'done',stale:true,staleReason:'时长改为 24 秒',versions:[{tag:'v1',dur:15,preferred:true,createdAt:1}]}
    const migrated=migrateProjects([old])[0];assert.equal(migrated.assetsHint,undefined);assert.equal(migrated.shots[0].video.stale,true);assert.equal(migrated.shots[0].video.staleReason,'时长改为 24 秒')
  })

  // Prompt protocol and immutable generation inputs.
  const protocol = await server.ssrLoadModule('/src/services/parse.ts')
  const prompts = await server.ssrLoadModule('/src/services/prompts.ts')
  const mockText = await server.ssrLoadModule('/src/services/mockText.ts')
  const videoPrompts = await server.ssrLoadModule('/src/services/videoPrompt.ts')
  const captureWarnings = (fn) => {
    const savedWarn = console.warn, warnings = []
    console.warn = (...args) => warnings.push(args.join(' '))
    try { fn(); return warnings } finally { console.warn = savedWarn }
  }
  check('提示词：三段系统提示词与原文逐字一致（SHA-256）',()=>{
    const expected={"_SEGMENT_JSONL_SYSTEM_PROMPT": "01c1420e0de03956b1c45077c4388514908a1ff9733be86addcba13d4cd7fab0", "_ASSET_JSONL_SYSTEM_PROMPT": "a75402677d188813aac7f4042a3c9abb39fa30eb3bc3a1372f0b4283cba61718", "_SHOT_JSONL_SYSTEM_PROMPT": "c9dd8307b256a7d24effde088ce0b60d57cf3d17be796c12d83e518be279bcfa"}
    Object.entries(expected).forEach(([key,hash])=>assert.equal(createHash('sha256').update(prompts[key]).digest('hex'),hash))
  })
  check('提示词：拆解用户消息包含模式、目标与原文，auto 目标留空',()=>{
    assert.equal(prompts.buildSegmentUserMessage({...seed,script:'测试剧本',config:{...seed.config,durMode:'auto'}}),'duration_mode：auto\ntarget_seconds：\n剧本：\n测试剧本')
    assert.equal(prompts.buildSegmentUserMessage({...seed,script:'测试剧本',config:{...seed.config,durMode:'manual',targetDur:62}}),'duration_mode：manual\ntarget_seconds：62\n剧本：\n测试剧本')
  })
  check('提示词：提取与镜头用户消息保留段号、别名、风格和手改字段',()=>{
    assert.equal(prompts.buildAssetUserMessage(seed.segments),`剧本段落：\n${seed.segments.map(s=>`[${s.no}] ${s.text}`).join('\n')}`)
    const project=structuredClone(seed);project.assets[1].alias='小可';project.config.shotStyle='暖光';project.shots[1].action='手改主要动作'
    const message=prompts.buildShotUserMessage(project,[2,3],[project.shots[1]])
    assert.ok(message.includes('本次需要生成镜头的段号：2,3'));assert.ok(message.includes('别名：小可'));assert.ok(message.includes('风格参考：暖光'));assert.ok(message.includes('手改主要动作'))
    assert.ok(!prompts.buildShotUserMessage(project,[1]).includes('已有镜头'))
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
      assert.deepEqual(warnings,[])
    }
    assert.ok(mockText.mockAssets(seed).text.split('\n').every(line=>JSON.parse(line).type==='asset'))
    assert.deepEqual(mockText.mockShots(seed,[2,3]).text.split('\n').map(line=>JSON.parse(line).segment_ordinal),[2,3])
  })
  check('JSONL：meta、连续段号、整数与范围、manual 总时长错误会 warn',()=>{
    const response=protocol.jsonl([{type:'meta',duration_mode:'auto',total_seconds:50},{type:'segment',ordinal:2,title:'错号',text:'原文',duration_seconds:3.5},{type:'segment',ordinal:4,duration_seconds:31}])
    const warnings=captureWarnings(()=>protocol.parseSegments(response,'manual',60))
    for(const message of ['duration_mode','连续递增','4–30','total_seconds','目标时长']) assert.ok(warnings.some(w=>w.includes(message)),message)
    assert.ok(captureWarnings(()=>protocol.parseSegments('{bad}\n[]\nnull','auto')).some(w=>w.includes('JSON 对象')))
    assert.ok(captureWarnings(()=>protocol.parseSegments('{}','auto')).some(w=>w.includes('唯一的 meta')))
  })
  check('JSONL：资产字段映射包含 alias、importance 和角色/场景所属段落',()=>{
    const assets=protocol.parseAssets(protocol.jsonl(['character','scene'].map((kind,i)=>({type:'asset',client_key:`test-${i}`,kind,name:'名称',alias:'别名',importance:'major',description:'设定',prompt:'图片描述',segment_ordinals:[1,3]}))))
    assert.deepEqual(assets.map(a=>a.kind),['char','scene'])
    assets.forEach(a=>{assert.equal(a.alias,'别名');assert.equal(a.importance,'major');assert.equal(a.desc,'设定');assert.equal(a.prompt,'图片描述');assert.deepEqual(a.belongSegs,[1,3])})
  })
  check('JSONL：非连续请求段号保持不变，6 拍数组转圈号，asset_ids 写入',()=>{
    const rows=[2,3].map(no=>({...protocol.encodeShot(seed.shots[no-1],no),timeline:['甲','乙','丙','丁','戊','己'],asset_ids:['a2','s_scene1']}))
    const warnings=captureWarnings(()=>{
      const shots=protocol.parseShots(protocol.jsonl(rows),seed,[2,3])
      assert.deepEqual(shots.map(s=>s.segId),['s2','s3']);assert.deepEqual(shots[0].assetIds,['a2','s_scene1'])
      assert.equal(shots[0].timeline,'① 甲\n② 乙\n③ 丙\n④ 丁\n⑤ 戊\n⑥ 己')
    })
    assert.deepEqual(warnings,[])
  })
  check('JSONL：额外、重复、遗漏段号及不存在的资产会 warn',()=>{
    const row=protocol.encodeShot(seed.shots[1],2)
    const warnings=captureWarnings(()=>{
      const shots=protocol.parseShots(protocol.jsonl([{...row,segment_ordinal:1},{...row,asset_ids:['missing','a2','a2']},row]),seed,[2,3])
      assert.equal(shots.length,1);assert.deepEqual(shots[0].assetIds,['a2'])
    })
    for(const message of ['与请求不一致或重复','遗漏','不存在','不能重复']) assert.ok(warnings.some(w=>w.includes(message)),message)
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
    assert.ok(p().shots.every(s=>s.video.stale&&s.video.staleReason==='角色「只改资产名称」参考图已更新'))
  })
  await act(async()=>state().deleteAsset('a2'))
  check('引用：删除资产同步移除所有镜头 assetIds',()=>assert.ok(p().shots.every(s=>!s.assetIds.includes('a2'))))
  check('模板 A/B：空提示词回退 description，固定模板只拼接一次',()=>{
    for(const kind of ['char','scene']) {
      const asset={...seed.assets[0],kind,prompt:'   ',desc:'独立完整设定'}
      const prompt=templates.buildAssetImagePrompt(asset)
      assert.ok(prompt.includes('独立完整设定'))
      const marker=kind==='char'?'角色三视图参考图':'无人物空场景参考图'
      assert.equal(prompt.split(marker).length,2);assert.equal(asset.prompt,'   ')
    }
  })
  check('模板 C：时长与传入镜头时长一致，参考图按 ID 顺序编号',()=>{
    const shot={...seed.shots[0],dur:23,assetIds:['s_scene1','a2','missing']}
    const prompt=videoPrompts.buildVideoPrompt(shot,seed,shot.dur)
    assert.ok(prompt.startsWith('本段总时长 23 秒。'));assert.ok(prompt.includes('参考图：@图片1 为场景「客厅」，@图片2 为角色「苏可」'))
    assert.deepEqual(videoPrompts.videoReferenceImages(shot,seed).map(r=>r.assetId),['s_scene1','a2'])
  })
  check('模板 C：空字段整行跳过，保留逐字对白和固定约束',()=>{
    const shot={...seed.shots[0],assetIds:[],shot:' ',timeline:'① 苏可说："原句对白。"\n② 起身',action:'',anchor:' ',motion:'',blocking:'',subject:'',continuity:'',forbid:'',background:''}
    const prompt=videoPrompts.buildVideoPrompt(shot,{...seed,config:{...seed.config,shotStyle:' '}},4)
    for(const label of ['参考图','画面描述','主要动作','场景位置','动作说明','走位说明','画面主角','连贯要求','保持不变','背景范围','风格']) assert.ok(!prompt.includes(`${label}：`),label)
    assert.ok(prompt.includes('画面节奏：① 苏可说："原句对白。" ② 起身'));assert.ok(prompt.includes('无字幕：'));assert.ok(prompt.includes('音频：生成有声视频。'))
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
    assert.equal(v2.dur,22);assert.ok(v2.videoPrompt.startsWith('本段总时长 22 秒。'));assert.ok(v2.videoPrompt.includes('第二版动作'))
    assert.equal(v2.referenceImages.find(r=>r.assetId==='a2').imageUrl,'data:image/png;base64,new')
  })
  await mountLive('/src/steps/Step5Video.tsx');await click(container.querySelector('button[title="更多"]'));await click(button('查看镜头信息'))
  check('视频信息 UI：展示采用版本提示词与参考图快照',()=>{
    assert.ok(container.textContent.includes('视频提示词'));assert.ok(container.textContent.includes('本段总时长 22 秒。'));assert.ok(container.textContent.includes('生成时的参考图'));assert.ok(container.textContent.includes('新名字'))
    assert.ok(container.querySelector('select[aria-label="视频信息版本"]'))
  })
  await change(container.querySelector('select[aria-label="视频信息版本"]'),'v1')
  check('视频信息 UI：切换版本显示生成时的时长、原名、原图与原提示词',()=>{
    assert.ok(container.textContent.includes('时长：15 秒'));assert.ok(container.textContent.includes('本段总时长 15 秒。'))
    assert.ok([...container.querySelectorAll('img')].some(img=>img.alt.includes('苏可')&&img.getAttribute('src')===seed.assets[1].imageUrl))
    assert.ok(!container.textContent.includes('本段总时长 22 秒。'))
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

  await act(async()=>root.unmount());root=undefined
  console.log(`\n${results.length} checks passed.`)
} finally {
  globalThis.setTimeout=realTimeout
  await server.close()
  dom.window.close()
}
