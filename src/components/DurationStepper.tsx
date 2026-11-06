import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { clampDuration, DUR_MIN, DUR_MAX } from '@/data/duration'

export function DurationStepper({ value, onChange, onPreview, title = '段落时长', onClamp, variant = 'default', size, disabled, pending, tooltip, disabledTooltip = '正在生成镜头，完成后可调整', debounceMs = 800 }: {
  onPreview?: (value: number | undefined) => void
  value: number; onChange: (value: number) => void; title?: string; onClamp?: () => void
  variant?: 'default' | 'inline'; size?: 'sm' | 'xs'; disabled?: boolean; pending?: boolean; tooltip?: string; disabledTooltip?: string; debounceMs?: number
}) {
  const [draft, setDraft] = useState(String(value))
  const [flash, setFlash] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const flashTimer = useRef<ReturnType<typeof setTimeout>>()
  const preview = useRef(onPreview)
  preview.current = onPreview
  useEffect(() => {
    const n = Number(draft)
    preview.current?.(draft.trim() && Number.isInteger(n) && n >= DUR_MIN && n <= DUR_MAX ? n : undefined)
  }, [draft])
  useEffect(() => () => preview.current?.(undefined), [])
  const latest = useRef({ value, onChange, disabled })
  latest.current = { value, onChange, disabled }
  useEffect(() => { clearTimeout(timer.current); setDraft(String(value)) }, [value, disabled])
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(flashTimer.current) }, [])
  const normalize = (raw: string) => {
    const n = Number(raw)
    const next = clampDuration(raw.trim() ? n : NaN)
    if (!raw.trim() || n !== next) {
      onClamp?.(); setFlash(true); clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(false), 600)
    }
    setDraft(String(next))
    return next
  }
  const commit = (next: number) => {
    clearTimeout(timer.current)
    if (!latest.current.disabled && next !== latest.current.value) latest.current.onChange(next)
  }
  const step = (delta: number) => {
    const next = normalize(String(Number(draft) + delta))
    clearTimeout(timer.current)
    if (variant === 'inline' && debounceMs) timer.current = setTimeout(() => commit(next), debounceMs)
    else commit(next)
  }
  const inline = variant === 'inline'
  const buttonClass = inline
    ? `flex ${size === 'xs' ? 'h-5 w-5' : 'h-6 w-6'} rounded-full text-white/70 shrink-0 items-center justify-center enabled:hover:bg-white/5 enabled:hover:text-white disabled:opacity-30`
    : 'flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 enabled:hover:bg-white/10 disabled:opacity-30'
  return <div className={inline ? 'w-fit' : 'space-y-2'} title={disabled ? disabledTooltip || undefined : tooltip}>
    {!inline && <div className="text-[0.8125rem] text-white/70">{title}</div>}
    <div className={inline ? `flex w-fit items-center rounded-full border bg-white/[0.03] transition-colors ${size === 'xs' ? 'h-6 px-0.5' : `px-1 ${size === 'sm' ? 'h-7' : 'h-8'}`} ${pending ? 'border-amber-400/40' : 'border-white/15 hover:border-white/25 focus-within:border-white/25'} ${disabled ? 'opacity-50' : ''}` : 'flex items-center gap-2'}>
      <button type="button" aria-label="减少时长" disabled={disabled || Number(draft) <= DUR_MIN} className={buttonClass} onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)}><Minus size={size === 'xs' ? '0.75rem' : '0.875rem'} /></button>
      <input aria-label={title} type="number" min={DUR_MIN} max={DUR_MAX} step={1} disabled={disabled} value={draft}
        onChange={(e) => {
          clearTimeout(timer.current); setDraft(e.target.value)
          if ((!inline || debounceMs === 0) && e.target.value && Number(e.target.value) >= DUR_MIN && Number(e.target.value) <= DUR_MAX && Number.isInteger(Number(e.target.value))) commit(Number(e.target.value))
        }}
        onBlur={() => commit(normalize(draft))} onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(normalize(draft)) }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clearTimeout(timer.current); setDraft(String(value)) }
        }}
        className={inline ? `${size === 'xs' ? 'w-6' : 'w-7'} appearance-none bg-transparent text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-[0.8125rem]' : 'text-sm'} ${flash ? 'text-red-400' : pending ? 'text-amber-200' : 'text-white'}` : 'h-8 w-14 rounded-lg bg-black/40 text-center text-sm outline-none focus:ring-1 focus:ring-brand'} />
      <span className={`${size === 'xs' ? 'text-[0.6875rem]' : 'text-xs'} text-white/40`}>秒</span>
      <button type="button" aria-label="增加时长" disabled={disabled || Number(draft) >= DUR_MAX} className={buttonClass} onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)}><Plus size={size === 'xs' ? '0.75rem' : '0.875rem'} /></button>
    </div>
    {!inline && <div className={`text-xs ${flash ? 'text-red-400' : 'text-faint'}`}>{DUR_MIN}–{DUR_MAX} 秒，整数</div>}
  </div>
}
export default DurationStepper
