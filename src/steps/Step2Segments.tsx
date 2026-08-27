import { useLayoutEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Project, Segment } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import { no2, fmtDur } from '@/utils/project'
import {
  ActionBar,
  Button,
  Diamond,
  GenerateConfirmModal,
  GeneratingState,
  InlineRename,
  Input,
  Label,
  Modal,
  ModelSelect,
  PageHeader,
  Textarea,
} from '@/components/ui'

export default function Step2Segments({ project }: { project: Project }) {
  const { generateSegments, startAssets, addSegment, updateSegmentTitle, deleteSegment, goStep } = useStore()
  const [regenOpen, setRegenOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [extractOpen, setExtractOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Segment | null>(null)
  const [regenModel, setRegenModel] = useState<string>(MODELS.text)
  const [extractModel, setExtractModel] = useState<string>(MODELS.text)

  const st = project.segStatus
  const segs = project.segments
  const assetStatus = project.assetStatus
  const assetStale = !!project.assetStale

  if (st === 'generating') {
    return (
      <>
        <GeneratingState
          title="正在拆解剧本"
          desc="AI 正在通读剧本并划分段落，请稍候。"
          phases={['正在通读剧本…', '正在划分段落边界…', '正在整理段落标题…']}
          skeletons={3}
        />
        <ActionBar>
          <Button variant="primary" size="lg" disabled>
            正在拆解剧本…
          </Button>
        </ActionBar>
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="剧本拆解"
        right={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRegenOpen(true)}>
              重新拆解
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={16} /> 新增剧本段落
            </Button>
          </>
        }
      />

      <div className="mb-3 text-[13px] text-muted">共 {segs.length} 个剧本段落</div>

      <div className="space-y-3">
        {segs.map((s) => (
          <ParagraphCard
            key={s.id}
            seg={s}
            onRenameTitle={(v) => updateSegmentTitle(s.id, v)}
            onDelete={() => setConfirmDel(s)}
          />
        ))}
        {segs.length === 0 && (
          <div className="rounded-xl border border-line/60 bg-panel py-16 text-center text-[13px] text-faint">
            暂无剧本段落
          </div>
        )}
      </div>

      <BottomBar
        assetStatus={assetStatus}
        assetStale={assetStale}
        disabled={segs.length === 0}
        onExtract={() => setExtractOpen(true)}
        onNext={() => goStep(3)}
      />

      {/* 新增剧本段落弹窗 */}
      {addOpen && <AddSegModal nextNo={segs.length + 1} onClose={() => setAddOpen(false)} onAdd={addSegment} />}

      {/* 删除确认 */}
      {confirmDel && (
        <Modal
          title="删除段落"
          width={380}
          onClose={() => setConfirmDel(null)}
          footer={
            <>
              <Button onClick={() => setConfirmDel(null)}>取消</Button>
              <Button
                variant="danger-solid"
                onClick={() => {
                  deleteSegment(confirmDel.id)
                  setConfirmDel(null)
                }}
              >
                删除段落
              </Button>
            </>
          }
        >
          <div className="text-sm text-white/85">确定删除「{confirmDel.title}」吗？删除后无法恢复。</div>
        </Modal>
      )}

      {/* 提取角色与场景确认 */}
      {extractOpen && (
        <GenerateConfirmModal
          title="确认提取角色与场景"
          what={`AI 将从 ${segs.length} 个剧本段落中识别主要角色和场景。`}
          model={<ModelSelect value={extractModel} options={MODEL_OPTIONS.text} onChange={setExtractModel} />}
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
          title="确认重新拆解剧本"
          what={`重新拆解将覆盖现有的 ${segs.length} 个剧本段落，已生成的角色、场景、镜头和视频会被标记为需要重新生成。`}
          model={<ModelSelect value={regenModel} options={MODEL_OPTIONS.text} onChange={setRegenModel} />}
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

/* ---------- 底部主按钮：区分「往前走」与「重做」 ---------- */
function BottomBar({
  assetStatus,
  assetStale,
  disabled,
  onExtract,
  onNext,
}: {
  assetStatus: Project['assetStatus']
  assetStale: boolean
  disabled: boolean
  onExtract: () => void
  onNext: () => void
}) {
  // generating：等待中
  if (assetStatus === 'generating') {
    return (
      <ActionBar>
        <Button variant="primary" size="lg" disabled>
          正在提取角色与场景…
        </Button>
      </ActionBar>
    )
  }
  // 已提取且未变脏：直接往前，不扣费、不显示价格
  if (assetStatus === 'done' && !assetStale) {
    return (
      <ActionBar>
        <Button variant="primary" size="lg" disabled={disabled} onClick={onNext}>
          下一步：角色与场景
        </Button>
      </ActionBar>
    )
  }
  // 已变脏：重新提取（带价格）
  if (assetStale) {
    return (
      <ActionBar left="剧本段落有改动，重新提取可让角色与场景保持同步">
        <Button variant="primary" size="lg" disabled={disabled} onClick={onExtract}>
          重新提取角色与场景 · <Diamond />
          {COST.assetExtract}
        </Button>
      </ActionBar>
    )
  }
  // 未提取：首次提取（带价格）
  return (
    <ActionBar left="提取后可为角色和场景补全参考图，保持画面一致">
      <Button variant="primary" size="lg" disabled={disabled} onClick={onExtract}>
        下一步：提取角色与场景 · <Diamond />
        {COST.assetExtract}
      </Button>
    </ActionBar>
  )
}

/* ---------- 段落卡片 ---------- */
function ParagraphCard({
  seg,
  onRenameTitle,
  onDelete,
}: {
  seg: Segment
  onRenameTitle: (v: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const bodyRef = useRef<HTMLParagraphElement>(null)

  // 检测原文是否超过收起高度，决定是否显示底部渐隐提示
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    setOverflow(el.scrollHeight - el.clientHeight > 4)
  }, [seg.text])

  return (
    <div className="rounded-xl border border-line bg-panel px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="text-[13px] tabular-nums text-faint">{no2(seg.no)}</span>
        {editing ? (
          <InlineRename
            value={seg.title}
            className="text-[15px] font-medium"
            onCommit={(v) => {
              onRenameTitle(v)
              setEditing(false)
            }}
          />
        ) : (
          <button
            type="button"
            title="点击编辑标题"
            onClick={() => setEditing(true)}
            className="rounded text-left text-[15px] font-medium leading-snug transition-colors hover:text-brand"
          >
            {seg.title}
          </button>
        )}
        <span className="text-[13px] tabular-nums text-muted">{fmtDur(seg.dur)}</span>
        <button
          type="button"
          title="删除段落"
          aria-label="删除段落"
          onClick={onDelete}
          className="ml-auto rounded-md p-1.5 text-faint opacity-45 transition-colors hover:bg-red-500/15 hover:text-red-400 hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="relative mt-3">
        {/* 收起态：点击正文原地展开只读弹窗 */}
        <button
          type="button"
          title="点击查看完整原文"
          onClick={() => setOpen(true)}
          className="group/body block w-full cursor-pointer text-left"
        >
          <p
            ref={bodyRef}
            className="max-h-[7.5rem] overflow-hidden whitespace-pre-line text-[13.5px] leading-relaxed text-white/85 transition-colors group-hover/body:text-white"
          >
            {seg.text}
          </p>
          {overflow && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-panel to-transparent" />
          )}
        </button>

        {/* 展开态：原地浮层，微微高亮框，只读 */}
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute -inset-x-1 -top-1 z-30 rounded-xl border border-brand/45 bg-panel2/95 px-4 py-3 shadow-xl shadow-black/50 ring-1 ring-brand/15 backdrop-blur">
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-white/90">{seg.text}</p>
              <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2">
                <span className="text-[12px] text-faint">只读</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-[12px] text-muted transition-colors hover:text-white"
                >
                  收起
                </button>
              </div>
            </div>
          </>
        )}
      </div>
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
      title="新增剧本段落"
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
      <Label req>剧本原文</Label>
      <Textarea
        rows={5}
        placeholder="填入该段剧本原文，用于后续提取角色与生成镜头"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  )
}
