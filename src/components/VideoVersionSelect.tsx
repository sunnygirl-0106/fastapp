import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import type { VideoVersion } from '@/types'
import { videoCost } from '@/services/generation'
import { Popover } from './ui'

const versionName = (tag: string) => `第 ${tag.replace(/^v/, '')} 版`
const generatedAt = (ts: number) => {
  const d = new Date(ts), pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 同一菜单用于卡片、播放和信息查看；是否保存当前版本由调用方决定。
export default function VideoVersionSelect({ versions, value, onChange, badge = false }: {
  versions: VideoVersion[]
  value?: string
  onChange: (tag: string) => void
  badge?: boolean
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (anchor) menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
  }, [anchor])
  if (versions.length < 2) return null
  const close = () => { setAnchor(null); trigger.current?.focus() }
  return <>
    {!badge && <span className="mx-2 text-white/40">/</span>}
    <button ref={trigger} type="button" aria-label={badge ? `共 ${versions.length} 版` : '选择视频版本'} aria-haspopup="menu" aria-expanded={!!anchor}
      className={badge ? 'absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-sm focus-visible:outline-brand' : 'inline-flex items-center gap-1 text-white/50 hover:text-white/80 focus-visible:outline-brand'}
      onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setAnchor(anchor ? null : { top: r.bottom + 6, left: r.left }) }}>
      {badge ? `共 ${versions.length} 版` : <>{versionName(value ?? versions[versions.length - 1].tag)}<ChevronDown size="0.8125rem" /></>}
    </button>
    {anchor && createPortal(<div onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
    }}><Popover anchor={anchor} width={340} variant="menu" onClose={close}>
      <div ref={menu} role="menu" aria-label="视频版本" onKeyDown={e => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
        const i = items.indexOf(document.activeElement as HTMLButtonElement)
        items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }}>
        {[...versions].reverse().map(v => <button key={v.tag} role="menuitemradio" aria-checked={v.tag === value} aria-label={versionName(v.tag)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none"
          onClick={() => { onChange(v.tag); close() }}>
          <span className="min-w-0 flex-1"><span className="text-sm text-white/90">{versionName(v.tag)}</span>
            <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-white/45"><span>{generatedAt(v.createdAt)}</span>{v.model && <span>{v.model}</span>}<span>✦{v.cost ?? videoCost(v.dur)}</span></span>
          </span>
          {v.tag === value && <Check size="1rem" className="shrink-0 text-brand" />}
        </button>)}
      </div>
    </Popover></div>, document.body)}
  </>
}
