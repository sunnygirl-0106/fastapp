// Offline v16 coverage: real-photo integrity, ratios, UI controls and prompt ownership.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const timeout = globalThis.setTimeout, fetch = globalThis.fetch
let requests = 0
const errors = [], info = [], oldError = console.error, oldInfo = console.info, oldWarn = console.warn
console.error = (...args) => errors.push(args)
console.info = (...args) => info.push(args)
console.warn = () => {}
globalThis.fetch = async () => { requests++; throw Error('Offline check made a network request') }
globalThis.setTimeout = (fn, ms, ...args) => timeout(fn, [900,1200,1600].includes(ms) ? 0 : ms, ...args)
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const root = createRoot(document.getElementById('root'))
const mount = async (path, props) => { const { default: Component } = await server.ssrLoadModule(path); await act(async () => root.render(React.createElement(Component, props))) }
const click = async el => { assert.ok(el, 'control exists'); await act(async () => Simulate.click(el)) }
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const svg = url => new dom.window.DOMParser().parseFromString(decodeURIComponent(url.split(',')[1]), 'image/svg+xml')
try {
  const { useStore, migrateProjects } = await server.ssrLoadModule('/src/store/workflowStore.ts')
  const { refPhotos } = await server.ssrLoadModule('/src/data/refPhotos.ts')
  const { refPlaceholder } = await server.ssrLoadModule('/src/data/refPlaceholders.ts')
  const { buildReferenceImagePrompt, buildVideoPrompt, videoReferenceImages } = await server.ssrLoadModule('/src/services/videoPrompt.ts')
  const { deriveAssetIds } = await server.ssrLoadModule('/src/services/validation.ts')
  const state = () => useStore.getState()
  const seed = structuredClone(state().projects[0])
  assert.equal(seed.name, '两界供应商 · 第一场')
  assert.deepEqual(seed.assets.map(a => a.imageUrl), [refPhotos.landscape, refPhotos.portrait, refPhotos.square])
  const dimensions = [[1600,900],[900,1600],[1200,1200]]
  // Parse JPEG's actual SOF, and reject interrupted downloads even if the header is readable.
  for (const [i,url] of seed.assets.map(a=>a.imageUrl).entries()) {
    const bytes = readFileSync(url.replace(/^\//,''))
    assert.equal(bytes.readUInt16BE(bytes.length-2),0xffd9,'JPEG download must be complete: '+url)
    let found
    for(let offset=2;offset<bytes.length;) {
      assert.equal(bytes[offset++],0xff)
      const marker=bytes[offset++], length=bytes.readUInt16BE(offset)
      if([0xc0,0xc1,0xc2].includes(marker)) { found=[bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];break }
      offset+=length
    }
    assert.deepEqual(found,dimensions[i])
  }
  console.log('PASS 三张真实照片下载完整，实际尺寸 1600×900、900×1600、1200×1200')
  const legacy=structuredClone(seed)
  legacy.assets.forEach((a,i)=>a.imageUrl=`/src/assets/placeholders/frame-${i+1}.jpg`)
  assert.deepEqual(migrateProjects([legacy])[0].assets.map(a=>a.imageUrl),seed.assets.map(a=>a.imageUrl))
  legacy.assets[0].imageUrl='data:image/png;base64,uploaded'
  assert.equal(migrateProjects([legacy])[0].assets[0].imageUrl,'data:image/png;base64,uploaded')
  for(const kind of ['char','scene']) for(const [ratio,w,h] of [['16:9',1600,900],['9:16',900,1600],['1:1',1200,1200],['4:3',1200,900],['3:4',900,1200]]) {
    const doc=svg(refPlaceholder(kind,ratio,'测试<&"名称'))
    assert.equal(doc.querySelector('parsererror'),null)
    assert.equal(doc.documentElement.getAttribute('width'),String(w));assert.equal(doc.documentElement.getAttribute('height'),String(h))
    assert.ok(doc.documentElement.textContent.includes('测试<&"名称'))
    if(ratio==='16:9') assert.ok(doc.documentElement.textContent.includes(kind==='char'?'背面':'4 反向'))
  }
  console.log('PASS 旧占位自动替换、上传保留、五种 SVG 比例及 XML 转义')
  await act(async()=>useStore.setState({projects:[seed],currentId:seed.id,screen:'workflow',step:3}))
  await mount('/src/steps/Step3Assets.tsx',{project:seed})
  assert.equal(document.querySelectorAll('.aspect-video.cursor-pointer').length,3)
  assert.equal(document.querySelectorAll('.bg-contain.bg-no-repeat').length,3)
  for(const asset of seed.assets) {
    await mount('/src/components/Lightbox.tsx',{title:asset.name,url:asset.imageUrl,onClose(){}})
    const image=document.querySelector('img')
    assert.equal(image.getAttribute('src'),asset.imageUrl)
    assert.ok(image.classList.contains('object-contain'));assert.ok(image.className.includes('max-h-[82vh]'))
    await mount('/src/components/MentionText.tsx',{text:'@'+asset.name,assets:seed.assets})
    await act(async()=>Simulate.mouseEnter(document.querySelector('span[tabindex]')))
    assert.ok(document.querySelector('[role="tooltip"] img').classList.contains('object-contain'))
  }
  console.log('PASS 三种比例的参考卡片、大图和 @ 悬停预览完整显示样式')
  const missing=structuredClone(seed);missing.assets.forEach(a=>{a.imgState='none';delete a.imageUrl})
  const calls=[], generate=state().generateAssetImages
  await act(async()=>useStore.setState({projects:[missing],generateAssetImages:async(...args)=>calls.push(args)}))
  await mount('/src/steps/Step3Assets.tsx',{project:missing})
  await click(document.querySelector('.aspect-video.cursor-pointer'))
  assert.ok(button('16:9'))
  await click(button('16:9'));await click(button('9:16'));await click(button('确认生成'))
  assert.deepEqual(calls.at(-1),[[missing.assets[0].id],'9:16'])
  await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('生成全部参考图')))
  assert.ok(button('16:9'))
  await click(button('16:9'));await click(button('1:1'))
  await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('确认生成')))
  assert.equal(calls.at(-1)[1],'1:1');assert.equal(calls.at(-1)[0].length,3)
  await act(async()=>useStore.setState({projects:[seed],generateAssetImages:generate}))
  await act(async()=>generate([seed.assets[2].id]))
  let p=state().projects[0]
  assert.ok(svg(p.assets[2].imageUrl).documentElement.textContent.includes('4 反向'))
  await act(async()=>generate([seed.assets[2].id],'9:16'))
  p=state().projects[0]
  assert.equal(svg(p.assets[2].imageUrl).documentElement.getAttribute('height'),'1600')
  console.log('PASS 单张/批量默认 16:9，所选比例传到 store，木屋重新生成得到横向四宫格或竖图')
  assert.deepEqual(deriveAssetIds({shot:'@木屋@苏逸@木屋',background:'@乌蝉娜迦'},new Map(seed.assets.map(a=>[a.name,a.id]))),[seed.assets[2].id,seed.assets[0].id])
  const inconsistent={...seed,config:{...seed.config,shotStyle:'不应使用'}}
  assert.ok(buildReferenceImagePrompt(seed.assets[0],inconsistent).startsWith('画面风格：'+seed.style+'\n'))
  assert.ok(buildReferenceImagePrompt(seed.assets[2],inconsistent).endsWith('[视觉风格：'+seed.style+']'))
  assert.ok(buildVideoPrompt(seed.shots[0],inconsistent,seed.shots[0].dur).startsWith('风格：'+seed.style))
  const version={tag:'v1',createdAt:1,dur:15,referenceImages:videoReferenceImages(seed.shots[0],seed)}
  await mount('/src/steps/ShotVideoInfoModal.tsx',{project:seed,shot:seed.shots[0],version,onClose(){},onVersionChange(){}})
  assert.equal(document.querySelectorAll('img.aspect-video.object-contain').length,3)
  await mount('/src/steps/Step1Script.tsx',{project:{...seed,segStatus:'none'},locked:false})
  assert.equal([...document.querySelectorAll('button')].filter(b=>b.textContent.startsWith('载入《')).length,1)
  await act(async()=>state().createProject('风格回归'))
  await act(async()=>state().setScript('清晨阿明走进房间。他坐下来，打开窗户。'))
  await act(async()=>state().startSegments('auto',undefined,'水墨'))
  assert.equal(state().projects[0].style,'水墨')
  await act(async()=>state().restartSegments('auto',undefined,''))
  assert.equal(state().projects[0].style,'写实电影风格')
  assert.equal(requests,0);assert.deepEqual(errors,[])
  assert.ok(info.some(([tag,prompt])=>tag==='[参考图提示词]'&&prompt.endsWith('[视觉风格：'+seed.style+']')))
  console.log('PASS 镜头信息三图、单一示例、统一风格、引用来源、零网络与零控制台错误')
  const { validatedText } = await server.ssrLoadModule('/src/services/textModel.ts')
  const { ValidationError } = await server.ssrLoadModule('/src/services/validation.ts')
  let attempts=0
  const request={system:'mock',user:'input',onAttempt:n=>attempts=n}
  assert.equal(await validatedText(request,()=>String(attempts),text=>{if(attempts===1)throw new ValidationError(['retry']);return text}),'2')
  assert.equal(attempts,2)
  attempts=0
  await assert.rejects(validatedText(request,()=>'',()=>{throw new ValidationError(['invalid'])}),ValidationError)
  assert.equal(attempts,2)
  attempts=0
  await assert.rejects(validatedText(request,()=>{throw Error('document error')},x=>x),/document error/)
  assert.equal(attempts,1)
  assert.equal(requests,0)
  console.log('PASS mock 校验失败最多两次，非校验异常不重试，全程无网络')
} finally {
  await act(async()=>root.unmount());await server.close();dom.window.close()
  globalThis.setTimeout=timeout;globalThis.fetch=fetch
  console.error=oldError;console.info=oldInfo;console.warn=oldWarn
}
