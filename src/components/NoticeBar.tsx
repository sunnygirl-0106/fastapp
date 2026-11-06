import type { MouseEvent, ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'

type NoticeAction = { label: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void; variant: 'text' | 'pill'; disabled?: boolean; title?: string }

export default function NoticeBar({ children, tone = 'warning', action, onAction, disabled, title, actions = [] }: {
  children: ReactNode; tone?: 'warning' | 'neutral'; action?: string; onAction?: () => void; disabled?: boolean; title?: string; actions?: NoticeAction[]
}) {
  const Icon = tone === 'neutral' ? Info : AlertTriangle
  const items = action ? [{ label: action, onClick: () => onAction?.(), variant: 'text' as const, disabled, title }, ...actions] : actions
  return <div className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5 text-[0.8125rem] ${tone === 'neutral' ? 'border-white/10 bg-white/[0.04] text-white/70' : 'border-amber-400/20 bg-amber-400/10 text-amber-200/90'}`}>
    <Icon size="0.875rem" className="shrink-0" /><span className="min-w-[12.5rem] flex-1">{children}</span>
    {items.length > 0 && <div className="ml-auto flex shrink-0 items-center gap-3">{items.map((item) => <button key={item.label} title={item.title} disabled={item.disabled} onClick={item.onClick} className={`shrink-0 text-amber-300 disabled:opacity-40 ${item.variant === 'pill' ? 'rounded-full border border-amber-400/40 px-3 py-1.5 text-xs enabled:hover:bg-amber-400/10' : 'enabled:hover:underline'}`}>{item.label}</button>)}</div>}
  </div>
}
