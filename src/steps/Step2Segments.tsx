import { useState } from 'react'
import type { Project, Segment } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS } from '@/services/generation'
import { no2, fmtDur } from '@/utils/project'
import {
  ActionBar,
  Button,
  Diamond,
  Drawer,
  GenerateConfirmModal,
  GeneratingState,
  Input,
  Label,
  Modal,
  PageHeader,
  ReadonlyField,
  Textarea,
  fmt,
} from '@/components/ui'

export default function Step2Segments({ project }: { project: Project }) {
  const { generateSegments, startAssets, addSegment, updateSegmentTitle, deleteSegment } = useStore()
  const [regenOpen, setRegenOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [extractOpen, setExtractOpen] = useState(false)
  const [edit, setEdit] = useState<Segment | null>(null)

  const st = project.segStatus
  const segs = project.segments

  if (st === 'generating') {
    return (
      <>
        <GeneratingState
          title="正在拆解故事"
          desc="AI 正在理解情节、角色和场景，请稍候。"
          phases={['正在识别情节变化…', '正在整理出场角色与场景…', '正在生成故事段落…']}
          skeletons={3}
        />
        <ActionBar>
          <Button variant="primary" size="lg" disabled>
            正在拆解故事…
          </Button>
        </ActionBar>
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="故事拆解"
        desc={`已将故事拆解为 ${segs.length} 个可独立制作的视频段落。`}
        right={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRegenOpen(true)}>
              重新拆解
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              ＋ 新增故事段落
            </Button>
          </>
        }
      />

      <div className="mb-4 text-[13px] text-muted">已生成 {segs.length} 个故事段落</div>

      <div className="space-y-3">
        {segs.map((s) => (
          <div
            key={s.id}
            onClick={() => setEdit(s)}
            className="group cursor-pointer rounded-xl border border-line/60 bg-panel px-5 py-4 transition-colors hover:border-line hover:bg-panel2"
          >
            <div className="flex items-center gap-2 text-xs text-faint">
              <span className="tabular-nums">{no2(s.no)}</span>
              <span>·</span>
              <span>{fmtDur(s.dur)}</span>
            </div>
            <div className="mt-1.5 text-[15px] font-medium">{s.title}</div>
            <div className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{s.text}</div>

            {(s.scene || s.roles) && (
              <div className="mt-2.5 text-xs text-faint">{[s.scene, s.roles].filter(Boolean).join(' · ')}</div>
            )}

            <div className="mt-3 text-[13px] text-brand opacity-0 transition group-hover:opacity-100">查看详情 ›</div>
          </div>
        ))}
      </div>

      <ActionBar left="提取后可为角色和场景补全参考图，保持画面一致">
        <Button variant="primary" size="lg" disabled={segs.length === 0} onClick={() => setExtractOpen(true)}>
          提取角色与场景 · <Diamond />
          {COST.assetExtract}
        </Button>
      </ActionBar>

      {/* 新增故事段落弹窗 */}
      {addOpen && <AddSegModal nextNo={segs.length + 1} onClose={() => setAddOpen(false)} onAdd={addSegment} />}

      {/* 段落详情抽屉 */}
      {edit && (
        <EditSegDrawer
          seg={edit}
          onClose={() => setEdit(null)}
          onSave={(title) => {
            updateSegmentTitle(edit.id, title)
            setEdit(null)
          }}
          onDelete={() => {
            deleteSegment(edit.id)
            setEdit(null)
          }}
        />
      )}

      {/* 提取角色与场景确认 */}
      {extractOpen && (
        <GenerateConfirmModal
          title="确认提取角色与场景"
          what={`AI 将从 ${segs.length} 个故事段落中识别主要角色和场景。`}
          model={MODELS.text}
          cost={COST.assetExtract}
          balance={project.balance}
          confirmText="确认并开始提取"
          onClose={() => setExtractOpen(false)}
          onConfirm={() => {
            setExtractOpen(false)
            startAssets()
          }}
        />
      )}

      {/* 重新拆解确认 */}
      {regenOpen && (
        <GenerateConfirmModal
          title="确认重新拆解故事"
          what={`重新拆解将覆盖现有的 ${segs.length} 个故事段落，已生成的角色、场景、镜头和视频会被标记为需要重新生成。`}
          model={MODELS.text}
          cost={COST.segGen}
          balance={project.balance}
          confirmText="确认并重新拆解"
          onClose={() => setRegenOpen(false)}
          onConfirm={() => {
            setRegenOpen(false)
            generateSegments()
          }}
        />
      )}
    </div>
  )
}

function AddSegModal({
  nextNo,
  onClose,
  onAdd,
}: {
  nextNo: number
  onClose: () => void
  onAdd: (title: string, text: string) => void
}) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const ok = title.trim() && text.trim()
  return (
    <Modal
      title="新增故事段落"
      width={480}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              onAdd(title, text)
              onClose()
            }}
          >
            添加
          </Button>
        </>
      }
    >
      <Label>段落编号（自动）</Label>
      <div className="mb-3 inline-block rounded bg-panel2 px-3 py-1.5 text-sm tabular-nums">{no2(nextNo)}</div>
      <Label req>段落标题</Label>
      <Input placeholder="例如：苏可推门对峙" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="h-3" />
      <Label req>故事原文</Label>
      <Textarea
        rows={5}
        placeholder="填入该段故事原文，用于后续提取角色与生成镜头"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  )
}

function EditSegDrawer({
  seg,
  onClose,
  onSave,
  onDelete,
}: {
  seg: Segment
  onClose: () => void
  onSave: (title: string) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(seg.title)
  const [confirmDel, setConfirmDel] = useState(false)
  const dirty = title.trim() !== seg.title
  return (
    <Drawer
      width={480}
      header={<div className="text-brand text-[15px] font-semibold">故事段落 {no2(seg.no)}</div>}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>
            删除段落
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={!dirty} onClick={() => onSave(title)}>
              保存修改
            </Button>
          </div>
        </>
      }
    >
      <Label req>段落标题</Label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="h-4" />
      <ReadonlyField label="故事原文" value={seg.text} />
      <ReadonlyField label="场景" value={seg.scene} />
      <ReadonlyField label="出场角色" value={seg.roles} />
      <ReadonlyField label="主要动作" value={seg.action} />
      <ReadonlyField label="时间安排" value={seg.timeline} />

      {confirmDel && (
        <Modal
          title="删除段落"
          width={380}
          onClose={() => setConfirmDel(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDel(false)}>取消</Button>
              <Button variant="danger-solid" onClick={onDelete}>
                删除段落
              </Button>
            </>
          }
        >
          <div className="text-sm text-white/85">确定删除「{seg.title}」吗？删除后无法恢复。</div>
        </Modal>
      )}
    </Drawer>
  )
}
