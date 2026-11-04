import SegmentConfirmModal from './SegmentConfirmModal'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Project, Segment, Shot } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import DurationStepper from '@/components/DurationStepper'
import { no2 } from '@/utils/project'
import {
  ActionBar,
  Button,
  GenerateConfirmModal,
  GeneratingState,
  InlineRename,
  Modal,
  ModelSelect,
  Overlay,
  PageHeader,
} from '@/components/ui'

// 浅青渐变主按钮（与首页 / 弹窗 CTA 一致）
const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

/* ---------- 胶囊按钮（对齐设计稿） ---------- */
function PillPrimary({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={CTA_GRADIENT}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function PillOutline({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export default function Step2Segments({ project }: { project: Project }) {
  const { updateSegment, startAssets, addSegment, updateSegmentTitle, deleteSegment, restartSegments, goStep } = useStore()
  const [durationPreview, setDurationPreview] = useState<Record<string, number | undefined>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [redoOpen, setRedoOpen] = useState(false)
  const [extractOpen, setExtractOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Segment | null>(null)
  const [extractModel, setExtractModel] = useState<string>(MODELS.text)

  const st = project.segStatus
  const segs = project.segments
  const assetStatus = project.assetStatus

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
        desc={`共 ${segs.length} 个剧本段落 · ${project.config.durMode === 'manual' ? `目标 ${project.config.targetDur} 秒 · 当前合计` : '预计成片时长约'} ${segs.reduce((sum, seg) => sum + (durationPreview[seg.id] ?? seg.dur ?? 0), 0)} 秒`}
        right={
          <>
            <PillOutline disabled={assetStatus !== 'none'} title={assetStatus !== 'none' ? '已开始提取角色与场景，不能重新拆解，可以直接修改段落' : undefined} onClick={() => setRedoOpen(true)}>重新拆解</PillOutline>
            <PillPrimary onClick={() => setAddOpen(true)}>
              <Plus size={14} strokeWidth={2.5} /> 新增剧本段落
            </PillPrimary>
          </>
        }
      />

      <div className="space-y-3">
        {segs.map((s) => (
          <ParagraphCard
            key={s.id}
            seg={s}
            shot={project.shots.find((shot) => shot.segId === s.id)}
            onUpdate={(patch, options) => updateSegment(s.id, patch, options)}
            onRenameTitle={(v) => updateSegmentTitle(s.id, v)}
            onDelete={() => setConfirmDel(s)}
            durationDisabled={project.shotStatus === 'generating'}
            onDurationPreview={(dur) => setDurationPreview((prev) => ({ ...prev, [s.id]: dur }))}
          />
        ))}
        {segs.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-[#111213] py-16 text-center text-[13px] text-faint">
            暂无剧本段落
          </div>
        )}
      </div>

      <BottomBar
        assetStatus={assetStatus}
        disabled={segs.length === 0}
        onExtract={() => setExtractOpen(true)}
        onNext={() => goStep(3)}
      />

      {redoOpen && <SegmentConfirmModal project={project} mode="redo" onClose={() => setRedoOpen(false)} onConfirm={(mode, target) => { setRedoOpen(false); restartSegments(mode, target) }} />}
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
          <div className="text-sm text-white/85">{(() => {
            const shot = project.shots.find((s) => s.segId === confirmDel.id)
            return shot ? `确定删除「${confirmDel.title}」吗？对应的镜头 ${no2(shot.no)} 及其 ${shot.video.versions.length} 个视频版本会一起删除，无法恢复。` : `确定删除「${confirmDel.title}」吗？删除后无法恢复。`
          })()}</div>
        </Modal>
      )}

      {/* 提取角色与场景确认 */}
      {extractOpen && (
        <GenerateConfirmModal
          title="确认提取角色与场景"
          what={`AI 将从 ${segs.length} 个剧本段落中识别主要角色和场景`}
          model={<ModelSelect value={extractModel} options={MODEL_OPTIONS.text} onChange={setExtractModel} variant="field" width={220} />}
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

    </div>
  )
}

/* ---------- 底部主按钮：区分「往前走」与「重做」 ---------- */
function BottomBar({
  assetStatus,
  disabled,
  onExtract,
  onNext,
}: {
  assetStatus: Project['assetStatus']
  disabled: boolean
  onExtract: () => void
  onNext: () => void
}) {
  // generating：等待中
  if (assetStatus === 'generating') {
    return (
      <ActionBar>
        <PillPrimary disabled>正在提取角色与场景…</PillPrimary>
      </ActionBar>
    )
  }
  // 已提取：直接往前
  if (assetStatus === 'done') {
    return (
      <ActionBar>
        <PillPrimary disabled={disabled} onClick={onNext}>
          下一步：角色与场景
        </PillPrimary>
      </ActionBar>
    )
  }
  // 未提取：首次提取（带价格）
  return (
    <ActionBar left="提取后可为角色和场景补全参考图，保持画面一致">
      <PillPrimary disabled={disabled} onClick={onExtract}>
        <span className="text-[15px] leading-none">✦</span>
        {COST.assetExtract} 下一步：提取角色与场景
      </PillPrimary>
    </ActionBar>
  )
}

/* ---------- 段落卡片 ---------- */
function ParagraphCard({
  seg,
  shot,
  onUpdate,
  onRenameTitle,
  onDelete,
  durationDisabled,
  onDurationPreview,
}: {
  durationDisabled: boolean
  onDurationPreview: (dur: number | undefined) => void
  seg: Segment
  shot?: Shot
  onUpdate: (patch: Partial<Pick<Segment, 'text' | 'dur'>>, options?: { silent?: boolean }) => void
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
    <div className="rounded-lg border border-white/10 bg-[#111213] p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums text-white/40">{no2(seg.no)}</span>
        {editing ? (
          <InlineRename
            value={seg.title}
            className="text-sm font-medium"
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
            className="rounded text-left text-sm font-medium leading-snug text-white transition-opacity hover:opacity-70"
          >
            {seg.title}
          </button>
        )}
        {!!shot?.outdated?.length && <span className="text-xs text-amber-300">镜头待更新</span>}
        <div className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
          <DurationStepper value={seg.dur!} variant="inline" size="sm" title={`段落 ${no2(seg.no)} 时长`}
            disabled={durationDisabled} disabledTooltip=""
            onPreview={onDurationPreview} onChange={(dur) => onUpdate({ dur })} />
        </div>
        <button
          type="button"
          title="删除段落"
          aria-label="删除段落"
          onClick={onDelete}
          className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/40"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="relative mt-2">
        {/* 收起态：点击正文展开编辑浮层 */}
        <button
          type="button"
          title="点击编辑原文"
          onClick={() => setOpen(true)}
          className="group/body block w-full cursor-pointer text-left"
        >
          <p
            ref={bodyRef}
            className="max-h-[7.5rem] overflow-hidden whitespace-pre-line text-xs leading-relaxed text-white/60 transition-colors group-hover/body:text-white/80"
          >
            {seg.text}
          </p>
          {overflow && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#111213] to-transparent" />
          )}
        </button>

        {/* 展开态：自动保存编辑浮层 */}
        {open && <SegmentTextEditor seg={seg} shot={shot} onSave={(text, silent) => onUpdate({ text }, { silent })} onClose={() => setOpen(false)} />}

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
  onAdd: (title: string, text: string, dur: number) => void
}) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [dur, setDur] = useState(15)
  const ok = title.trim() && text.trim()
  const boxCls =
    'w-full resize-none rounded-lg border border-transparent bg-black/40 px-3 py-2.5 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-brand/40'
  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[86vh] w-[520px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
        {/* 头部 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">新增剧本段落</div>
          <button className="text-white/50 transition-colors hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6">
          <div className="flex flex-col gap-2">
            <div className="text-[14px] text-white/60">段落编号（自动）</div>
            <div className="w-fit rounded-md bg-black/40 px-3 py-1.5 text-[15px] tabular-nums text-white">
              {no2(nextNo)}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <DurationStepper title="新增段落时长" value={dur} onChange={setDur} debounceMs={0} />
            <div className="text-[14px] text-white/60">段落标题</div>
            <input
              placeholder="例如：苏可推门对峙"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={boxCls}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-[14px] text-white/60">剧本原文</div>
            <textarea
              rows={5}
              placeholder="填入该段剧本原文，用于后续提取角色与生成镜头"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={boxCls}
            />
          </div>
        </div>

        {/* 底部 */}
        <div className="flex h-16 shrink-0 items-center justify-end gap-2 px-5 pb-5">
          <PillOutline onClick={onClose}>取消</PillOutline>
          <PillPrimary disabled={!ok} onClick={() => { onAdd(title, text, dur); onClose() }}>
            添加
          </PillPrimary>
        </div>
      </div>
    </Overlay>
  )
}


function SegmentTextEditor({ seg, shot, onSave, onClose }: { seg: Segment; shot?: Shot; onSave: (text: string, silent: boolean) => void; onClose: () => void }) {
  const [text, setText] = useState(seg.text)
  const [silent, setSilent] = useState(false)
  // Keep this edit together until closing so the checkbox also covers text typed before it was checked.
  const pending = useRef({ text, silent, onSave })
  pending.current = { text, silent, onSave }
  const saved = useRef(seg.text)
  const flush = () => {
    const latest = pending.current
    if (latest.text !== saved.current) { latest.onSave(latest.text, latest.silent); saved.current = latest.text }
  }
  useEffect(() => () => flush(), [])
  const ref = useRef<HTMLTextAreaElement>(null)
  const close = () => { flush(); onClose() }
  useLayoutEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 360)}px` }
  }, [text])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  return <>
    <div className="fixed inset-0 z-20" onMouseDown={close} />
    <div className="absolute -inset-x-1 -top-1 z-30 rounded-lg border border-white/15 bg-[#16181a]/95 px-4 py-3 shadow-xl shadow-black/50 backdrop-blur">
      <textarea ref={ref} autoFocus aria-label="段落原文" value={text} onChange={(e) => setText(e.target.value)} className="max-h-[360px] min-h-24 w-full resize-none bg-transparent text-[13px] leading-relaxed text-white/90 outline-none" />
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-2 text-xs">
        <span className="shrink-0 text-white/40">收起时自动保存</span>
        {shot && <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" className="accent-brand" checked={silent} onChange={(e) => setSilent(e.target.checked)} />只改了错别字，不需要更新镜头 {no2(shot.no)}</label>}
        <button onClick={close} className="text-white/60 hover:text-white">收起</button>
      </div>
    </div>
  </>
}
