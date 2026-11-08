import { beatText, normalizeBeats, writeBeat } from '@/utils/timeline'
// TypeScript port of the companion panel's validation.py.
export type Row = Record<string, any>
export class ValidationError extends Error {
  constructor(public errors: string[], public raw = '') { super(errors.join('；')); this.name = 'ValidationError' }
}
export const cleanScript = (text: string) => text.replace(/\r\n/g, '\n').replace(/\*\*|__/g, '').replace(/\\(?=[^\p{L}\p{N}_\s])/gu, '').replace(/^#{1,6}\s*/gm, '')
const squash = (text: string) => text.replace(/\s+/g, '')
export const comparable = (text: string) => squash(text.replace(/[“”„＂]/g, '"').replace(/[‘’＇]/g, "'"))
export function parseJsonl(raw: string): Row[] {
  const errors: string[] = [], rows: Row[] = []
  let fenced = false
  raw.split(/\r?\n/).forEach((line, i) => {
    line = line.trim()
    if (!line) return
    if (/^```[^`]*$/.test(line)) { fenced = true; return }
    try {
      const row = JSON.parse(line)
      if (!row || typeof row !== 'object' || Array.isArray(row)) errors.push(`第 ${i + 1} 行不是 JSON 对象`)
      else rows.push(row)
    } catch { errors.push(`第 ${i + 1} 行 JSON 解析失败`) }
  })
  if (fenced) console.warn('格式违规：模型输出了代码围栏，已移除后解析。')
  if (!rows.length) errors.push('未解析到任何 JSON 对象')
  if (errors.length) throw new ValidationError(errors, raw)
  return rows
}
export function splitPreface(segments: Row[], script: string): string | null {
  const joined = comparable(segments.map(s => typeof s.text === 'string' ? s.text : '').join(''))
  if (!joined || !comparable(script).endsWith(joined)) return null
  let count = 0, position = script.length
  while (position > 0 && count < joined.length) { position--; if (!/\s/.test(script[position])) count++ }
  return script.slice(0, position)
}
export function restoreTexts(segments: Row[], script: string, preface: string): number[] {
  let position = preface.length
  const changed: number[] = []
  segments.forEach((seg, index) => {
    const need = comparable(seg.text).length, start = position
    if (index === segments.length - 1) position = script.length
    else {
      let count = 0
      while (position < script.length && count < need) { if (!/\s/.test(script[position])) count++; position++ }
      while (position < script.length && /\s/.test(script[position])) position++
    }
    const original = script.slice(start, position)
    if (squash(original) !== squash(seg.text)) changed.push(seg.ordinal)
    seg.text = original
  })
  return changed
}
// Python round uses ties-to-even, including for half-second boundaries.
export const roundEven = (n: number) => n % 1 === 0.5 ? (Math.floor(n) % 2 ? Math.ceil(n) : Math.floor(n)) : Math.round(n)
export function fixTotal(durations: number[], target: number): number[] {
  if (!Number.isInteger(target) || target < durations.length * 4 || target > durations.length * 30 || !durations.length) throw new ValidationError(['段落数量无法凑成目标时长（每段 4–30 秒）'])
  const total = durations.reduce((a, b) => a + b, 0)
  const five = target >= 5 * durations.length
  const base = five ? target - target % 5 : target
  const unit = five ? 5 : 1, min = five ? 5 : 4
  const result = durations.map(d => Math.min(30, Math.max(min, roundEven(d * base / total / unit) * unit)))
  let diff = base - result.reduce((a, b) => a + b, 0)
  while (diff) {
    const step = diff > 0 ? unit : -unit
    const eligible = result.map((_, i) => i).filter(i => result[i] + step >= min && result[i] + step <= 30)
    const under15 = step > 0 ? eligible.filter(i => result[i] < 15) : []
    const i = (under15.length ? under15 : eligible).sort((a, b) => result[b] - result[a])[0]
    result[i] += step; diff -= step
  }
  if (five && target % 5) {
    const remainder = target % 5
    const i = result.map((_, i) => i).filter(i => result[i] + remainder <= 30).sort((a, b) => result[b] - result[a])[0]
    result[i] += remainder
  }
  return result
}
function textFields(row: Row, fields: string[], label: string, errors: string[], allowEmpty: string[] = []) {
  for (const f of fields) if (typeof row[f] !== 'string' || (!allowEmpty.includes(f) && !row[f].trim())) errors.push(`${label}：${f} 必须是${allowEmpty.includes(f) ? '' : '非空'}字符串`)
}
function finish(errors: string[], notes: string[]) {
  notes.forEach(n => console.warn(`[JSONL] ${n}`))
  if (errors.length) throw new ValidationError(errors)
}
export function validateSegments(rows: Row[], script: string, mode: string, target?: number) {
  const errors: string[] = [], notes: string[] = []
  if (rows[0]?.type !== 'meta') errors.push('首行必须为 meta')
  if (rows.filter(r => r.type === 'meta').length !== 1) errors.push('必须且只能有一个 meta')
  const segments = rows.filter(r => r.type === 'segment')
  if (!segments.length) errors.push('至少需要一个 segment')
  if (rows.slice(1).some(r => r.type !== 'segment')) errors.push('meta 之后只能输出 segment')
  segments.forEach((s, i) => {
    if (!Number.isInteger(s.ordinal) || s.ordinal !== i + 1) errors.push(`段落 ${i + 1}：ordinal 必须从 1 连续递增`)
    if (!Number.isInteger(s.duration_seconds) || s.duration_seconds < 4 || s.duration_seconds > 30) errors.push(`段落 ${i + 1}：时长必须为 4–30 的整数`)
    textFields(s, ['title', 'text'], `段落 ${i + 1}`, errors)
  })
  textFields(rows[0] ?? {}, ['style'], 'meta', errors)
  const preface = splitPreface(segments, cleanScript(script))
  if (segments.length && preface === null) errors.push('段落原文拼接后不是剧本的结尾部分（已忽略空白），存在改写、遗漏或重复')
  finish(errors, notes)
  let total = segments.reduce((sum, s) => sum + s.duration_seconds, 0)
  if (mode === 'manual' && total !== target) {
    const fixed = fixTotal(segments.map(s => s.duration_seconds), target!)
    segments.forEach((s, i) => { s.duration_seconds = fixed[i] })
    notes.push(`模型合计 ${total} 秒，已修正为目标 ${target} 秒`); total = target!
  }
  const long = segments.filter(s => s.duration_seconds > 15).map(s => s.ordinal)
  if (long.length) notes.push('以下段落超过 15 秒：' + long.join('、'))
  const odd = segments.filter(s => s.duration_seconds % 5).map(s => s.ordinal)
  if (odd.length > (mode === 'manual' && target! % 5 ? 1 : 0)) notes.push('以下段落时长不是 5 的倍数：' + odd.join('、'))
  const changed = restoreTexts(segments, cleanScript(script), preface ?? '')
  if (changed.length) notes.push('模型改动了以下段落的引号，已按剧本原文恢复：' + changed.join('、'))
  finish([], notes)
  return preface ?? ''
}
export function validateAssets(rows: Row[]) {
  const errors: string[] = [], notes: string[] = [], names = new Set()
  let sceneSeen = false
  rows.forEach((r, i) => {
    const label = `资产 ${i + 1}`
    if (r.type !== 'asset') errors.push(`${label}：type 必须为 asset`)
    if (!['character', 'scene'].includes(r.kind)) errors.push(`${label}：kind 必须为 character / scene`)
    if (r.kind === 'scene') sceneSeen = true
    else if (r.kind === 'character' && sceneSeen) errors.push(`${label}：角色必须全部在场景之前`)
    textFields(r, ['name', 'prompt'], label, errors)
    for (const [value, seen, field] of [[r.name, names, '名称']] as const) {
      if (typeof value === 'string') { if (seen.has(value)) errors.push(`${label}：${field} 重复`); seen.add(value) }
    }
    if (typeof r.name === 'string' && /[\s()（）@「」]/.test(r.name)) notes.push(`${label}：名称含特殊字符，镜头中的 @引用可能出错`)
    if (/[A-Za-z]{4,}/.test(r.prompt || '')) notes.push(`${label}：prompt 中出现英文，文档要求只用中文`)
  })
  for (const [kind, limit] of [['character', 20], ['scene', 15]] as const) if (rows.filter(r => r.kind === kind).length > limit) errors.push(`${kind} 数量超过 ${limit}`)
  finish(errors, notes)
}
export const SHOT_TEXT_FIELDS = ['shot', 'action', 'anchor', 'motion', 'blocking', 'subject', 'continuity', 'forbid', 'background'] as const
export function mentions(text: string, names: string[]) {
  const found: string[] = [], unknown: string[] = [], ordered = [...names].sort((a, b) => b.length - a.length)
  for (const m of text.matchAll(/@/g)) {
    const rest = text.slice(m.index! + 1), name = ordered.find(n => rest.startsWith(n))
    if (name) found.push(name); else unknown.push('@' + rest.slice(0, 6))
  }
  return { found, unknown }
}
// Kept in parity with validation.py; editorial advice never rejects a model response.
export const LENGTH_RANGES: Record<string, [number, number]> = {
  shot: [150, 220], beat: [15, 40], action: [15, 30], anchor: [25, 50], motion: [20, 50],
  blocking: [30, 70], subject: [0, 10], continuity: [30, 70], forbid: [30, 70], background: [30, 70],
}
const FIELD_NAMES: Record<string, string> = { shot: '画面描述', action: '主要动作', anchor: '场景位置', motion: '动作说明', blocking: '走位说明', subject: '画面主角', continuity: '连贯要求', forbid: '保持不变', background: '背景范围' }
export const BANNED_WORDS = ['像', '仿佛', '宛如', '如同', '一般', '意识到', '心想', '感到', '疑惑', '慌乱', '不好意思', '紧张', '期待', '震惊', '不可置信', '暴雨如注', '宁静', '静谧', '温馨', '浓重', '氛围', '微微', '轻轻', '缓缓', '迅速', '瞬间', '猛地', '一点点', '随着', '接着', '然后', '此时', '与此同时', '紧接着']
const BANNED_PATTERN = new RegExp(BANNED_WORDS.map(w => w === '像' ? '(?<![影图画雕肖录头好])像' : w).join('|'), 'gu')
const QUOTED_TEXT = /“([^”\n]+)”|"([^"\n]+)"|「([^」\n]+)」|『([^』\n]+)』/g
export const visibleLength = (text: string) => [...squash(text.replace(QUOTED_TEXT, ''))].length
export function styleNotes(row: Row, label: string): string[] {
  const notes: string[] = []
  const items = SHOT_TEXT_FIELDS.map(f => [FIELD_NAMES[f], f, row[f]])
  if (Array.isArray(row.timeline)) row.timeline.forEach((b: unknown, i: number) => items.push([`第 ${i + 1} 拍`, 'beat', b]))
  for (const [name, key, text] of items) {
    if (typeof text !== 'string') continue
    let [low, high] = LENGTH_RANGES[key]
    if (key === 'motion' && text.trim().replace(/。+$/, '') === '无位移') low = 0
    const size = visibleLength(key === 'beat' ? beatText(text) : text)
    if (size < low || size > high) notes.push(`${label} ${name}：${size} 字，建议 ${low}–${high} 字`)
    const words = [...new Set(text.replace(QUOTED_TEXT, '').match(BANNED_PATTERN) ?? [])].sort()
    if (words.length) notes.push(`${label} ${name}：出现禁用词 ${words.join('、')}`)
  }
  return notes
}
export function deriveAssetIds(row: Row, idByName: Map<string, string>): string[] {
  const texts = [row.shot ?? '']
  return [...new Set(texts.filter(t => typeof t === 'string').flatMap(t => mentions(t, [...idByName.keys()]).found.map(n => idByName.get(n)!)))]
}
export const BEAT_RANGES = [[6, 2, 2], [10, 2, 3], [30, 3, 4]] as const
export const MAX_BEATS = 4
export function validateShots(rows: Row[], segments: Row[], assets: Row[], targets: number[]) {
  const errors: string[] = [], notes: string[] = [], actual = new Map<number, number>()
  const idByName = new Map(assets.map(a => [a.name, a.asset_id]))
  rows.forEach((r, i) => {
    let label = `镜头 ${i + 1}`
    if (r.type !== 'shot') errors.push(`${label}：type 必须为 shot`)
    const seg = Number.isInteger(r.segment_ordinal) ? segments.find(s => s.ordinal === r.segment_ordinal) : undefined
    if (!seg || !targets.includes(r.segment_ordinal)) errors.push(`${label}：segment_ordinal 不存在或不在本次范围内`)
    else { actual.set(r.segment_ordinal, (actual.get(r.segment_ordinal) ?? 0) + 1); label = `镜头（段 ${r.segment_ordinal}）` }
    textFields(r, [...SHOT_TEXT_FIELDS], label, errors)
    notes.push(...styleNotes(r, label))
    if (!Array.isArray(r.timeline) || r.timeline.length < 2 || r.timeline.length > MAX_BEATS) errors.push(`${label}：timeline 必须有 2–${MAX_BEATS} 拍`)
    else if (seg) {
      const [, low, high] = BEAT_RANGES.find(([limit]) => seg.duration_seconds <= limit) ?? BEAT_RANGES[BEAT_RANGES.length - 1]
      if (r.timeline.length < low || r.timeline.length > high) notes.push(`${label}：${seg.duration_seconds} 秒建议 ${low}–${high} 拍，实际 ${r.timeline.length} 拍`)
    }
    if (Array.isArray(r.timeline)) r.timeline.forEach((beat: unknown, j: number) => {
      if (typeof beat !== 'string' || !beat.trim()) errors.push(`${label} 第 ${j + 1} 拍：必须为非空字符串`)
    })
    if (seg && Array.isArray(r.timeline) && r.timeline.every((b: unknown) => typeof b === 'string' && b.trim())) {
      const fixed = normalizeBeats(r.timeline, seg.duration_seconds).map(writeBeat)
      if (JSON.stringify(fixed) !== JSON.stringify(r.timeline)) notes.push(`${label}：时间安排时间段已修正为连续整数秒，与本段时长一致`)
      r.timeline = fixed
    }
    if (SHOT_TEXT_FIELDS.some(f => typeof r[f] !== 'string') || !Array.isArray(r.timeline)) return
    const inShot = mentions(r.shot, [...idByName.keys()])
    const others = [...SHOT_TEXT_FIELDS.slice(1).map(f => r[f]), ...r.timeline.filter((b: unknown) => typeof b === 'string')].map(t => mentions(t, [...idByName.keys()]))
    const unknown = [...new Set([...inShot.unknown, ...others.flatMap(m => m.unknown)])]
    if (unknown.length) errors.push(`${label}：存在资产列表中没有的 @引用：${unknown.join('、')}`)
    const derived = [...new Set(inShot.found.map(n => idByName.get(n)))]
    if (!derived.length) { errors.push(`${label}：画面描述中没有任何 @名称`); return }
    if (!assets.some(a => derived.includes(a.asset_id) && a.kind === 'scene')) errors.push(`${label}：画面描述中没有 @场景`)
    const missing = [...new Set(others.flatMap(m => m.found).filter(n => !derived.includes(idByName.get(n))))].sort()
    if (missing.length) errors.push(`${label}：其他字段引用了画面描述中没有出现的资产：${missing.join('、')}`)
  })
  for (const n of [...targets].sort((a,b) => a-b)) if (actual.get(n) !== 1) errors.push(`段号 ${n} 应恰好有一个 shot，实际 ${actual.get(n) ?? 0} 个`)
  finish(errors, notes)
}
