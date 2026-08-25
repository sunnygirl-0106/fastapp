import { useState } from 'react'
import type { Project, Segment } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import { no2, fmtDur } from '@/utils/project'
import {
  ActionBar,
  Button,
  CellPopover,
  Diamond,
  GenerateConfirmModal,
  GeneratingState,
  InlineRename,
  Input,
  Label,
  Modal,
  ModelSelect,
  PageHeader,
  ReadCell,
  Textarea,
} from '@/components/ui'

export default function Step2Segments({ project }: { project: Project }) {
  const { generateSegments, startAssets, addSegment, updateSegmentTitle, deleteSegment } = useStore()
  const [regenOpen, setRegenOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [extractOpen, setExtractOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Segment | null>(null)
  const [regenModel, setRegenModel] = useState<string>(MODELS.text)
  const [extractModel, setExtractModel] = useState<string>(MODELS.text)

  const st = project.segStatus
  const segs = project.segments

  if (st === 'generating') {
    return (
      <>
        <GeneratingState
          title="正在拆解剧本"
          desc="AI 正在理解情节、角色和场景，请稍候。"
          phases={['正在识别情节变化…', '正在整理出场角色与场景…', '正在生成剧本段落…']}
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
              ＋ 新增剧本段落
            </Button>
          </>
        }
      />

      <div className="mb-3 text-[13px] text-muted">
        已生成 {segs.length} 个剧本段落 · 标题可直接编辑，点击其余单元格查看完整内容
      </div>

      <SegmentTable
        segs={segs}
        onRenameTitle={(id, v) => updateSegmentTitle(id, v)}
        onDelete={(s) => setConfirmDel(s)}
      />

      <ActionBar left="提取后可为角色和场景补全参考图，保持画面一致">
        <Button variant="primary" size="lg" disabled={segs.length === 0} onClick={() => setExtractOpen(true)}>
          提取角色与场景 · <Diamond />
          {COST.assetExtract}
        </Button>
      </ActionBar>

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

/* ---------- 剧本拆解表格 ---------- */

type ColKey = 'scene' | 'roles' | 'action' | 'timeline' | 'text'
const COLS: { key: ColKey; label: string; w: string }[] = [
  { key: 'scene', label: '场景', w: 'w-[110px]' },
  { key: 'roles', label: '出场角色', w: 'w-[130px]' },
  { key: 'action', label: '核心动作', w: 'w-[220px]' },
  { key: 'timeline', label: '时间线', w: 'w-[200px]' },
  { key: 'text', label: '原文', w: 'w-[320px]' },
]

type PopState = { rect: DOMRect; label: string; value: string } | null

function SegmentTable({
  segs,
  onRenameTitle,
  onDelete,
}: {
  segs: Segment[]
  onRenameTitle: (id: string, v: string) => void
  onDelete: (s: Segment) => void
}) {
  const [pop, setPop] = useState<PopState>(null)

  const openPop = (e: React.MouseEvent, label: string, value?: string) => {
    if (!value || !value.trim()) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPop({ rect, label, value })
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line/70 bg-panel">
      <table className="w-full min-w-[1040px] table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-[56px]" />
          <col className="w-[170px]" />
          <col className="w-[72px]" />
          {COLS.map((c) => (
            <col key={c.key} className={c.w} />
          ))}
          <col className="w-[44px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-panel2/70 text-[12px] font-medium text-faint">
            <th className="whitespace-nowrap px-4 py-3">段号</th>
            <th className="whitespace-nowrap px-3 py-3">标题</th>
            <th className="whitespace-nowrap px-3 py-3">时长</th>
            {COLS.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-3">
                {c.label}
              </th>
            ))}
            <th className="px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {segs.map((s) => (
            <tr
              key={s.id}
              className="group border-b border-line/50 align-top last:border-b-0 hover:bg-panel2/50"
            >
              <td className="px-4 py-3 text-[13px] tabular-nums text-faint">{no2(s.no)}</td>
              <td className="px-3 py-2.5">
                <TitleCell value={s.title} onCommit={(v) => onRenameTitle(s.id, v.trim() || s.title)} />
              </td>
              <td className="px-3 py-3 text-[13px] tabular-nums text-muted">{fmtDur(s.dur)}</td>
              {COLS.map((c) => {
                const v = s[c.key]
                return (
                  <td key={c.key} className="px-3 py-2.5">
                    <ReadCell value={v} onClick={(e) => openPop(e, c.label, v)} />
                  </td>
                )
              })}
              <td className="px-2 py-3">
                <button
                  type="button"
                  title="删除段落"
                  onClick={() => onDelete(s)}
                  className="rounded-md p-1.5 text-faint opacity-0 transition-colors hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pop && <CellPopover {...pop} onClose={() => setPop(null)} />}
    </div>
  )
}

/* 标题：可就地编辑（单击进入编辑） */
function TitleCell({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <InlineRename
        value={value}
        onCommit={(v) => {
          onCommit(v)
          setEditing(false)
        }}
        className="w-full text-[14px] font-medium"
      />
    )
  }
  return (
    <button
      type="button"
      title="点击编辑标题"
      onClick={() => setEditing(true)}
      className="w-full rounded-md text-left text-[14px] font-medium leading-snug transition-colors hover:text-brand"
    >
      {value}
    </button>
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
