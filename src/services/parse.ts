import type { Asset, Project, Segment, Shot } from '@/types'
import { uid } from './generation'

// 模型字段与前端字段的转换集中在这里；mock 也通过同一协议输出。
export const jsonl = (rows: object[]): string => rows.map((row) => JSON.stringify(row)).join('\n')
const warn = (message: string) => console.warn(`[JSONL] ${message}`)
function rows(text: string): Record<string, unknown>[] {
  return text.split(/\r?\n/).flatMap((line, i) => {
    if (!line.trim()) return []
    try {
      const value: unknown = JSON.parse(line)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('必须是 JSON 对象')
      return [value as Record<string, unknown>]
    } catch { warn(`第 ${i + 1} 行不是有效的 JSON 对象`); return [] }
  })
}
const string = (value: unknown): string => typeof value === 'string' ? value : ''
const validDuration = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 4 && value <= 30
export const timelineLines = (timeline: string): string[] => timeline.split('\n').map((line) => line.replace(/^\s*[①-⑩]\s*/, '').trim()).filter(Boolean)
export const formatTimeline = (lines: string[]): string => lines.map((line, i) => `${String.fromCodePoint(0x2460 + i)} ${line}`).join('\n')

export function encodeSegments(segments: Segment[], mode: 'auto' | 'manual', target?: number): string {
  return jsonl([
    { type: 'meta', duration_mode: mode, total_seconds: mode === 'manual' ? target : segments.reduce((sum, s) => sum + (s.dur ?? 0), 0) },
    ...segments.map((s) => ({ type: 'segment', ordinal: s.no, title: s.title, text: s.text, duration_seconds: s.dur })),
  ])
}

export function parseSegments(text: string, mode: 'auto' | 'manual', target?: number): Segment[] {
  const all = rows(text)
  const meta = all[0]
  if (meta?.type !== 'meta' || all.filter((r) => r.type === 'meta').length !== 1) warn('输出必须以唯一的 meta 开头')
  if (meta?.duration_mode !== mode) warn('meta.duration_mode 与请求不一致')
  const segments = all.filter((r) => r.type === 'segment').map((r, i) => {
    if (r.ordinal !== i + 1) warn('segment 段号必须从 1 开始连续递增')
    if (!validDuration(r.duration_seconds)) warn(`段落 ${r.ordinal} 时长必须是 4–30 秒的整数`)
    return { id: `s${r.ordinal}`, no: Number(r.ordinal), title: string(r.title), text: string(r.text), dur: Number(r.duration_seconds) }
  })
  if (!segments.length) warn('至少需要一个 segment')
  if (all.slice(1).some((r) => r.type !== 'segment')) warn('meta 后只能输出 segment')
  const total = segments.reduce((sum, s) => sum + s.dur, 0)
  if (meta?.total_seconds !== total) warn('meta.total_seconds 与段落时长合计不一致')
  if (mode === 'manual' && (total !== target || meta?.total_seconds !== target)) warn('manual 模式段落时长合计和 total_seconds 必须等于目标时长')
  return segments
}

export function encodeAssets(assets: Asset[]): string {
  return jsonl(assets.map((a) => ({ type: 'asset', client_key: a.id, kind: a.kind === 'char' ? 'character' : 'scene', name: a.name, alias: a.alias ?? '', importance: a.importance, description: a.desc, prompt: a.prompt, segment_ordinals: a.belongSegs ?? [] })))
}

export function parseAssets(text: string): Asset[] {
  const keys = new Set<string>()
  return rows(text).flatMap((r) => {
    if (r.type !== 'asset' || !['character', 'scene'].includes(string(r.kind))) { warn('资产响应只能包含 character/scene 类型的 asset'); return [] }
    const id = string(r.client_key)
    if (!id || keys.has(id)) { warn('asset.client_key 必须非空且唯一'); return [] }
    keys.add(id)
    if (!['major', 'minor'].includes(string(r.importance))) warn(`资产 ${id} 的 importance 无效`)
    return [{ id, kind: r.kind === 'character' ? 'char' : 'scene', name: string(r.name), alias: string(r.alias), importance: r.importance === 'major' ? 'major' : 'minor', desc: string(r.description), prompt: string(r.prompt), belongSegs: Array.isArray(r.segment_ordinals) ? r.segment_ordinals.filter((n): n is number => Number.isInteger(n) && n > 0) : [], imgState: 'none' } satisfies Asset]
  })
}

export function encodeShot(s: Shot, ordinal: number) {
  return { type: 'shot', segment_ordinal: ordinal, shot: s.shot, timeline: timelineLines(s.timeline), action: s.action, anchor: s.anchor, motion: s.motion, blocking: s.blocking, subject: s.subject, continuity: s.continuity, forbid: s.forbid, background: s.background, asset_ids: s.assetIds ?? [] }
}

export function parseShots(text: string, project: Project, ordinals: number[]): Shot[] {
  const seen = new Set<number>()
  const result = rows(text).flatMap((r) => {
    const no = Number(r.segment_ordinal)
    if (r.type !== 'shot' || !ordinals.includes(no) || seen.has(no)) { warn(`shot 段号 ${r.segment_ordinal} 与请求不一致或重复`); return [] }
    const seg = project.segments.find((s) => s.no === no)
    if (!seg) { warn(`shot 段号 ${no} 不存在`); return [] }
    seen.add(no)
    const old = project.shots.find((s) => s.segId === seg.id)
    const ids = Array.isArray(r.asset_ids) ? r.asset_ids : []
    if (!Array.isArray(r.asset_ids) || ids.some((id) => !project.assets.some((a) => a.id === id))) warn(`shot ${no} 的 asset_ids 包含不存在的资产或格式错误`)
    if (new Set(ids).size !== ids.length) warn(`shot ${no} 的 asset_ids 不能重复`)
    if (!Array.isArray(r.timeline) || r.timeline.some((v) => typeof v !== 'string')) warn(`shot ${no} 的 timeline 必须是字符串数组`)
    if (!validDuration(seg.dur)) warn(`shot ${no} 的时长必须是 4–30 秒的整数`)
    return [{ id: old?.id ?? uid('shot'), segId: seg.id, no, dur: seg.dur ?? 15,
      shot: string(r.shot), timeline: formatTimeline(Array.isArray(r.timeline) ? r.timeline.map(string) : []),
      action: string(r.action), anchor: string(r.anchor), motion: string(r.motion), blocking: string(r.blocking), subject: string(r.subject), continuity: string(r.continuity), forbid: string(r.forbid), background: string(r.background),
      assetIds: [...new Set(ids.filter((id): id is string => typeof id === 'string' && project.assets.some((a) => a.id === id)))],
      done: true, outdated: [], video: old?.video ?? { state: 'none', versions: [] },
    } satisfies Shot]
  })
  if (ordinals.some((no) => !seen.has(no))) warn('shot 响应遗漏了请求的段号')
  return result
}
