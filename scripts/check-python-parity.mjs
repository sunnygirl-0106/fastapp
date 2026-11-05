process.env.PHANTHY_MOCK='1'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// v8 第 1 轮第 1 次尝试：保留完整原始输出作为引号回归样本。
const v8QuoteOutput = "{\"type\":\"meta\",\"duration_mode\":\"manual\",\"total_seconds\":30}\n{\"type\":\"segment\",\"ordinal\":1,\"title\":\"清晨小雨来到旧书店\",\"text\":\"清晨，小雨走进安静的旧书店，把一本蓝色封面的书放在柜台上。\",\"duration_seconds\":8}\n{\"type\":\"segment\",\"ordinal\":2,\"title\":\"小雨询问书能否修好\",\"text\":\"店主林叔抬起头，小雨轻声问：\\\"这本书还能修好吗？\\\"\",\"duration_seconds\":7}\n{\"type\":\"segment\",\"ordinal\":3,\"title\":\"林叔检查书脊并答应\",\"text\":\"林叔翻开松散的书脊，点了点头：\\\"能，明天来取。\\\"\",\"duration_seconds\":8}\n{\"type\":\"segment\",\"ordinal\":4,\"title\":\"小雨道谢后离开书店\",\"text\":\"小雨露出笑容，向林叔道谢后走出书店。\",\"duration_seconds\":7}"

import { spawnSync } from 'node:child_process'
import { createServer } from 'vite'
const result=spawnSync('python3',['-c',String.raw`
import sys,json
sys.path.insert(0,'../测试提示词效果')
from prompts import PromptBook,time_axis,pace_hint,replace_mentions
from validation import fix_total,clean_script,timing_instructions
book=PromptBook()
beats=['抬头。','小雨说：“明天我们一起去看海好吗？”','点头。']
segments=[dict(ordinal=1,title='走进房间',duration_seconds=15,text='小雨走进房间。')]
assets=[dict(asset_id='a',kind='character',name='小雨',alias='',prompt='蓝色衣服。'),dict(asset_id='b',kind='scene',name='房间',alias='',prompt='明亮房间')]
shot=dict(type='shot',segment_ordinal=1,shot='@小雨在@房间',timeline=beats,action='抬头',anchor='@房间窗边',motion='无明显位移',blocking='左侧',subject='@小雨',continuity='站位不变',forbid='禁止新增人物',background='木门',asset_ids=['a','b'])
print(json.dumps(dict(systems=book.systems,users=book.users,templates=book.templates,segments=segments,assets=assets,shot=shot,segmentUser=book.segment_user('正文','manual',15),assetUser=book.asset_user(segments,'人物设定','3D 卡通'),shotUser=book.shot_user(segments,assets,'3D 卡通',existing=[shot],targets=[1]),stitched=book.stitch(segments,assets,[shot],'3D 卡通','9:16 竖屏'),axes=[time_axis(beats,n) for n in [4,15,30]],hints=[pace_hint(n,beats) for n in [4,15,30]],fixed=[fix_total([8,13,21],n) for n in range(12,91)],clean=clean_script('# **人物**\n\\【正文\\】')) ,ensure_ascii=False))
`],{encoding:'utf8'})
assert.equal(result.status,0,result.stderr)
const expected=JSON.parse(result.stdout)
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
let count=0
const check=(name,fn)=>{fn();count++;console.log('PASS Python parity: '+name)}
try {
 const prompts=await server.ssrLoadModule('/src/services/prompts.ts'),video=await server.ssrLoadModule('/src/services/videoPrompt.ts'),validation=await server.ssrLoadModule('/src/services/validation.ts'),parse=await server.ssrLoadModule('/src/services/parse.ts')
 const project={config:{durMode:'manual',targetDur:15,shotStyle:'3D 卡通',ratio:'9:16 竖屏'},script:'正文',segments:expected.segments.map(s=>({id:'s'+s.ordinal,no:s.ordinal,title:s.title,text:s.text,dur:s.duration_seconds})),assets:expected.assets.map(a=>({id:a.asset_id,kind:a.kind==='character'?'char':'scene',name:a.name,alias:a.alias,prompt:a.prompt,imageUrl:'image-'+a.asset_id})),shots:[]}
 const shot={...expected.shot,id:'shot1',segId:'s1',no:1,dur:15,timeline:parse.formatTimeline(expected.shot.timeline),assetIds:['a','b']}
 check('原文系统/用户模板/拼接模板',()=>{const book=prompts.getPromptBook();assert.deepEqual(book.systems,expected.systems);assert.deepEqual(book.users,expected.users);assert.deepEqual(book.templates,expected.templates)})
 check('三次用户消息',()=>{assert.equal(prompts.buildSegmentUserMessage(project),expected.segmentUser);assert.equal(prompts.buildAssetUserMessage(project.segments,'人物设定','3D 卡通'),expected.assetUser)
 // JSON whitespace is semantically irrelevant; the Python JSON encoder adds spaces.
 const normalize=s=>s.split('\n').map(line=>{const i=line.indexOf('{');return i>=0?line.slice(0,i)+JSON.stringify(JSON.parse(line.slice(i))):line}).join('\n')
 assert.equal(normalize(prompts.buildShotUserMessage(project,[1],[shot])),normalize(expected.shotUser))})
 check('模板 A/B/C 成品逐字相等',()=>{assert.deepEqual(project.assets.map(a=>video.buildReferenceImagePrompt(a,project)),expected.stitched.references.map(r=>r.prompt));assert.equal(video.buildVideoPrompt(shot,project,15),expected.stitched.videos[0].prompt)})
 check('时间轴/节奏/时长修正/Markdown 清理',()=>{assert.deepEqual([4,15,30].map(n=>video.timeAxis(expected.shot.timeline,n)),expected.axes);assert.deepEqual([4,15,30].map(n=>video.paceHint(n,expected.shot.timeline)),expected.hints);assert.deepEqual(Array.from({length:79},(_,i)=>validation.fixTotal([8,13,21],i+12)),expected.fixed);assert.equal(validation.cleanScript('# **人物**\n\\【正文\\】'),expected.clean)})
 check('v8 原始输出中文引号恢复',()=>{
   const script=readFileSync('../测试提示词效果/examples/示例剧本.txt','utf8')
   const rows=parse.parseSegments(v8QuoteOutput,'manual',30,script)
   assert.match(rows[1].text,/“这本书还能修好吗？”/);assert.match(rows[2].text,/“能，明天来取。”/)
   assert.equal(validation.comparable(rows.map(s=>s.text).join('')),validation.comparable(script))
 })
 check('资产只有 prompt 且不能为空',()=>{
   const rows=[{type:'asset',client_key:'scene',kind:'scene',importance:'minor',name:'房间',alias:'',prompt:'木门和窗户',segment_ordinals:[1]}]
   assert.doesNotThrow(()=>validation.validateAssets(rows,[1]))
   assert.throws(()=>validation.validateAssets([{...rows[0],prompt:' '}],[1]),validation.ValidationError)
   assert.ok(!('desc' in parse.parseAssets(parse.jsonl(rows),project.segments)[0]))
 })
 check('节拍所有序号去除，超过 20 拍不截断',()=>{
   const raw=['① 甲','1. 乙','1、丙','1）丁','(1) 戊','（1）己','⑳ 庚','21. 辛','  ']
   assert.deepEqual(parse.timelineLines(raw.join('\n')),['甲','乙','丙','丁','戊','己','庚','辛'])
   const beats=Array.from({length:21},(_,i)=>`第${i+1}拍`)
   const timeline=parse.formatTimeline(beats);assert.ok(timeline.endsWith('21. 第21拍'))
   assert.ok(video.buildVideoPrompt({...shot,timeline},project,30).includes('第21拍'))
   assert.deepEqual(parse.encodeShot({...shot,timeline},1).timeline,beats)
 })
 check('非 5 倍数只警告，不拒绝或修改正确合计',()=>{
   const rows=[{type:'meta',duration_mode:'auto',total_seconds:13},{type:'segment',ordinal:1,title:'正文',text:'正文',duration_seconds:13}]
   const warnings=[],warn=console.warn;console.warn=x=>warnings.push(x)
   try{validation.validateSegments(rows,'正文','auto')}finally{console.warn=warn}
   assert.ok(warnings.some(w=>w.includes('不是 5 的倍数')));assert.equal(rows[1].duration_seconds,13)
 })
 console.log(`${count} Python parity checks passed.`)
} finally {await server.close()}
