import { useState } from 'react'
import type { Shot } from '@/types'
import { useStore } from '@/store/workflowStore'
import { videoCost } from '@/services/generation'
import { no2 } from '@/utils/project'
import { Popover, fmt } from './ui'

export default function VideoStaleChip({ shot, onRegenerate, fromVideoPage = false }: {
  shot: Shot
  onRegenerate: () => void
  fromVideoPage?: boolean
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const dismiss = useStore((s) => s.dismissVideoStale)
  return <>
    <button className="text-amber-300 hover:underline" title={shot.video.staleReason} onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect()
      setAnchor({ top: r.bottom + 6, left: r.left })
    }}>{fromVideoPage ? '· 需重新生成' : '需重新生成'}</button>
    {anchor && <Popover anchor={anchor} width={340} onClose={() => setAnchor(null)}>
      <div className="space-y-3 p-4 text-left text-sm">
        <div className="font-medium text-white">镜头 {no2(shot.no)} 的视频需要重新生成</div>
        <p className="text-xs text-white/60">{shot.video.staleReason}</p>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button className="text-xs text-white/60 hover:text-white" onClick={() => { dismiss(shot.id); setAnchor(null) }}>保留当前视频</button>
          <button className={fromVideoPage ? 'text-xs text-brand' : 'rounded-full bg-brand px-3 py-2 text-xs font-medium text-black'} onClick={() => { setAnchor(null); onRegenerate() }}>
            {fromVideoPage ? '去镜头页重新生成' : `✦${fmt(videoCost(shot.dur))} 重新生成视频`}
          </button>
        </div>
      </div>
    </Popover>}
  </>
}
