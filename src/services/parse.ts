import type { Asset, Project, Segment, Shot } from '@/types'
import { uid } from './generation'
import { parseJsonl, validateSegments, validateAssets, validateShots, ValidationError } from './validation'
export { ValidationError } from './validation'
export const jsonl = (rows: object[]) => rows.map(row => JSON.stringify(row)).join('\n')
import { BEAT_NUMBER, timelineLines, readBeat } from '@/utils/timeline'
export { BEAT_NUMBER, timelineLines } from '@/utils/timeline'
export const formatTimeline = (lines: string[]) => lines.map((line, i) => readBeat(line) ? line.replace(BEAT_NUMBER, '').trim() : `${i < 20 ? String.fromCodePoint(0x2460 + i) : `${i + 1}.`} ${line.replace(BEAT_NUMBER, '').trim()}`).join('\n')
function validated<T>(raw: string, parse: () => T): T {
  try { return parse() } catch (error) { if (error instanceof ValidationError) error.raw = raw; throw error }
}
export function encodeSegments(segments: Segment[], mode: 'auto' | 'manual', target?: number) {
  return jsonl([{ type: 'meta', duration_mode: mode, total_seconds: mode === 'manual' ? target : segments.reduce((sum, s) => sum + (s.dur ?? 0), 0) }, ...segments.map(s => ({ type: 'segment', ordinal: s.no, title: s.title, text: s.text, duration_seconds: s.dur }))])
}
export function parseSegments(text: string, mode: 'auto' | 'manual', target?: number, script?: string): Segment[] {
  return validated(text, () => {
    const rows = parseJsonl(text)
    validateSegments(rows, script ?? rows.filter(r => r.type === 'segment').map(r => r.text ?? '').join(''), mode, target)
    return rows.slice(1).map(r => ({ id: `s${r.ordinal}`, no: r.ordinal, title: r.title, text: r.text, dur: r.duration_seconds }))
  })
}
export function encodeAssets(assets: Asset[]) {
  return jsonl(assets.map(a => ({ type: 'asset', client_key: a.id, kind: a.kind === 'char' ? 'character' : 'scene', name: a.name, alias: a.alias ?? '', importance: a.importance, prompt: a.prompt, segment_ordinals: a.belongSegs ?? [] })))
}
export function parseAssets(text: string, segments?: Segment[]): Asset[] {
  return validated(text, () => {
    const rows = parseJsonl(text)
    validateAssets(rows, segments?.map(s => s.no) ?? [...new Set<number>(rows.flatMap(r => Array.isArray(r.segment_ordinals) ? r.segment_ordinals : []))])
    return rows.map(r => ({ id: uid(r.kind === 'character' ? 'char' : 'scene'), kind: r.kind === 'character' ? 'char' : 'scene', name: r.name, alias: r.alias, importance: r.importance, prompt: r.prompt, belongSegs: r.segment_ordinals, imgState: 'none' }))
  })
}
export function encodeShot(s: Shot, ordinal: number) {
  return { type: 'shot', segment_ordinal: ordinal, shot: s.shot, timeline: timelineLines(s.timeline), action: s.action, anchor: s.anchor, motion: s.motion, blocking: s.blocking, subject: s.subject, continuity: s.continuity, forbid: s.forbid, background: s.background, asset_ids: s.assetIds ?? [] }
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
        assetIds: r.asset_ids, done: true, outdated: [], video: old?.video ?? { state: 'none', versions: [] } }
    })
  })
}
