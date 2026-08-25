import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved'

/**
 * 自动保存：输入停止 delayMs 后提交 → 失焦立即提交 → 卸载前兜底提交。
 * 收起卡片 / 切换展开 / 切步骤 / 返回列表这些时机都必须先 flush，
 * 否则最后 delayMs 内敲的字会静默丢失。
 */
export function useAutoSave(commit: (v: string) => void, delayMs = 700) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const pending = useRef<string | null>(null)
  // commit 每次 render 都是新引用，用 ref 兜住，保证 cleanup 里 flush 到最新
  const commitRef = useRef(commit)
  commitRef.current = commit
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current !== null) {
      commitRef.current(pending.current)
      pending.current = null
      setStatus('saved')
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setStatus('idle'), 2000)
    }
  }

  const schedule = (v: string) => {
    pending.current = v
    setStatus('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, delayMs)
  }

  // 卸载前兜底提交
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      if (pending.current !== null) {
        commitRef.current(pending.current)
        pending.current = null
      }
    },
    [],
  )

  return { status, schedule, flush }
}
