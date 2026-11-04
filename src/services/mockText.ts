import type { Project, Segment, Shot } from '@/types'
import { sampleAssets, sampleSegments, sampleShots } from '@/data/mock'
import { buildBeats, allocateSegmentDurations, splitSegmentText } from '@/utils/project'
import { DUR_DEFAULT } from '@/data/duration'
import { uid } from './generation'
import { encodeAssets, encodeSegments, encodeShot, jsonl, formatTimeline, timelineLines } from './parse'
import { _SEGMENT_JSONL_SYSTEM_PROMPT, _ASSET_JSONL_SYSTEM_PROMPT, _SHOT_JSONL_SYSTEM_PROMPT, buildSegmentUserMessage, buildAssetUserMessage, buildShotUserMessage } from './prompts'

// 请求保留与未来文本服务相同的 system/user 输入，响应严格使用 JSONL。
// 演示仍使用原有样本内容和时长算法，不调用真实模型。
export function mockSegments(project: Project) {
  const request = { system: _SEGMENT_JSONL_SYSTEM_PROMPT, user: buildSegmentUserMessage(project) }
  const p = { ...project, segments: [] as Segment[] }
  const samples = sampleSegments()
  const target = p.config.targetDur ?? 60
  const n = p.config.durMode === 'manual' ? Math.max(Math.ceil(target / 30), Math.min(3, Math.floor(target / 4))) : 3
  if (n === 3) p.segments = samples.map(({ dur: _dur, ...s }) => s)
  else if (n < 3) p.segments = samples.slice(0, n).map((seg, i) => ({
    ...seg, dur: undefined, text: i === n - 1 ? samples.slice(i).map((s) => s.text).join('') : seg.text,
  }))
  else p.segments = splitSegmentText(samples.map((s) => s.text).join(''), n).map((text, i) => ({
    id: uid('seg'), no: i + 1, title: `${text.slice(0, 10)}…`, text,
  }))
  const durations = allocateSegmentDurations(p, p.segments)
  p.segments.forEach((seg) => { seg.dur = durations.get(seg.id)! })
  return { request, text: encodeSegments(p.segments, p.config.durMode ?? 'auto', p.config.targetDur ?? 60) }
}

export function mockAssets(p: Project) {
  const request = { system: _ASSET_JSONL_SYSTEM_PROMPT, user: buildAssetUserMessage(p.segments) }
  const assets = sampleAssets().map((a) => ({ ...a, belongSegs: p.segments.filter((seg) => a.kind === 'scene' || seg.text.includes(a.name)).map((seg) => seg.no) }))
  return { request, text: encodeAssets(assets) }
}

export function mockShots(p: Project, ordinals: number[]) {
  const existing = p.shots.filter((s) => ordinals.includes(p.segments.find((seg) => seg.id === s.segId)?.no ?? -1))
  const request = { system: _SHOT_JSONL_SYSTEM_PROMPT, user: buildShotUserMessage(p, ordinals, existing) }
  const designs = p.segments.filter((s) => ordinals.includes(s.no)).map((seg) => designShot(p, seg, existing.find((s) => s.segId === seg.id)))
  return { request, text: jsonl(designs.map((s) => encodeShot(s, p.segments.find((seg) => seg.id === s.segId)!.no))) }
}

function designShot(p: Project, seg: Segment, old?: Shot): Shot {
  const sample = sampleShots().find((s) => s.segId === seg.id)
  const originalText = sampleSegments().find((s) => s.id === seg.id)?.text
  const base = old ?? (originalText === seg.text ? sample : undefined)
  const dur = seg.dur ?? DUR_DEFAULT
  const refs = p.assets.filter((a) => seg.text.includes(a.name) || (a.kind === 'scene' && a.belongSegs?.includes(seg.no)))
  const scene = refs.find((a) => a.kind === 'scene')
  const beats = seg.text.split(/(?<=[。！？])/).filter(Boolean)
  const shot: Shot = {
    assetIds: [...new Set([...(old?.assetIds ?? []).filter((id) => p.assets.some((a) => a.id === id)), ...refs.map((a) => a.id)])],
    id: old?.id ?? uid('shot'), segId: seg.id, no: seg.no, dur,
    shot: base?.shot ?? seg.text,
    timeline: base && !/\d+\s*[–—-]\s*\d+\s*秒/.test(base.timeline) && timelineLines(base.timeline).length <= 6
      ? formatTimeline(timelineLines(base.timeline)) : buildBeats(base?.timeline.split('\n') ?? beats),
    action: base?.action ?? seg.text,
    anchor: base?.anchor ?? scene?.name ?? '当前段落场景',
    motion: base?.motion ?? seg.text,
    blocking: base?.blocking ?? '根据段落动作安排人物位置',
    continuity: base?.continuity ?? '保持人物外观与场景结构一致',
    subject: base?.subject ?? (refs.filter((a) => a.kind === 'char').map((a) => a.name).join('、') || seg.title),
    forbid: base?.forbid ?? '不添加段落以外的人物与事件',
    background: base?.background ?? (refs.map((a) => `${a.name}：${a.desc}；${a.prompt}`).join('；') || '按段落原文呈现场景'),
    done: true, outdated: [], video: old?.video ?? { state: 'none', versions: [] },
  }
  return shot
}
