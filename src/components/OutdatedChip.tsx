import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Clapperboard, X } from 'lucide-react'
import type { Shot } from '@/types'
import { useStore } from '@/store/workflowStore'
import { videoCost } from '@/services/generation'
import { no2 } from '@/utils/project'
import { Popover, fmt } from './ui'

export default function OutdatedChip({ shot, onRegenerateVideo }: {
  shot: Shot; onRegenerateVideo?: () => void
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const actionClass = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[0.8125rem] text-white/80 transition-colors enabled:hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-40'
  const close = () => { setAnchor(null); trigger.current?.focus() }
  useEffect(() => {
    if (anchor) closeButton.current?.focus({ preventScroll: true })
  }, [anchor])
  if (!shot.outdated?.length) return null
  return <>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={!!anchor}
      className="ml-1.5 inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md bg-[#f2b544]/10 px-2 py-1 text-xs text-[#f2b544] transition-colors hover:bg-[#f2b544]/15 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#f2b544]/60"
      title={shot.outdated.map(r => `· ${r.text}`).join('\n')} onClick={e => {
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        setAnchor({ top: r.bottom + 8, left: r.left })
      }}><AlertTriangle size="0.8125rem" strokeWidth={1.8} />待更新</button>
    {anchor && createPortal(<Popover anchor={anchor} width={304} variant="menu" onClose={close}>
      <div role="dialog" aria-labelledby={titleId} className="text-left font-normal text-white/90">
        <header className="flex items-center justify-between gap-3 px-3 pt-2">
          <h3 id={titleId} className="text-sm font-medium">镜头 {no2(shot.no)} 待更新</h3>
          <button ref={closeButton} type="button" aria-label="关闭待更新提示" onClick={close}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/50">
            <X size="0.875rem" />
          </button>
        </header>
        <ul className="space-y-1 px-3 pb-3 pt-1 text-xs leading-5 text-white/45">
          {shot.outdated.map(r => <li key={`${r.kind}:${r.key ?? ''}`} className="break-words">{r.text}</li>)}
        </ul>
        <div className="space-y-0.5 border-t border-white/[0.08] pt-1.5">
          {!!shot.video.versions.length && <button type="button" disabled={shot.video.state === 'generating'} className={actionClass} onClick={() => { close(); if (onRegenerateVideo) onRegenerateVideo(); else useStore.getState().goStep(4) }}>
            <Clapperboard size="1rem" strokeWidth={1.7} className="shrink-0 text-white/50" aria-hidden="true" />
            <span className="flex-1">重新生成视频</span>
            <span className="shrink-0 text-xs tabular-nums text-white/40"><span className="text-[#89bda9]" aria-hidden="true">✦</span> {fmt(videoCost(shot.dur))}<span className="sr-only"> 星钻</span></span>
          </button>}
          <button type="button" className={actionClass} onClick={() => { useStore.getState().dismissOutdated(shot.id); close() }}>
            <Check size="1rem" strokeWidth={1.7} className="shrink-0 text-white/50" aria-hidden="true" />
            保留当前视频
          </button>
        </div>
      </div>
    </Popover>, document.body)}
  </>
}
