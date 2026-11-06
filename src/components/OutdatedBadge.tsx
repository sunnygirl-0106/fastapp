import { AlertTriangle } from 'lucide-react'

/** Informational label; an optional inline action keeps ignoring a change one click away. */
export default function OutdatedBadge({ label = '待更新', title, onIgnore, ignoreLabel }: {
  label?: string
  title?: string
  onIgnore?: () => void
  ignoreLabel?: string
}) {
  return <span className="inline-flex w-fit shrink-0 items-center gap-2 text-xs leading-none">
    <span title={title} className="inline-flex h-[1.375rem] items-center gap-1.5 whitespace-nowrap rounded-md bg-[#f2b544]/10 px-2 text-[#f2b544]">
      <AlertTriangle size="0.8125rem" strokeWidth={1.8} aria-hidden="true" className="shrink-0" />{label}
    </span>
    {onIgnore && <button type="button" aria-label={ignoreLabel} onClick={e => { e.stopPropagation(); onIgnore() }} className="text-white/35 transition-colors hover:text-white/70">忽略</button>}
  </span>
}
