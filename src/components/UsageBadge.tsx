import { useEffect, useState } from 'react'
export default function UsageBadge() {
  const [usage, setUsage] = useState<{ spent: number; budget: number; warning: string | null }>()
  useEffect(() => {
    let alive = true
    const refresh = () => { fetch('/api/usage').then(r => r.ok ? r.json() : undefined).then(data => { if (alive && data) setUsage(data) }).catch(() => {}) }
    refresh()
    window.addEventListener('phanthy:usage', refresh)
    const timer = setInterval(refresh, 5000)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('phanthy:usage', refresh) }
  }, [])
  return <div className="fixed bottom-2 right-2 z-50 max-w-sm rounded bg-black/90 px-3 py-2">
    {usage?.warning && <p role="alert" className="mb-1 text-sm font-medium text-red-400">{usage.warning}</p>}
    <a href="/usage" target="_blank" rel="noreferrer" className={`text-[0.6875rem] ${usage?.warning ? 'text-red-400' : 'text-white/60'}`}>{usage ? `已花 $${usage.spent.toFixed(2)} / $${usage.budget}` : '费用查询中…'}</a>
  </div>
}
