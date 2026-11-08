import type { Asset, Project, Segment, Shot } from '@/types'
import { uid } from './generation'
import { parseJsonl, validateSegments, validateAssets, validateShots, deriveAssetIds, ValidationError } from './validation'
export { ValidationError } from './validation'
export const jsonl = (rows: object[]) => rows.map(row => JSON.stringify(row)).join('\n')
import { BEAT_NUMBER, timelineLines, readBeat } from '@/utils/timeline'
export { BEAT_NUMBER, timelineLines } from '@/utils/timeline'
export const formatTimeline = (lines: string[]) => lines.map((line, i) => readBeat(line) ? line.replace(BEAT_NUMBER, '').trim() : `${i < 20 ? String.fromCodePoint(0x2460 + i) : `${i + 1}.`} ${line.replace(BEAT_NUMBER, '').trim()}`).join('\n')
function validated<T>(raw: string, parse: () => T): T {
  try { return parse() } catch (error) { if (error instanceof ValidationError) error.raw = raw; throw error }
}
export function encodeSegments(segments: Segment[], style: string) {
  return jsonl([{ type: 'meta', style }, ...segments.map(s => ({ type: 'segment', ordinal: s.no, title: s.title, text: s.text, duration_seconds: s.dur }))])
}
export function parseSegmentResult(text: string, mode: 'auto' | 'manual', target?: number, script?: string) {
  return validated(text, () => {
    const rows = parseJsonl(text)
    validateSegments(rows, script ?? rows.filter(r => r.type === 'segment').map(r => r.text ?? '').join(''), mode, target)
    const segments: Segment[] = rows.slice(1).map(r => ({ id: `s${r.ordinal}`, no: r.ordinal, title: r.title, text: r.text, dur: r.duration_seconds }))
    return { segments, style: rows[0].style as string }
  })
}
export function parseSegments(text: string, mode: 'auto' | 'manual', target?: number, script?: string): Segment[] {
  return parseSegmentResult(text, mode, target, script).segments
}
export function encodeAssets(assets: Asset[]) {
  return jsonl(assets.map(a => ({ type: 'asset', kind: a.kind === 'char' ? 'character' : 'scene', name: a.name, prompt: a.prompt })))
}
export function parseAssets(text: string, segments?: Segment[]): Asset[] {
  return validated(text, () => {
    const rows = parseJsonl(text)
    validateAssets(rows)
    return rows.map(r => ({ id: uid(r.kind === 'character' ? 'char' : 'scene'), kind: r.kind === 'character' ? 'char' : 'scene', name: r.name, prompt: r.prompt, belongSegs: r.kind === 'character' ? (segments ?? []).filter(s => s.text.includes(r.name)).map(s => s.no) : [], imgState: 'none' }))
  })
}
export function encodeShot(s: Shot, ordinal: number) {
  return { type: 'shot', segment_ordinal: ordinal, shot: s.shot, timeline: timelineLines(s.timeline), action: s.action, anchor: s.anchor, motion: s.motion, blocking: s.blocking, subject: s.subject, continuity: s.continuity, forbid: s.forbid, background: s.background }
}
export function parseShots(text: string, project: Project, ordinals: number[]): Shot[] {
  return validated(text, () => {
    const rows = parseJsonl(text)
    validateShots(rows, project.segments.map(s => ({ ordinal: s.no, text: s.text, duration_seconds: s.dur })), project.assets.map(a => ({ asset_id: a.id, name: a.name, kind: a.kind === 'char' ? 'character' : 'scene' })), ordinals)
    return rows.map(r => {
      const seg = project.segments.find(s => s.no === r.segment_ordinal)!
      const old = project.shots.find(s => s.segId === seg.id)
      return { id: old?.id ?? uid('shot'), segId: seg.id, no: seg.no, dur: seg.dur ?? 15,
        shot: r.shot, timeline: formatTimeline(r.timeline), action: r.action, anchor: r.anchor, motion: r.motion, blocking: r.blocking, subject: r.subject, continuity: r.continuity, forbid: r.forbid, background: r.background,
        assetIds: deriveAssetIds(r, new Map(project.assets.map(a => [a.name, a.id]))), done: true, outdated: [], video: old?.video ?? { state: 'none', versions: [] } }
    })
  })
}
