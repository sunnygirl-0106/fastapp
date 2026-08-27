import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import type { Project } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import { ActionBar, Button, Diamond, GenerateConfirmModal, ModelSelect, PageHeader, Spinner } from '@/components/ui'

export default function Step1Script({ project }: { project: Project }) {
  const setScript = useStore((s) => s.setScript)
  const startSegments = useStore((s) => s.startSegments)
  const [text, setText] = useState(project.script)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirm, setConfirm] = useState(false)
  const [model, setModel] = useState<string>(MODELS.text)
  const t = useRef<ReturnType<typeof setTimeout>>()
  const fileRef = useRef<HTMLInputElement>(null)

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

  // 上传剧本文件：读取纯文本内容，有内容则追加，否则填入
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    const raw = await file.text()
    const content = raw.replace(/\r\n/g, '\n').trim()
    if (!content) return
    const next = text.trim() ? `${text.trim()}\n\n${content}` : content
    onChange(next)
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
        title="添加剧本内容"
        desc="粘贴小说、短剧剧本或剧本梗概，AI 将把内容拆解成适合生成视频的剧本段落。"
        right={
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-white"
          >
            <Upload size={14} className="text-faint" />
            上传剧本
          </button>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,.fountain,text/plain,text/markdown"
        onChange={onPickFile}
        className="hidden"
      />

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (t.current) clearTimeout(t.current)
          setScript(text)
          setStatus('saved')
        }}
        placeholder="在这里粘贴或输入剧本内容…"
        className="min-h-[420px] w-full resize-y rounded-xl border border-line bg-panel px-5 py-4 text-sm leading-7 outline-none placeholder:text-faint focus:border-brand/50"
      />

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-faint">
          {chars > 0 ? `${chars} 字` : '输入剧本内容后即可开始拆解'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-faint">
          {status === 'saving' && (
            <>
              <Spinner size={11} /> 正在保存…
            </>
          )}
          {status === 'saved' && <span className="text-brand">已保存</span>}
        </span>
      </div>

      <ActionBar left={chars > 0 ? '拆解后可在下一步查看和编辑剧本段落' : undefined}>
        <Button variant="primary" size="lg" disabled={chars === 0} onClick={() => setConfirm(true)}>
          {chars > 0 ? (
            <>
              拆解剧本 · <Diamond />
              {COST.segGen}
            </>
          ) : (
            '请先添加剧本内容'
          )}
        </Button>
      </ActionBar>

      {confirm && (
        <GenerateConfirmModal
          title="确认拆解剧本"
          what="AI 将根据当前内容生成剧本段落。"
          model={<ModelSelect value={model} options={MODEL_OPTIONS.text} onChange={setModel} />}
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
