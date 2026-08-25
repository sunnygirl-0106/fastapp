import { useState } from 'react'
import type { Project } from '@/types'
import { COST, MODELS } from '@/services/generation'
import { Button, FakeSelect, Label, Modal, Textarea, fmt } from '@/components/ui'

// Step3（进入镜头设计）与 Step4（重新生成镜头）共用
export default function GenShotModal({
  project,
  onClose,
  onConfirm,
}: {
  project: Project
  onClose: () => void
  onConfirm: (segNos: number[]) => void
}) {
  const segs = project.segments
  const [style, setStyle] = useState('')
  const [sel, setSel] = useState<number[]>(segs.map((s) => s.no))
  const toggle = (no: number) => setSel((s) => (s.includes(no) ? s.filter((x) => x !== no) : [...s, no]))
  const cost = sel.length * COST.shotGenEach
  const allSel = sel.length === segs.length

  return (
    <Modal
      title="生成镜头设计"
      width={860}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-[13px] text-muted">
            已选择 {sel.length}/{segs.length} 个段落 · 预计消耗 {fmt(cost)} 星钻
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={!sel.length} onClick={() => onConfirm(sel)}>
              确认并生成 {sel.length} 个镜头
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4 text-[13px] text-muted">选择需要生成镜头的故事段落，默认已全部选择。</div>

      <Label>生成模型</Label>
      <FakeSelect value={MODELS.text} />
      <div className="h-3" />
      <Label>画面风格补充（可选）</Label>
      <Textarea
        rows={2}
        placeholder="例如：电影感、低饱和色调、柔和侧光、写实摄影风格"
        value={style}
        onChange={(e) => setStyle(e.target.value)}
      />

      <div className="mb-2 mt-4 text-[13px] text-muted">故事段落（{segs.length}）</div>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[40px_60px_160px_70px_90px_1fr] gap-2 border-b border-line bg-panel2 px-3 py-2 text-xs text-muted">
          <div>
            <input
              type="checkbox"
              checked={allSel}
              onChange={() => setSel(allSel ? [] : segs.map((s) => s.no))}
              className="accent-brand"
            />
          </div>
          <div>段落</div>
          <div>标题</div>
          <div>时长</div>
          <div>场景</div>
          <div>故事内容</div>
        </div>
        {segs.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-[40px_60px_160px_70px_90px_1fr] gap-2 border-b border-line/60 px-3 py-2 text-[13px] last:border-0"
          >
            <div>
              <input type="checkbox" checked={sel.includes(s.no)} onChange={() => toggle(s.no)} className="accent-brand" />
            </div>
            <div className="tabular-nums">{s.no}</div>
            <div>{s.title}</div>
            <div className="text-muted">{s.dur}</div>
            <div className="text-faint">{s.scene ?? ''}</div>
            <div className="line-clamp-1 text-muted">{s.text}</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
