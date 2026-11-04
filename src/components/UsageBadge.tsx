import { useEffect, useState } from 'react'
export default function UsageBadge() {
  const [usage, setUsage] = useState<{ spent: number; budget: number }>()
  useEffect(() => {
    let alive = true
    const refresh = () => { fetch('/api/usage').then(r => r.ok ? r.json() : undefined).then(data => { if (alive && data) setUsage(data) }).catch(() => {}) }
    refresh()
    window.addEventListener('phanthy:usage', refresh)
    const timer = setInterval(refresh, 5000)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('phanthy:usage', refresh) }
  }, [])
  return <a href="/usage" target="_blank" rel="noreferrer" className={`fixed bottom-2 right-2 z-50 rounded bg-black/80 px-2 py-1 text-[11px] ${usage && usage.spent > 4 ? 'text-red-400' : 'text-white/60'}`}>{usage ? `已花 $${usage.spent.toFixed(2)} / $${usage.budget}` : '费用查询中…'}</a>
}
