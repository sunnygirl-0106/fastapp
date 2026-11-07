// Offline regression: recorded demos must survive the actual five-step workflow.
process.env.PHANTHY_MOCK = '1'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
const dom = new JSDOM('', { url: 'http://localhost' })
Object.assign(globalThis, { window: dom.window, localStorage: dom.window.localStorage, Event: dom.window.Event })
const timeout = globalThis.setTimeout
const fetch = globalThis.fetch
let networkCalls = 0
globalThis.fetch = async () => { networkCalls++; throw Error('Offline demos must not call a model') }
globalThis.setTimeout = (fn, ms, ...args) => timeout(fn, [900, 1200, 1400, 1600].includes(ms) ? 0 : ms, ...args)
const warn = console.warn
console.warn = () => {}
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { demoFixtures, sameScript } = await server.ssrLoadModule('/src/data/demoFixtures.ts')
  const { useStore } = await server.ssrLoadModule('/src/store/workflowStore.ts')
  const mock = await server.ssrLoadModule('/src/services/mockText.ts')
  const parse = await server.ssrLoadModule('/src/services/parse.ts')
  const { cleanScript, comparable } = await server.ssrLoadModule('/src/services/validation.ts')
  const { SAMPLE_SCRIPT } = await server.ssrLoadModule('/src/data/mock.ts')
  const state = () => useStore.getState()
  const project = () => state().projects.find(p => p.id === state().currentId)
  for (const fixture of demoFixtures) {
    state().createProject(fixture.name)
    state().setScript(fixture.script)
    await state().startSegments('auto', undefined, fixture.style)
    assert.equal(project().segStatus, 'done', state().toast)
    assert.equal(project().segments.length, fixture.segments.length)
    assert.deepEqual(project().segments.map(s => s.title), fixture.segments.map(s => s.title))
    assert.ok(sameScript((project().scriptPreface ?? '') + project().segments.map(s => s.text).join(''), fixture.script))
    await state().startAssets()
    assert.equal(project().assetStatus, 'done', state().toast)
    assert.deepEqual(project().assets.map(a => a.name), fixture.assets.map(a => a.name))
    await state().generateAssetImages(project().assets.map(a => a.id))
    await state().startShots(project().segments.map(s => s.no))
    assert.equal(project().shotStatus, 'done', state().toast)
    assert.equal(project().shots.length, fixture.shots.length)
    for (const shot of project().shots) {
      assert.equal(shot.shot.replaceAll('@', ''), fixture.shots.find(s => s.no === shot.no).shot.replaceAll('@', ''))
      assert.ok(shot.assetIds.every(id => project().assets.some(a => a.id === id)))
    }
    await state().startVideos(project().shots.map(s => s.id))
    assert.ok(project().shots.every(s => s.video.versions.length === 1))
    // Manual durations, including targets requiring a different segment count.
    for (const target of [4, 8, 30, 60, 120, 600]) {
      const p = structuredClone(project())
      p.config.durMode = 'manual'; p.config.targetDur = target
      p.segments = parse.parseSegments(mock.mockSegments(p).text, 'manual', target, p.script)
      assert.equal(p.segments.reduce((n,s) => n + s.dur, 0), target)
      p.assets = parse.parseAssets(mock.mockAssets(p).text, p.segments)
      p.shots = []
      assert.equal(parse.parseShots(mock.mockShots(p, p.segments.map(s=>s.no)).text, p, p.segments.map(s=>s.no)).length, p.segments.length)
    }
    // Changed input must not silently replay the old fixture or its character list.
    const other = structuredClone(project())
    other.script = '清晨，阿明来到海边。他拿起贝壳，转身走向码头。'; other.config.durMode = 'auto'; other.shots = []
    other.segments = parse.parseSegments(mock.mockSegments(other).text, 'auto', undefined, other.script)
    assert.equal(comparable(other.segments.map(s=>s.text).join('')), comparable(cleanScript(other.script)))
    other.assets = parse.parseAssets(mock.mockAssets(other).text, other.segments)
    assert.ok(!other.assets.some(a=>fixture.assets.some(original=>original.name===a.name)))
    console.log(`PASS ${fixture.name}: ${fixture.segments.length} 段、${fixture.assets.length} 个资产、完整五步、6 种目标时长`)
  }
  const original = structuredClone(project())
  original.script = SAMPLE_SCRIPT; original.config.durMode = 'auto'
  original.segments = parse.parseSegments(mock.mockSegments(original).text, 'auto', undefined, original.script)
  assert.equal(original.segments.length, 3)
  assert.match(original.segments[1].text, /^动作：\n震动停止/)
  assert.equal(networkCalls, 0)
  console.log('PASS 原有示例按剧情边界拆解；所有模拟均无网络调用')
} finally {
  await server.close(); dom.window.close()
  globalThis.setTimeout = timeout; globalThis.fetch = fetch; console.warn = warn
}
