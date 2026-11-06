import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Project, Shot } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, videoCost } from '@/services/generation'
import { no2, shotGenerationBlocked } from '@/utils/project'
import { Popover, fmt } from './ui'

export default function OutdatedChip({ shot, project, onRegenerateVideo }: {
  shot: Shot; project: Project; onRegenerateVideo?: () => void
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const blocked = shotGenerationBlocked(project)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAnchor(null) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  if (!shot.outdated?.length) return null
  return <>
    <button className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300" title={shot.outdated.map(r => `· ${r.text}`).join('\n')} onClick={e => {
      e.stopPropagation()
      const r = e.currentTarget.getBoundingClientRect()
      setAnchor({ top: Math.min(r.bottom + 6, window.innerHeight - 280), left: r.left })
    }}><AlertTriangle size="0.75rem" />待更新</button>
    {anchor && <Popover anchor={anchor} width={360} onClose={() => setAnchor(null)}><div className="space-y-3 p-4 text-left">
      <h3 className="text-sm font-medium">镜头 {no2(shot.no)} 待更新</h3>
      <div className="space-y-1 text-xs text-amber-300">{shot.outdated.map(r => <p key={`${r.kind}:${r.key ?? ''}`}>· {r.text}</p>)}</div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-full border border-white/20 px-3 py-2 text-xs" onClick={() => { useStore.getState().dismissOutdated(shot.id); setAnchor(null) }}>保留</button>
        <button disabled={!!blocked} title={blocked} className="rounded-full bg-brand px-3 py-2 text-xs text-black disabled:opacity-40" onClick={() => { useStore.getState().regenerateShot(shot.id); setAnchor(null) }}>✦{COST.shotGenEach} 重新生成镜头</button>
        {!!shot.video.versions.length && <button disabled={shot.video.state === 'generating'} className="rounded-full bg-brand px-3 py-2 text-xs text-black disabled:opacity-40" onClick={() => { setAnchor(null); if (onRegenerateVideo) onRegenerateVideo(); else useStore.getState().goStep(4) }}>✦{fmt(videoCost(shot.dur))} 重新生成视频</button>}
      </div>
    </div></Popover>}
  </>
}
