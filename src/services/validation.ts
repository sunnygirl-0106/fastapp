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
    for (const i of result.map((_, i) => i).sort((a, b) => result[b] - result[a])) {
      if (diff && result[i] + step >= min && result[i] + step <= 30) { result[i] += step; diff -= step }
    }
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
  if (rows[0]?.duration_mode !== mode) errors.push('meta.duration_mode 与输入不一致')
  const preface = splitPreface(segments, cleanScript(script))
  if (segments.length && preface === null) errors.push('段落原文拼接后不是剧本的结尾部分（已忽略空白），存在改写、遗漏或重复')
  finish(errors, notes)
  let total = segments.reduce((sum, s) => sum + s.duration_seconds, 0)
  if (mode === 'manual' && total !== target) {
    const fixed = fixTotal(segments.map(s => s.duration_seconds), target!)
    segments.forEach((s, i) => { s.duration_seconds = fixed[i] })
    notes.push(`模型合计 ${total} 秒，已修正为目标 ${target} 秒`); total = target!
  }
  if (rows[0].total_seconds !== total) notes.push(`meta.total_seconds 已改为段落合计 ${total}`)
  rows[0].total_seconds = total
  const odd = segments.filter(s => s.duration_seconds % 5).map(s => s.ordinal)
  if (odd.length > (mode === 'manual' && target! % 5 ? 1 : 0)) notes.push('以下段落时长不是 5 的倍数：' + odd.join('、'))
  const changed = restoreTexts(segments, cleanScript(script), preface ?? '')
  if (changed.length) notes.push('模型改动了以下段落的引号，已按剧本原文恢复：' + changed.join('、'))
  finish([], notes)
  return preface ?? ''
}
export function validateAssets(rows: Row[], ordinals: number[]) {
  const errors: string[] = [], notes: string[] = [], keys = new Set(), names = new Set(), covered = new Set<number>()
  let sceneSeen = false
  rows.forEach((r, i) => {
    const label = `资产 ${i + 1}`
    if (r.type !== 'asset') errors.push(`${label}：type 必须为 asset`)
    if (!['character', 'scene'].includes(r.kind)) errors.push(`${label}：kind 必须为 character / scene`)
    if (!['major', 'minor'].includes(r.importance)) errors.push(`${label}：importance 必须为 major / minor`)
    if (r.kind === 'scene') sceneSeen = true
    else if (r.kind === 'character' && sceneSeen) errors.push(`${label}：角色必须全部在场景之前`)
    textFields(r, ['client_key', 'name', 'alias', 'prompt'], label, errors, ['alias'])
    for (const [value, seen, field] of [[r.client_key, keys, 'client_key'], [r.name, names, '名称']] as const) {
      if (typeof value === 'string') { if (seen.has(value)) errors.push(`${label}：${field} 重复`); seen.add(value) }
    }
    if (typeof r.name === 'string' && /[\s()（）@「」]/.test(r.name)) notes.push(`${label}：名称含特殊字符，镜头中的 @引用可能出错`)
    const nums = r.segment_ordinals
    if (!Array.isArray(nums) || !nums.length || nums.some(n => !Number.isInteger(n) || !ordinals.includes(n))) errors.push(`${label}：segment_ordinals 必须为存在的段号组成的非空数组`)
    else if (nums.some((n, j) => j > 0 && n <= nums[j - 1])) errors.push(`${label}：segment_ordinals 必须升序且不重复`)
    else if (r.kind === 'scene') nums.forEach(n => covered.add(n))
    if (/[A-Za-z]{4,}/.test(r.prompt || '')) notes.push(`${label}：prompt 中出现英文，文档要求只用中文`)
  })
  const missing = ordinals.filter(n => !covered.has(n))
  if (missing.length && !errors.length) errors.push('以下段落没有归属任何场景：' + missing.join('、'))
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
const TIME_PATTERN = /(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百半]+)\s*(?:秒|分钟|分半|毫秒|seconds?\b|secs?\b|s\b)|\d+(?:\.\d+)?\s*[-–—~～至到]\s*\d+(?:\.\d+)?|\d+:\d+/i
export function timingInstructions(beat: string, sourceText: string) {
  return beat.replace(/“([^”\n]+)”|"([^"\n]+)"|「([^」\n]+)」|『([^』\n]+)』/g, (match, a, b, c, d, offset) => /(?:[：:]|说|问|喊|道)\s*$/.test(beat.slice(0, offset)) && squash(sourceText).includes(squash(a ?? b ?? c ?? d)) ? '' : match)
}
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
    if (!Array.isArray(r.timeline) || r.timeline.length < 2 || r.timeline.length > 8) errors.push(`${label}：timeline 必须有 2–8 拍`)
    else if (seg) {
      const [, low, high] = [[6,2,2],[10,2,3],[15,3,4],[20,4,5],[30,5,7]].find(([limit]) => seg.duration_seconds <= limit) ?? [30,5,7]
      if (r.timeline.length < low || r.timeline.length > high) notes.push(`${label}：${seg.duration_seconds} 秒建议 ${low}–${high} 拍，实际 ${r.timeline.length} 拍`)
    }
    if (Array.isArray(r.timeline)) r.timeline.forEach((beat: unknown, j: number) => {
      if (typeof beat !== 'string' || !beat.trim()) errors.push(`${label} 第 ${j + 1} 拍：必须为非空字符串`)
      else if (TIME_PATTERN.test(timingInstructions(beat, seg?.text ?? ''))) errors.push(`${label} 第 ${j + 1} 拍：节拍不得包含时长指令或时间槽（原文引用对白除外）`)
    })
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
    if (JSON.stringify(r.asset_ids) !== JSON.stringify(derived)) { notes.push(`${label}：asset_ids 已按画面描述中 @ 的出现顺序修正`); r.asset_ids = derived }
  })
  for (const n of [...targets].sort((a,b) => a-b)) if (actual.get(n) !== 1) errors.push(`段号 ${n} 应恰好有一个 shot，实际 ${actual.get(n) ?? 0} 个`)
  finish(errors, notes)
}
