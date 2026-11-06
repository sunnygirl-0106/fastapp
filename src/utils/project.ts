import { mentionParts } from './mentions'
import { clampDuration } from '@/data/duration'
import { SHOT_FIELDS, type Asset, type Project, type Segment, type Shot, type ShotVideo, type VideoVersion } from '@/types'

/* ---------- 镜头视频版本 ----------
   一个镜头可以有多个版本（v1/v2/…），旧版本永远保留。
   取当前版本；没有标记时回退到最新生成的那个。 */
export function currentVersion(v: ShotVideo): VideoVersion | undefined {
  return v.versions.find((x) => x.preferred) ?? v.versions[v.versions.length - 1]
}

// 兼容只读 proposal 样本的旧导出。产品代码使用 currentVersion。
export const preferredVersion = currentVersion

export function videoDownloads(shots: Shot[], all = false) {
  return [...shots].sort((a, b) => a.no - b.no).flatMap(shot =>
    (all ? [...shot.video.versions].sort((a, b) => Number(a.tag.slice(1)) - Number(b.tag.slice(1))) : [currentVersion(shot.video)].filter((v): v is VideoVersion => !!v))
      .map(version => ({ filename: `镜头${no2(shot.no)}_${version.tag}.mp4`, url: version.url })))
}
export function videoDownloadToast(files: ReturnType<typeof videoDownloads>) {
  return `已开始下载 ${files.length} 段视频：${files.slice(0, 3).map(f => f.filename).join("、")}${files.length > 3 ? ` 等 ${files.length} 段` : ""}（示意）`
}

/* ---------- 时间格式：今天 / 昨天 / 具体日期 ---------- */
export function formatCreatedAt(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}`

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const today = startOfDay(new Date())
  const day = startOfDay(d)
  const DAY = 86400000

  if (day === today) return `今天 ${time} 创建`
  if (day === today - DAY) return `昨天 ${time} 创建`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${time} 创建`
}

/* ---------- 项目卡片状态派生 ---------- */
export function projectStatus(p: Project): string {
  const shots = p.shots
  const vidStates = shots.map((s) => s.video.state)

  if (shots.length > 0 && vidStates.every((v) => v === 'done')) return '已完成'
  if (vidStates.some((v) => v === 'generating')) return '正在生成视频'
  if (p.shotStatus === 'done') return '待生成视频'
  if (p.shotStatus === 'generating') return '正在生成镜头'
  if (p.assetStatus === 'done') return '待生成镜头'
  if (p.assetStatus === 'generating') return '正在提取角色与场景'
  if (p.segStatus === 'done') return '待提取角色与场景'
  if (p.segStatus === 'generating') return '正在拆解剧本'
  if (p.script.trim().length > 0) return '待拆解剧本'
  return '待添加剧本'
}

/* 状态是否属于「进行中」（用于卡片上加一个呼吸点） */
export function isRunning(p: Project): boolean {
  return (
    p.segStatus === 'generating' ||
    p.assetStatus === 'generating' ||
    p.shotStatus === 'generating' ||
    p.shots.some((s) => s.video.state === 'generating')
  )
}

/* 项目是否已全部完成（卡片状态着色用） */
export function isDone(p: Project): boolean {
  return p.shots.length > 0 && p.shots.every((s) => s.video.state === 'done')
}

/**
 * 项目封面：固定规则自动选取，不随机、不允许用户设置。
 * 只依赖 no 排序与 assets 数组顺序，不依赖 updatedAt，
 * 否则新生成一个镜头就会导致封面跳变。
 */
export function projectCover(p: Project): string | undefined {
  // 1. 镜号最靠前的已完成视频封面
  const doneShots = p.shots
    .filter((s) => s.video.state === 'done' && currentVersion(s.video)?.url)
    .sort((a, b) => a.no - b.no)
  if (doneShots.length) return currentVersion(doneShots[0].video)!.url

  // 2. 第一张已生成的场景参考图
  const scene = p.assets.find((a) => a.kind === 'scene' && a.imgState === 'done' && a.imageUrl)
  if (scene) return scene.imageUrl

  // 3. 主要角色参考图
  const major = p.assets.find(
    (a) => a.kind === 'char' && a.importance === 'major' && a.imgState === 'done' && a.imageUrl,
  )
  if (major) return major.imageUrl

  // 4. 任意角色参考图
  const anyChar = p.assets.find((a) => a.kind === 'char' && a.imgState === 'done' && a.imageUrl)
  if (anyChar) return anyChar.imageUrl

  // 5. 无 → 调用方渲染统一默认占位
  return undefined
}

/* ---------- 展示格式 ---------- */
export const no2 = (n: number) => String(n).padStart(2, '0') // 1 → '01'
export const fmtDur = (d: number | string | undefined) => d === undefined ? '待分配' : `${parseInt(String(d), 10)} 秒`


// Bounded proportional allocation. Find the scale after clamping, then use
// largest remainders so rounding preserves the exact integer total.
export function allocateExact(total: number, weights: number[], min = 4, max = 30): number[] {
  if (!weights.length) return []
  if (!Number.isInteger(total) || total < weights.length * min || total > weights.length * max) {
    throw new RangeError('Target duration is outside the feasible range')
  }
  const positive = weights.map((w) => Math.max(1, w))
  const bounded = (scale: number) => positive.map((w) => Math.min(max, Math.max(min, w * scale)))
  let lo = 0, hi = total
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (bounded(mid).reduce((a, b) => a + b, 0) < total) lo = mid
    else hi = mid
  }
  const exact = bounded(lo)
  const rounded = exact.map((v) => Math.floor(v))
  const order = exact.map((v, i) => ({ i, fraction: v - rounded[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i)
  let remaining = total - rounded.reduce((a, b) => a + b, 0)
  for (const { i } of order) if (remaining && rounded[i] < max) { rounded[i]++; remaining-- }
  return rounded
}

// Preserve source order and punctuation while balancing contiguous chunks.
export function splitSegmentText(text: string, count: number): string[] {
  let chunks = text.split(/(?<=[。！？…])/u).filter(Boolean)
  if (chunks.length < count) chunks = chunks.flatMap((s) => s.split(/(?<=[，；])/u).filter(Boolean))
  while (chunks.length < count) {
    const i = chunks.reduce((best, s, j) => s.length > chunks[best].length ? j : best, 0)
    if (!chunks[i] || chunks[i].length < 2) break
    const mid = Math.ceil(chunks[i].length / 2)
    chunks.splice(i, 1, chunks[i].slice(0, mid), chunks[i].slice(mid))
  }
  const groups: string[] = []
  let start = 0, remaining = text.length
  for (let i = 0; i < count; i++) {
    const left = count - i
    const target = remaining / left
    let end = start + 1, length = chunks[start]?.length ?? 0
    while (end < chunks.length - (left - 1) &&
      Math.abs(length + chunks[end].length - target) <= Math.abs(length - target)) {
      length += chunks[end++].length
    }
    if (left === 1) end = chunks.length
    const group = chunks.slice(start, end).join('')
    groups.push(group); remaining -= group.length; start = end
  }
  return groups
}

// 只分配传入的段落，其他段落已有时长占用预算但保持不变。
export function allocateSegmentDurations(p: Project, segs: Segment[]): Map<string, number> {
  const result = new Map<string, number>()
  if (!segs.length) return result
  if (p.config.durMode === 'manual') {
    const ids = new Set(segs.map((seg) => seg.id))
    const budget = Math.max(0, (p.config.targetDur ?? 60)
      - p.segments.reduce((sum, seg) => sum + (ids.has(seg.id) ? 0 : seg.dur ?? 0), 0))
    // Existing manual edits can leave an infeasible remaining budget during
    // migration; preserve those edits and clamp only the missing allocation.
    const feasible = Math.min(segs.length * 30, Math.max(segs.length * 4, budget))
    const durations = allocateExact(feasible, segs.map((seg) => seg.text.length))
    segs.forEach((seg, i) => result.set(seg.id, durations[i]))
  } else {
    segs.forEach((seg) => result.set(seg.id, Math.min(15, clampDuration(seg.text.length / 6))))
  }
  return result
}

// 镜头设计只受上游改动影响；视频仍展示全部原因。
export const shotOutdatedReasons = (shot?: Shot) => (shot?.outdated ?? []).filter(r => r.kind === 'segText' || r.kind === 'asset')
export const outdatedDesignShots = (p: Project) => p.shots.filter(s => shotOutdatedReasons(s).length)
export const outdatedVideos = (p: Project) => p.shots.filter(s => s.video.versions.length && s.outdated?.length)
export const outdatedShots = (p: Project) => p.shots.filter((s) => s.outdated?.length)
export const ungeneratedSegments = (p: Project) => p.segments.filter((s) => !p.shots.some((shot) => shot.segId === s.id))
export function shotsReferencingAsset(p: Project, a: Asset): Shot[] {
  return p.shots.filter((s) => s.assetIds?.includes(a.id))
}

export function renameOccurrences(p: Project, name: string) {
  const fields = [
    ...p.segments.map((s) => ({ source: `段落 ${no2(s.no)} · 原文`, text: s.text })),
    ...p.shots.flatMap((s) => SHOT_FIELDS.map((f) => ({ source: `镜头 ${no2(s.no)} · ${f.label}`, text: String(s[f.key] ?? '') }))),
  ]
  return fields.flatMap((f) => {
    const hits: { source: string; before: string; after: string }[] = []
    if (!name) return hits
    const plain = mentionParts(f.text, p.assets.map(a => a.name)).filter(part => !part.mention)
    let pos = f.text.indexOf(name)
    while (pos >= 0) {
      if (plain.some(part => pos >= part.start && pos + name.length <= part.start + part.text.length)) hits.push({ source: f.source, before: f.text.slice(Math.max(0, pos - 30), pos), after: f.text.slice(pos + name.length, pos + name.length + 30) })
      pos = f.text.indexOf(name, pos + name.length)
    }
    return hits
  })
}
export function shotGenerationBlocked(p: Project): string | undefined {
  if (p.shotStatus === 'generating') return '正在生成镜头，完成后可操作'
  if (p.assetStatus === 'generating') return '正在生成角色与场景，完成后可操作'
  if (!p.shots.length && (!p.assets.length || p.assets.some(a => a.imgState !== 'done' || !a.imageUrl))) return '请先补齐全部参考图'
}
