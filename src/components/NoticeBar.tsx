import type { ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
export default function NoticeBar({ children, tone = 'warning', action, onAction, disabled, title }: {
  children: ReactNode; tone?: 'warning' | 'neutral'; action?: string; onAction?: () => void; disabled?: boolean; title?: string
}) {
  const Icon = tone === 'neutral' ? Info : AlertTriangle
  return <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] ${tone === 'neutral' ? 'border-white/10 bg-white/[0.04] text-white/70' : 'border-amber-400/20 bg-amber-400/10 text-amber-200/90'}`}>
    <Icon size={14} className="shrink-0" /><span className="flex-1">{children}</span>
    {action && <button title={title} disabled={disabled} onClick={onAction} className="shrink-0 text-amber-300 enabled:hover:underline disabled:opacity-40">{action}</button>}
  </div>
}
