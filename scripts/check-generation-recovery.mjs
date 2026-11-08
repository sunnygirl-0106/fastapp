// Isolated storage and offline fetch: never reads browser projects or calls a model.
process.env.PHANTHY_MOCK = '1'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true })
let requests = 0
globalThis.fetch = async () => { requests++; throw new Error('Offline test must not call a model') }
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
let root
try {
  const { useStore: initial } = await server.ssrLoadModule('/src/store/workflowStore.ts')
  const { recoverInterruptedProjects, hasActiveGeneration } = await server.ssrLoadModule('/src/services/generationRecovery.ts')
  const seed = structuredClone(initial.getState().projects[0])
  const interrupted = structuredClone(seed)
  interrupted.shotStatus = 'generating'
  interrupted.shots = []
  interrupted.shotGeneration = { batch: 1, total: 2, attempt: 1, startedAt: 1 }
  const raw = JSON.stringify([interrupted])
  localStorage.setItem('phanthy.projects.v2', raw)
  server.moduleGraph.invalidateAll()
  const { useStore } = await server.ssrLoadModule('/src/store/workflowStore.ts')
  let recovered = useStore.getState().projects[0]
  assert.equal(recovered.shotStatus, 'none')
  assert.deepEqual(recovered.interruptedGeneration, ['镜头设计'])
  assert.equal(recovered.shotGeneration, undefined)
  assert.equal(recovered.script, interrupted.script)
  assert.deepEqual(recovered.assets.map(({belongSegs,...a})=>a), interrupted.assets.map(({belongSegs,...a})=>a))
  assert.deepEqual(recovered.assets.find(a=>a.kind==='scene').belongSegs, [])
  assert.equal(recovered.balance, interrupted.balance)
  assert.equal(JSON.parse(localStorage.getItem('phanthy.projects.v2'))[0].shotStatus, 'none')
  const backup = Object.keys(localStorage).find(k => k.startsWith('phanthy.projects.v2.interrupted-backup.'))
  assert.equal(localStorage.getItem(backup), raw)
  assert.equal(requests, 0)
  console.log('PASS 复现刷新后永久生成中：恢复可操作状态、备份原始项目、不自动请求或扣费')

  const partial = structuredClone(seed)
  partial.segStatus = partial.assetStatus = partial.shotStatus = 'generating'
  partial.assets[0].imgState = 'generating'
  partial.shots[0].video = { state: 'generating', versions: [{ tag: 'v1', url: 'saved-video', dur: 10, createdAt: 1 }] }
  const previousShots = structuredClone(partial.shots)
  assert.ok(hasActiveGeneration(partial))
  assert.equal(recoverInterruptedProjects([partial]), true)
  assert.equal(partial.segStatus, 'done')
  assert.equal(partial.assetStatus, 'done')
  assert.equal(partial.shotStatus, 'done')
  assert.equal(partial.assets[0].imgState, 'done')
  assert.deepEqual(partial.shots[0].video.versions, previousShots[0].video.versions)
  assert.equal(partial.shots[0].shot, previousShots[0].shot)
  assert.equal(partial.shots[0].video.state, 'done')
  assert.equal(hasActiveGeneration(partial), false)
  assert.equal(recoverInterruptedProjects([partial]), false)
  console.log('PASS 部分成功和重新生成中断保留段落、资产、旧镜头及视频版本；重复恢复无副作用')

  const empty = structuredClone(seed)
  empty.segStatus = empty.assetStatus = empty.shotStatus = 'generating'
  empty.segments = []; empty.assets = []; empty.shots = []
  recoverInterruptedProjects([empty])
  assert.deepEqual([empty.segStatus, empty.assetStatus, empty.shotStatus], ['none', 'none', 'none'])
  console.log('PASS 首次生成中断不会误报已完成')

  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { default: App } = await server.ssrLoadModule('/src/App.tsx')
  useStore.setState({ currentId: recovered.id, screen: 'workflow', step: 4 })
  root = createRoot(document.getElementById('root'))
  await React.act(async () => root.render(React.createElement(App)))
  assert.match(document.body.textContent, /页面重载中断/)
  assert.ok(!document.body.textContent.includes('正在生成镜头设计'))
  console.log('PASS 恢复后显示中断提示，移除永久转圈')
  await React.act(async () => useStore.setState({ screen: 'projects', projects: [{ ...recovered, shotStatus: 'generating' }] }))
  const whileBusy = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(whileBusy)
  assert.equal(whileBusy.defaultPrevented, true)
  await React.act(async () => useStore.setState({ projects: [recovered] }))
  const afterFinish = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(afterFinish)
  assert.equal(afterFinish.defaultPrevented, false)
  assert.equal(requests, 0)
  console.log('PASS 生成中拦截意外刷新，结束后移除拦截，全程零模型请求')
} finally {
  if (root) { const { act } = await import('react'); await act(async () => root.unmount()) }
  await server.close(); dom.window.close()
}
