import type { Project } from '@/types'

export const hasActiveGeneration = (p: Project) =>
  [p.segStatus, p.assetStatus, p.shotStatus].includes('generating') ||
  p.assets.some(a => a.imgState === 'generating') ||
  p.shots.some(s => s.video.state === 'generating')

// Call only when loading persisted data into a new page, never on a live request.
// Promises and timers do not survive a reload; saved "generating" flags do.
export function recoverInterruptedProjects(projects: Project[]) {
  let recovered = false
  for (const p of projects) {
    const interrupted: string[] = []
    if (p.segStatus === 'generating') {
      interrupted.push('剧本拆解')
      p.segStatus = p.segments.length ? 'done' : 'none'
    }
    if (p.assetStatus === 'generating') {
      interrupted.push('角色与场景提取')
      p.assetStatus = p.assets.length ? 'done' : 'none'
    }
    if (p.shotStatus === 'generating') {
      interrupted.push('镜头设计')
      p.shotStatus = p.shots.length ? 'done' : 'none'
    }
    for (const asset of p.assets) {
      if (asset.imgState !== 'generating') continue
      interrupted.push('参考图')
      asset.imgState = asset.imageUrl ? 'done' : 'none'
    }
    for (const shot of p.shots) {
      if (shot.video.state !== 'generating') continue
      interrupted.push('视频')
      shot.video.state = shot.video.versions.length ? 'done' : 'none'
    }
    delete p.shotGeneration
    if (interrupted.length) {
      recovered = true
      p.interruptedGeneration = [...new Set([...(p.interruptedGeneration ?? []), ...interrupted])]
    }
  }
  return recovered
}
