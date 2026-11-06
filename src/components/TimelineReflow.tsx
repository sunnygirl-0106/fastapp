import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getUiScale } from '@/utils/layout'

/** Keep the content mounted and its layout intact throughout the reflow animation. */
export default function TimelineReflow({ busy, children, className = '' }: {
  busy: boolean; children: ReactNode; className?: string
}) {
  const frame = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => setCompact(el.getBoundingClientRect().height < 60 * getUiScale())
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    // Inert prevents focus, typing and pointer edits without unmounting draft editors.
    content.current?.toggleAttribute('inert', busy)
  }, [busy])
  return <div ref={frame} className={`timeline-reflow ${className}`} data-reflow-busy={busy}>
    <div ref={content} className="timeline-reflow-content">{children}</div>
    <div className="timeline-reflow-overlay" aria-hidden={!busy} role={busy ? 'status' : undefined} aria-label={busy ? '正在重排时间' : undefined}>
      <svg className="timeline-reflow-spinner text-brand" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="7" stroke="white" strokeOpacity="0.1" strokeWidth="2" />
        <path d="M 9 2 A 7 7 0 0 1 16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {!compact && <span className="timeline-reflow-label">正在重排时间</span>}
    </div>
  </div>
}
