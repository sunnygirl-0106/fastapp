import type { Project } from '@/types'

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
    .filter((s) => s.video.state === 'done' && s.video.versions[0]?.url)
    .sort((a, b) => a.no - b.no)
  if (doneShots.length) return doneShots[0].video.versions[0].url

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
export const fmtDur = (d: string) => d.replace(/s$/i, ' 秒') // '15s' → '15 秒'
