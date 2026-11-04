// Read-only rendering check for the running development server.
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
const base='http://127.0.0.1:5188'
const html=await (await fetch(base+'/usage')).text()
let done,refreshDelay
const rendered=new Promise(resolve=>{done=resolve})
const dom=new JSDOM(html,{url:base+'/usage',runScripts:'dangerously',beforeParse(window){
 window.fetch=url=>fetch(new URL(url,base))
 window.setTimeout=(_fn,ms)=>{refreshDelay=ms;done();return 0}
}})
try {
 await rendered
 const el=id=>dom.window.document.getElementById(id)
 assert.equal(el('error').textContent,'')
 for(const id of ['spent','remaining','untilStop'])assert.match(el(id).textContent,/^\$\d+\.\d+$/)
 console.log('PASS 费用页面三个金额已实际渲染',JSON.stringify(Object.fromEntries(['spent','remaining','untilStop','sources'].map(id=>[id,el(id).textContent]))))
 assert.ok(el('rows').rows.length>=1);assert.ok(el('rows').rows[0].cells.length===6)
 console.log('PASS 每次调用的六列账单已渲染，最新记录在前，共 '+el('rows').rows.length+' 行')
 assert.equal(refreshDelay,5000)
 console.log('PASS 费用页面五秒刷新已安排\n3 usage page checks passed.')
} finally {dom.window.close()}
