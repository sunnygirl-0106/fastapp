import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import type { Project, Shot, ShotVideo } from '@/types'
import { SHOT_FIELDS, SHOT_GROUPS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST } from '@/services/generation'
import { no2, fmtDur } from '@/utils/project'
import { useAutoSave } from '@/hooks/useAutoSave'
import {
  ActionBar,
  Button,
  Diamond,
  Drawer,
  GeneratingState,
  MenuItem,
  PageHeader,
  Popover,
  SaveBadge,
  StaleNotice,
  Textarea,
  fmt,
} from '@/components/ui'
import GenShotModal from './GenShotModal'
import VideoConfirmModal from './VideoConfirmModal'

function videoStateInfo(v: ShotVideo): { text: string; cls: string; dot: string } {
  if (v.state === 'generating') return { text: '正在生成视频', cls: 'text-amber-400', dot: 'bg-amber-400' }
  if (v.state === 'done' && v.stale) return { text: '需重新生成', cls: 'text-amber-400', dot: 'bg-amber-400' }
  if (v.state === 'done') return { text: '视频已生成', cls: 'text-brand', dot: 'bg-brand' }
  return { text: '尚未生成视频', cls: 'text-faint', dot: 'bg-faint' }
}

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? String(k)

// 时间线展示：拆成固定三段（0–5 / 5–10 / 10–15 秒），不足补空行以稳定行高
function parseTimeline(raw: string): string[] {
  const lines = (raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  return [0, 1, 2].map((i) => lines[i] ?? '')
}

// 5 列网格：选择 44 / 镜头 150 / 画面 45fr / 时间线 40fr / 操作 56
const GRID = 'grid grid-cols-[44px_150px_minmax(0,45fr)_minmax(0,40fr)_56px]'

export default function Step4Shots({ project }: { project: Project }) {
  const { generateShots, deleteShot, regenerateShot, startVideos } = useStore()
  const st = project.shotStatus
  const shots = project.shots

  const [genOpen, setGenOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ s: Shot; top: number; left: number } | null>(null)
  const [videoConfirm, setVideoConfirm] = useState<string[] | null>(null)

  // 镜头生成完成后，默认选中所有尚未生成视频（或已失效）的镜头
  useEffect(() => {
    if (st !== 'done') return
    setSel(shots.filter((s) => s.video.state === 'none' || s.video.stale).map((s) => s.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, shots.length])

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  if (st === 'generating') {
    return (
      <>
        <GeneratingState
          title="正在生成镜头设计"
          desc="AI 正在把剧本段落转化为可生成视频的镜头描述。"
          phases={['正在设计画面构图…', '正在整理人物动作…', '正在检查镜头连贯性…']}
        />
        <ActionBar>
          <Button variant="primary" size="lg" disabled>
            正在生成镜头设计…
          </Button>
        </ActionBar>
      </>
    )
  }

  const detailShot = detailId ? shots.find((s) => s.id === detailId) ?? null : null

  return (
    <div>
      <PageHeader
        title="镜头设计"
        desc={`已生成 ${shots.length} 个镜头，预计成片时长约 ${shots.length * 15} 秒。`}
        right={
          <button
            onClick={() => setGenOpen(true)}
            className="text-[13px] text-muted transition-colors hover:text-white"
          >
            重新生成镜头
          </button>
        }
      />

      {project.shotStale && (
        <StaleNotice
          text="角色与场景已更新，建议重新生成镜头。"
          actionText="重新生成镜头"
          onAction={() => setGenOpen(true)}
        />
      )}

      {/* 表头 */}
      <div className={`${GRID} items-center border-b border-line/60 px-1 pb-2 text-[12px] text-faint`}>
        <div className="text-center">选择</div>
        <div className="px-3">镜头</div>
        <div className="px-3">画面</div>
        <div className="px-3">时间线</div>
        <div className="text-center">操作</div>
      </div>

      <div className="mt-2 space-y-2">
        {shots.map((s) => (
          <ShotRow
            key={s.id}
            shot={s}
            selected={sel.includes(s.id)}
            active={detailId === s.id}
            onToggleSelect={() => toggle(s.id)}
            onOpenDetail={() => setDetailId(s.id)}
            onCommit={(patch) => useStore.getState().updateShot(s.id, patch)}
            onMenu={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setMenu({ s, top: r.bottom + 4, left: r.left - 168 })
            }}
          />
        ))}
      </div>

      <ActionBar left={`已选择 ${sel.length}/${shots.length} 个镜头`}>
        <Button variant="primary" size="lg" disabled={!sel.length} onClick={() => setVideoConfirm(sel)}>
          {sel.length ? (
            <>
              生成 {sel.length} 段视频 · <Diamond />
              {fmt(sel.length * COST.videoEach)}
            </>
          ) : (
            '请至少选择一个镜头'
          )}
        </Button>
      </ActionBar>

      {/* 右侧详情面板：key 切换镜头时重挂载，卸载前自动 flush */}
      {detailShot && (
        <ShotDetailDrawer key={detailShot.id} shot={detailShot} onClose={() => setDetailId(null)} />
      )}

      {/* 重新生成镜头（不切页） */}
      {genOpen && (
        <GenShotModal
          project={project}
          onClose={() => setGenOpen(false)}
          onConfirm={(segNos) => {
            setGenOpen(false)
            generateShots(segNos)
          }}
        />
      )}

      {/* 行 ⋯ 菜单：仅生成 / 删除 */}
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { regenerateShot(menu.s.id); setMenu(null) }}>重新生成该镜头</MenuItem>
          <MenuItem onClick={() => { setVideoConfirm([menu.s.id]); setMenu(null) }}>生成该镜头视频</MenuItem>
          <MenuItem danger onClick={() => { deleteShot(menu.s.id); setMenu(null) }}>
            删除镜头
          </MenuItem>
        </Popover>
      )}

      {/* 确认生成视频 → 先置 generating，再切到第五步 */}
      {videoConfirm && (
        <VideoConfirmModal
          count={videoConfirm.length}
          balance={project.balance}
          onClose={() => setVideoConfirm(null)}
          onConfirm={() => {
            const ids = videoConfirm
            setVideoConfirm(null)
            startVideos(ids)
          }}
        />
      )}
    </div>
  )
}

/* ---------- 表格行：选择 / 镜头 / 画面 / 时间线 / 操作 ---------- */
function ShotRow({
  shot,
  selected,
  active,
  onToggleSelect,
  onOpenDetail,
  onCommit,
  onMenu,
}: {
  shot: Shot
  selected: boolean
  active: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
  onCommit: (patch: Partial<Shot>) => void
  onMenu: (e: React.MouseEvent) => void
}) {
  const vi = videoStateInfo(shot.video)
  const tl = parseTimeline(shot.timeline)

  return (
    <div
      onClick={onOpenDetail}
      className={`${GRID} min-h-[120px] cursor-pointer items-stretch rounded-xl border bg-panel transition-colors ${
        active ? 'border-transparent ring-1 ring-brand/50' : 'border-line hover:border-line'
      } ${selected ? '' : 'opacity-60'}`}
    >
      {/* 选择 */}
      <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="accent-brand" />
      </div>

      {/* 镜头信息 */}
      <div className="flex flex-col justify-center gap-1 px-3 py-3">
        <span className="text-[14px] font-medium tabular-nums text-white/90">镜头 {no2(shot.no)}</span>
        <span className="text-[12px] text-faint">{fmtDur('15s')}</span>
        <span className={`inline-flex items-center gap-1.5 text-[12px] ${vi.cls}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${vi.dot}`} />
          {vi.text}
        </span>
        {!selected && <span className="text-[12px] text-faint">不生成</span>}
      </div>

      {/* 画面（就地编辑，最多 3 行） */}
      <InlineCellEditor
        value={shot.shot}
        onCommit={(v) => onCommit({ shot: v })}
        readView={<div className="line-clamp-3 whitespace-pre-line">{shot.shot}</div>}
      />

      {/* 时间线（就地编辑；只读态固定三段） */}
      <InlineCellEditor
        value={shot.timeline}
        onCommit={(v) => onCommit({ timeline: v })}
        readView={
          <div className="space-y-1">
            {tl.map((line, i) => (
              <div key={i} className="line-clamp-1 text-white/80">
                {line || ' '}
              </div>
            ))}
          </div>
        }
      />

      {/* 操作 */}
      <div className="flex items-start justify-center pt-3" onClick={(e) => e.stopPropagation()}>
        <button
          className="rounded-md px-1.5 py-1 text-muted transition-colors hover:bg-panel2 hover:text-white"
          onClick={onMenu}
          title="更多"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  )
}

/* ---------- 单元格就地编辑：点击进入编辑，停输入自动保存、失焦立即保存 ---------- */
function InlineCellEditor({
  value,
  onCommit,
  readView,
}: {
  value: string
  onCommit: (v: string) => void
  readView: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { status, schedule, flush } = useAutoSave((v) => onCommit(v))

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const start = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(value)
    setEditing(true)
  }

  return (
    <div className="relative px-3 py-3 text-[13px] leading-relaxed text-white/90">
      <div className="pointer-events-none absolute right-2 top-1">
        <SaveBadge status={status} />
      </div>
      {editing ? (
        <Textarea
          ref={ref}
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            setDraft(e.target.value)
            schedule(e.target.value)
          }}
          onBlur={() => {
            flush()
            setEditing(false)
          }}
          className="h-[96px] resize-none text-[13px]"
        />
      ) : (
        <div onClick={start} className="cursor-text">
          {readView}
        </div>
      )}
    </div>
  )
}

/* ---------- 右侧详情面板：分组字段 + 更多设定折叠；全自动保存，无保存按钮 ---------- */
function ShotDetailDrawer({ shot, onClose }: { shot: Shot; onClose: () => void }) {
  const updateShot = useStore((s) => s.updateShot)
  const [draft, setDraft] = useState<Record<string, string>>(() => snapshot(shot))
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [moreOpen, setMoreOpen] = useState(false)

  const { status, schedule } = useAutoSave(() => updateShot(shot.id, draftRef.current as Partial<Shot>))

  const setField = (k: keyof Shot, v: string) => {
    setDraft((d) => {
      const nd = { ...d, [k]: v }
      draftRef.current = nd
      return nd
    })
    schedule(v)
  }

  const renderFields = (fields: (keyof Shot)[], dim: boolean) => (
    <div className="space-y-2.5">
      {fields.map((k) => (
        <div key={k} className="grid grid-cols-[76px_1fr] items-start gap-3">
          <div className="pt-2 text-[13px] text-muted">{labelOf(k)}</div>
          <Textarea
            dim={dim}
            rows={k === 'timeline' || k === 'shot' || k === 'motion' ? 3 : 2}
            value={draft[k]}
            onChange={(e) => setField(k, e.target.value)}
          />
        </div>
      ))}
    </div>
  )

  return (
    <Drawer title={`镜头 ${no2(shot.no)}`} status={status} onClose={onClose} width={600}>
      {SHOT_GROUPS.map((g, gi) => {
        const collapsible = gi === SHOT_GROUPS.length - 1 // 更多设定：默认收起
        if (collapsible) {
          return (
            <div key={g.title} className="mt-2">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 py-2 text-[13px] font-medium text-faint transition-colors hover:text-muted"
              >
                <ChevronDown size={14} className={`transition-transform ${moreOpen ? '' : '-rotate-90'}`} />
                {g.title}
              </button>
              {moreOpen && <div className="pt-1">{renderFields(g.fields, true)}</div>}
            </div>
          )
        }
        return (
          <div key={g.title} className="mb-5">
            <div className="mb-2 text-[13px] font-medium text-muted">{g.title}</div>
            {renderFields(g.fields, false)}
          </div>
        )
      })}
    </Drawer>
  )
}

function snapshot(s: Shot): Record<string, string> {
  const o: Record<string, string> = {}
  SHOT_FIELDS.forEach((f) => (o[f.key] = String(s[f.key] ?? '')))
  return o
}
