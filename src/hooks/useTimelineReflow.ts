import { useLayoutEffect, useRef, useState } from 'react'

// Storage updates immediately. Only an already visible cell waits one second.
export function useTimelineReflow(revision: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(revision)
  const busy = revision !== settled
  useLayoutEffect(() => {
    if (!busy) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) { setSettled(revision); return }
    const timer = setTimeout(() => setSettled(revision), 1000)
    return () => clearTimeout(timer)
  }, [revision, busy])
  return { ref, busy }
}
