import { useEffect, useRef, useState } from 'react'
import type { Project } from '@/types'
import { useStore } from '@/store/workflowStore'
import { Spinner } from '@/components/ui'

export default function Step1Script({ project }: { project: Project }) {
  const setScript = useStore((s) => s.setScript)
  const [text, setText] = useState(project.script)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const t = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => setText(project.script), [project.id])

  const onChange = (v: string) => {
    setText(v)
    setStatus('saving')
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => {
      setScript(v)
      setStatus('saved')
    }, 700)
  }

  const chars = text.trim().length

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            setScript(text)
            setStatus('saved')
          }}
          placeholder="粘贴或输入剧本正文…失焦后自动保存"
          className="min-h-[620px] w-full resize-y rounded-xl border border-line bg-panel px-5 py-4 text-sm leading-7 outline-none placeholder:text-faint focus:border-brand/50"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-faint">
        <span>{chars > 0 ? `${chars} 字 · 预计可分 3~5 段` : '粘贴剧本后自动分段更准确'}</span>
        <span className="inline-flex items-center gap-1.5">
          {status === 'saving' && (
            <>
              <Spinner size={11} /> 正在保存…
            </>
          )}
          {status === 'saved' && <span className="text-brand">已自动保存</span>}
        </span>
      </div>
    </div>
  )
}
