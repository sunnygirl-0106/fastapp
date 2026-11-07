import { normalizeTimeline, beatText } from '@/utils/timeline'
import { cleanScript, mentions, fixTotal } from './validation'
import type { Project, Segment, Shot } from '@/types'
import { SAMPLE_SCRIPT, sampleAssets, sampleSegments, sampleShots } from '@/data/mock'
import { findDemoFixture, sameScript } from '@/data/demoFixtures'
import { allocateSegmentDurations, splitSegmentText } from '@/utils/project'
import { DUR_DEFAULT } from '@/data/duration'
import { uid } from './generation'
import { encodeAssets, encodeSegments, encodeShot, jsonl, formatTimeline, timelineLines } from './parse'
import { _SEGMENT_JSONL_SYSTEM_PROMPT, _ASSET_JSONL_SYSTEM_PROMPT, _SHOT_JSONL_SYSTEM_PROMPT, buildSegmentUserMessage, buildAssetUserMessage, buildShotUserMessage } from './prompts'

// 请求保留与未来文本服务相同的 system/user 输入，响应严格使用 JSONL。
// 匹配内置剧本时重放真实模型结果，其余输入只做基础分段，不调用真实模型。
export function mockSegments(project: Project) {
  const request = { system: _SEGMENT_JSONL_SYSTEM_PROMPT, user: buildSegmentUserMessage(project) }
  const p = { ...project, segments: [] as Segment[] }
  const samples = sampleSegments()
  const target = p.config.targetDur ?? 60
  const fixture = findDemoFixture(project.script)
  if (fixture && (p.config.durMode !== 'manual' || (target >= fixture.segments.length * 4 && target <= fixture.segments.length * 30))) {
    const segments = structuredClone(fixture.segments)
    if (p.config.durMode === 'manual') {
      const durations = fixTotal(segments.map(s => s.dur!), target)
      segments.forEach((s, i) => { s.dur = durations[i] })
    }
    return { request, text: encodeSegments(segments, p.config.durMode ?? 'auto', target) }
  }
  const n = p.config.durMode === 'manual' ? Math.max(Math.ceil(target / 15), Math.min(3, Math.floor(target / 4))) : 3
  const script = cleanScript(project.script)
  // Use contiguous slices of the actual script, so mock obeys the same coverage check.
  const sampleText = samples.map(s => s.text).join('')
  const isOriginal = sameScript(script, SAMPLE_SCRIPT) || sameScript(script, sampleText)
  const originalTexts = sameScript(script, SAMPLE_SCRIPT)
    ? script.split(/(?=动作：\n震动停止。|动作：\n苏可整个人原地弹起)/)
    : samples.map(s => s.text)
  const texts = isOriginal && n === 3 ? originalTexts : splitSegmentText(script, n).filter(t => t.trim())
  p.segments = texts.map((text, i) => ({ id: `s${i + 1}`, no: i + 1, title: isOriginal && n === 3 ? samples[i].title : `剧本段落${i + 1}`, text }))
  const durations = allocateSegmentDurations(p, p.segments)
  const values = p.config.durMode === 'manual' ? p.segments.map(() => target / p.segments.length) : [...durations.values()]
  const fixed = fixTotal(values, p.config.durMode === 'manual' ? target : values.reduce((n, d) => n + Math.max(5, Math.round(d / 5) * 5), 0))
  p.segments.forEach((seg, i) => { seg.dur = fixed[i] })
  return { request, text: encodeSegments(p.segments, p.config.durMode ?? 'auto', p.config.targetDur ?? 60) }
}

export function mockAssets(p: Project) {
  const request = { system: _ASSET_JSONL_SYSTEM_PROMPT, user: buildAssetUserMessage(p.segments, p.scriptPreface, p.config.shotStyle) }
  const fixture = findDemoFixture(p.script)
  const original = sameScript(p.script, SAMPLE_SCRIPT) || sameScript(p.script, sampleSegments().map(s => s.text).join(''))
  const source = fixture?.assets ?? (original ? sampleAssets() : [{ id: 'demo_scene', kind: 'scene' as const, name: '剧本场景', importance: 'major' as const, prompt: '根据当前剧本呈现环境：' + p.segments.map(s => s.text).join('\n'), imgState: 'none' as const }])
  const assets = source.map((a) => ({ ...a, belongSegs: p.segments.filter((seg) => a.kind === 'scene' || seg.text.includes(a.name) || fixture?.segments.some(s => sameScript(s.text, seg.text) && a.belongSegs?.includes(s.no))).map((seg) => seg.no) })).filter(a => a.belongSegs.length)
  return { request, text: encodeAssets(assets) }
}

export function mockShots(p: Project, ordinals: number[]) {
  const existing = p.shots.filter((s) => ordinals.includes(p.segments.find((seg) => seg.id === s.segId)?.no ?? -1))
  const request = { system: _SHOT_JSONL_SYSTEM_PROMPT, user: buildShotUserMessage(p, ordinals, existing) }
  const designs = p.segments.filter((s) => ordinals.includes(s.no)).map((seg) => designShot(p, seg, existing.find((s) => s.segId === seg.id)))
  return { request, text: jsonl(designs.map((s) => encodeShot(s, p.segments.find((seg) => seg.id === s.segId)!.no))) }
}

function designShot(p: Project, seg: Segment, old?: Shot): Shot {
  const fixture = findDemoFixture(p.script)
  const recordedSegment = fixture?.segments.find(s => sameScript(s.text, seg.text))
  const recorded = fixture?.shots.find(s => s.no === recordedSegment?.no && s.assetNames.every(name => p.assets.some(a => a.name === name)))
  const sample = sampleShots().find((s) => s.segId === seg.id)
  const originalText = sampleSegments().find((s) => s.id === seg.id)?.text
  // Edited segment text must never reuse an obsolete recorded design.
  const originalPart = cleanScript(SAMPLE_SCRIPT).split(/(?=动作：\n震动停止。|动作：\n苏可整个人原地弹起)/)[seg.no - 1]
  const base = recorded ?? (originalText === seg.text || (originalPart && sameScript(originalPart, seg.text)) ? sample : undefined)
  const dur = seg.dur ?? DUR_DEFAULT
  const refs = p.assets.filter((a) => recorded ? recorded.assetNames.includes(a.name) : seg.text.includes(a.name) || a.belongSegs?.includes(seg.no))
  if (!refs.some(a => a.kind === 'scene')) { const scene = p.assets.find(a => a.kind === 'scene'); if (scene) refs.push(scene) }
  const scene = refs.find((a) => a.kind === 'scene')
  const shot: Shot = {
    assetIds: refs.map((a) => a.id),
    id: old?.id ?? uid('shot'), segId: seg.id, no: seg.no, dur,
    shot: base?.shot ?? seg.text,
    timeline: normalizeTimeline(formatTimeline((base ? timelineLines(base.timeline).map(beatText) : ['镜头建立人物与场景的位置关系。', '完成本段动作，保持前后衔接。']).reduce<string[]>((beats, beat, i) => { if (i < 4) beats.push(beat); else beats[3] += '；' + beat; return beats }, [])), dur),
    action: base?.action ?? seg.text,
    anchor: base?.anchor ?? scene?.name ?? '当前段落场景',
    motion: base?.motion ?? seg.text,
    blocking: base?.blocking ?? '根据段落动作安排人物位置',
    continuity: base?.continuity ?? '保持人物外观与场景结构一致',
    subject: base?.subject ?? (refs.filter((a) => a.kind === 'char').map((a) => a.name).join('、') || seg.title),
    forbid: base?.forbid ?? '不添加段落以外的人物与事件',
    background: base?.background ?? (refs.map((a) => `${a.name}：${a.prompt}`).join('；') || '按段落原文呈现场景'),
    done: true, outdated: [], video: old?.video ?? { state: 'none', versions: [] },
  }
  const names = p.assets.map(a => a.name).sort((a, b) => b.length - a.length)
  const pattern = new RegExp('(?<!@)(' + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g')
  for (const key of ['shot', 'timeline', 'action', 'anchor', 'motion', 'blocking', 'continuity', 'subject', 'forbid', 'background'] as const) {
    if (names.length) shot[key] = shot[key].replace(pattern, '@$1')
  }
  const missing = refs.filter(a => !mentions(shot.shot, names).found.includes(a.name))
  if (missing.length) shot.shot = missing.map(a => '@' + a.name).join('、') + '。' + shot.shot
  if (timelineLines(shot.timeline).length < 2) shot.timeline = formatTimeline([timelineLines(shot.timeline)[0] || '镜头呈现当前场景。', '动作完成，保持画面连贯。'])
  shot.timeline = normalizeTimeline(shot.timeline, dur)
  return shot
}
