import { useEffect, useRef, useState } from 'react'
import type { Project } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS } from '@/services/generation'
import { ActionBar, Button, Diamond, GenerateConfirmModal, PageHeader, Spinner } from '@/components/ui'

export default function Step1Script({ project }: { project: Project }) {
  const setScript = useStore((s) => s.setScript)
  const startSegments = useStore((s) => s.startSegments)
  const [text, setText] = useState(project.script)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirm, setConfirm] = useState(false)
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

  // 关键：取消 pending 的防抖并立即 flush，再置状态 + 切页 + 生成
  const handleConfirm = () => {
    if (t.current) clearTimeout(t.current)
    setScript(text)
    setStatus('saved')
    setConfirm(false)
    startSegments()
  }

  return (
    <div>
      <PageHeader
        title="添加故事内容"
        desc="粘贴小说、短剧剧本或故事梗概，AI 将把内容拆解成适合生成视频的故事段落。"
      />

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (t.current) clearTimeout(t.current)
          setScript(text)
          setStatus('saved')
        }}
        placeholder="在这里粘贴或输入故事内容…"
        className="min-h-[420px] w-full resize-y rounded-xl border border-line bg-panel px-5 py-4 text-sm leading-7 outline-none placeholder:text-faint focus:border-brand/50"
      />

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-faint">
          {chars > 0 ? `${chars} 字 · 预计拆解为 3–5 个故事段落` : '输入故事内容后即可开始拆解'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-faint">
          {status === 'saving' && (
            <>
              <Spinner size={11} /> 正在保存…
            </>
          )}
          {status === 'saved' && <span className="text-brand">已自动保存</span>}
        </span>
      </div>

      <ActionBar left={chars > 0 ? '拆解后可在下一步查看和编辑故事段落' : undefined}>
        <Button variant="primary" size="lg" disabled={chars === 0} onClick={() => setConfirm(true)}>
          {chars > 0 ? (
            <>
              拆解故事 · <Diamond />
              {COST.segGen}
            </>
          ) : (
            '请先添加故事内容'
          )}
        </Button>
      </ActionBar>

      {confirm && (
        <GenerateConfirmModal
          title="确认拆解故事"
          what="AI 将根据当前内容生成约 3–5 个故事段落。"
          model={MODELS.text}
          cost={COST.segGen}
          balance={project.balance}
          confirmText="确认并开始拆解"
          onClose={() => setConfirm(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}
