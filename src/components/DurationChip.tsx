import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { clampDuration } from '@/data/duration'
import { Popover } from './ui'

export function DurationStepper({ value, onChange, title = '段落时长', onClamp }: { value: number; onChange: (value: number) => void; title?: string; onClamp?: () => void }) {
  const [draft, setDraft] = useState(String(value))
  const [flash, setFlash] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => setDraft(String(value)), [value])
  useEffect(() => () => clearTimeout(timer.current), [])
  const normalize = (raw: string) => {
    const n = Number(raw)
    const next = clampDuration(raw.trim() ? n : NaN)
    if (!raw.trim() || n !== next) {
      onClamp?.()
      setFlash(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setFlash(false), 600)
    }
    setDraft(String(next))
    onChange(next)
    return next
  }
  return <div className="space-y-2">
    <div className="text-[13px] text-white/70">{title}</div>
    <div className="flex items-center gap-2">
      <button type="button" aria-label="减少时长" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10" onClick={() => normalize(String(Number(draft) - 1))}><Minus size={14} /></button>
      <input aria-label={title} type="number" min={4} max={15} step={1} value={draft}
        onChange={(e) => { setDraft(e.target.value); if (e.target.value && Number(e.target.value) >= 4 && Number(e.target.value) <= 15 && Number.isInteger(Number(e.target.value))) onChange(Number(e.target.value)) }}
        onBlur={() => normalize(draft)} onKeyDown={(e) => { if (e.key === 'Enter') normalize(draft) }}
        className="h-8 w-14 rounded-lg bg-black/40 text-center text-sm outline-none focus:ring-1 focus:ring-brand" />
      <span className="text-xs text-faint">秒</span>
      <button type="button" aria-label="增加时长" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10" onClick={() => normalize(String(Number(draft) + 1))}><Plus size={14} /></button>
    </div>
    <div className={`text-xs ${flash ? 'text-red-400' : 'text-faint'}`}>4–15 秒，整数</div>
  </div>
}

export default function DurationChip({ value, onSave, title, disabled }: { value: number; onSave: (dur: number) => void; title: string; disabled?: boolean }) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const draft = useRef(value)
  const [editing, setEditing] = useState(value)
  const cancel = useRef(false)
  const warningUntil = useRef(0)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  const close = () => {
    clearTimeout(closeTimer.current)
    const save = () => {
      if (!cancel.current && draft.current !== value) onSave(draft.current)
      setAnchor(null)
    }
    const remaining = warningUntil.current - Date.now()
    if (remaining > 0) closeTimer.current = setTimeout(save, remaining)
    else save()
  }
  useEffect(() => {
    if (!anchor) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { clearTimeout(closeTimer.current); cancel.current = true; e.preventDefault(); setAnchor(null) }
      if (e.key === 'Enter') { e.preventDefault(); close() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anchor, value])
  return <>
    <button type="button" disabled={disabled} onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect()
      draft.current = value; setEditing(value); cancel.current = false; warningUntil.current = 0
      setAnchor({ top: Math.min(r.bottom + 6, window.innerHeight - 145), left: r.left })
    }} className="w-fit border-b border-dashed border-transparent text-[13px] tabular-nums text-white/40 enabled:cursor-pointer enabled:hover:border-white/40">{value} 秒</button>
    {anchor && <Popover anchor={anchor} width={220} onClose={() => {
      // Blur first so a pending out-of-range input is normalized before saving.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      close()
    }}><div className="p-3"><DurationStepper value={editing} title={title} onClamp={() => { warningUntil.current = Date.now() + 600 }} onChange={(n) => { draft.current = n; setEditing(n) }} /></div></Popover>}
  </>
}
