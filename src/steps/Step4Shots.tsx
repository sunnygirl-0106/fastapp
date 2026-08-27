import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ListFilter, MoreHorizontal, SlidersHorizontal, X } from 'lucide-react'
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

// 模糊匹配：先看是否包含子串，再退化为顺序子序列匹配
function fuzzy(needle: string, hay: string): boolean {
  const n = String(needle ?? '').toLowerCase().replace(/\s+/g, '')
  if (!n) return true
  const h = String(hay ?? '').toLowerCase()
  if (h.includes(n)) return true
  let i = 0
  for (const ch of h) {
    if (ch === n[i]) i++
    if (i === n.length) return true
  }
  return false
}

// 每个字段列的「最小宽度 / 伸缩权重」：列少时按权重铺满可用宽度，列多时到最小宽度后横向滚动
const COL_W: Partial<Record<keyof Shot, { min: number; grow: number }>> = {
  shot: { min: 240, grow: 3 },
  timeline: { min: 220, grow: 2.4 },
  action: { min: 160, grow: 1.6 },
  motion: { min: 160, grow: 1.6 },
  subject: { min: 120, grow: 1 },
  anchor: { min: 140, grow: 1.2 },
  blocking: { min: 150, grow: 1.2 },
  continuity: { min: 150, grow: 1.2 },
  forbid: { min: 150, grow: 1.2 },
  background: { min: 140, grow: 1.2 },
}

// 拼自适应网格列：选择 44 / 镜头 150 / …可见字段列（minmax 伸缩）… / 操作 56
function buildGridTemplate(cols: { key: keyof Shot }[]): string {
  const fields = cols.map((c) => {
    const w = COL_W[c.key] ?? { min: 160, grow: 1.2 }
    return `minmax(${w.min}px, ${w.grow}fr)`
  })
  return ['44px', '150px', ...fields, '56px'].join(' ')
}

export default function Step4Shots({ project }: { project: Project }) {
  const { generateShots, deleteShot, regenerateShot, startVideos } = useStore()
  const st = project.shotStatus
  const shots = project.shots

  const [genOpen, setGenOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ s: Shot; top: number; left: number } | null>(null)
  const [videoConfirm, setVideoConfirm] = useState<string[] | null>(null)

  // 列可见性：默认与现状一致（画面 + 时间线）；镜头/选择/操作为固定列，不参与开关
  const [visibleFields, setVisibleFields] = useState<(keyof Shot)[]>(['shot', 'timeline'])
  const [fieldsAnchor, setFieldsAnchor] = useState<{ top: number; left: number } | null>(null)
  // 筛选条件（多条件「并且」关系）
  const [filters, setFilters] = useState<{ field: keyof Shot; value: string }[]>([])
  const [filterAnchor, setFilterAnchor] = useState<{ top: number; left: number } | null>(null)
  const [draftField, setDraftField] = useState<keyof Shot>('shot')
  const [draftValue, setDraftValue] = useState('')
  const [flashId, setFlashId] = useState<string | null>(null)

  // 从筛选预览里点某条镜头：收起筛选面板 → 滚动定位 → 光波闪动示意
  const pickHit = (id: string) => {
    setFilterAnchor(null)
    setFlashId(id)
  }
  useEffect(() => {
    if (!flashId) return
    document.getElementById(`shot-${flashId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFlashId(null), 2900)
    return () => clearTimeout(t)
  }, [flashId])

  // 按 SHOT_FIELDS 原序取可见列；按「且」关系过滤出命中镜头
  const cols = SHOT_FIELDS.filter((f) => visibleFields.includes(f.key))
  const gridTemplate = buildGridTemplate(cols)
  const shownShots = shots.filter((s) => filters.every((f) => fuzzy(f.value, String(s[f.field] ?? ''))))

  const toggleField = (k: keyof Shot) =>
    setVisibleFields((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))
  const addFilter = () => {
    const v = draftValue.trim()
    if (!v) return
    setFilters((fs) => [...fs, { field: draftField, value: v }])
    setDraftValue('')
  }

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

      {/* 工具条：字段 / 筛选 + 已加条件 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setFieldsAnchor({ top: r.bottom + 6, left: r.left })
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[13px] text-white/90 transition-colors hover:border-brand/60"
        >
          <SlidersHorizontal size={14} className="text-faint" />
          字段
          {visibleFields.length < SHOT_FIELDS.length && (
            <span className="tabular-nums text-[12px] text-brand">
              {visibleFields.length}/{SHOT_FIELDS.length}
            </span>
          )}
        </button>

        <button
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setFilterAnchor({ top: r.bottom + 6, left: r.left })
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[13px] text-white/90 transition-colors hover:border-brand/60"
        >
          <ListFilter size={14} className="text-faint" />
          筛选
          {filters.length > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-medium tabular-nums text-black">
              {filters.length}
            </span>
          )}
        </button>

        {filters.map((f, i) => (
          <span
            key={`${f.field}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1 text-[12px] text-brand"
          >
            <span className="text-muted">{labelOf(f.field)}</span>
            <span className="text-white/80">{f.value}</span>
            <button
              onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}
              className="text-muted transition-colors hover:text-white"
              title="移除该条件"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        {filters.length > 0 && (
          <>
            <button
              onClick={() => setFilters([])}
              className="text-[12px] text-muted transition-colors hover:text-white"
            >
              清除筛选
            </button>
            <span className="text-[12px] text-faint">命中 {shownShots.length} 条</span>
          </>
        )}
      </div>

      {/* 表格：列少时自适应铺满，列多时横向滚动 */}
      <div className="overflow-x-auto">
        <div className="w-full min-w-[720px]">
          {/* 表头 */}
          <div
            className="grid items-center border-b border-line/60 px-1 pb-2 text-[12px] text-faint"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="text-center">选择</div>
            <div className="px-3">镜头</div>
            {cols.map((c) => (
              <div key={c.key} className="px-3">
                {c.label}
              </div>
            ))}
            <div className="text-center">操作</div>
          </div>

          {shownShots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <div className="text-[13px] text-muted">没有符合条件的镜头</div>
              <button
                onClick={() => setFilters([])}
                className="text-[13px] text-brand transition-colors hover:text-brand-dim"
              >
                清除筛选
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {shownShots.map((s) => (
                <ShotRow
                  key={s.id}
                  shot={s}
                  cols={cols}
                  gridTemplate={gridTemplate}
                  selected={sel.includes(s.id)}
                  active={detailId === s.id}
                  flash={flashId === s.id}
                  onToggleSelect={() => toggle(s.id)}
                  onCommit={(patch) => useStore.getState().updateShot(s.id, patch)}
                  onMenu={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setMenu({ s, top: r.bottom + 4, left: r.left - 168 })
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ActionBar
        left={
          <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-muted transition-colors hover:text-white">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-brand"
              checked={shownShots.length > 0 && shownShots.every((s) => sel.includes(s.id))}
              onChange={(e) => {
                const ids = shownShots.map((s) => s.id)
                setSel((prev) =>
                  e.target.checked
                    ? Array.from(new Set([...prev, ...ids]))
                    : prev.filter((id) => !ids.includes(id)),
                )
              }}
            />
            全选
            <span className="text-faint">·</span>
            已选择 {sel.length}/{shots.length} 个镜头
          </label>
        }
      >
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
          <MenuItem onClick={() => { setDetailId(menu.s.id); setMenu(null) }}>编辑镜头详情</MenuItem>
          <MenuItem onClick={() => { regenerateShot(menu.s.id); setMenu(null) }}>重新生成该镜头</MenuItem>
          <MenuItem onClick={() => { setVideoConfirm([menu.s.id]); setMenu(null) }}>生成该镜头视频</MenuItem>
          <MenuItem danger onClick={() => { deleteShot(menu.s.id); setMenu(null) }}>
            删除镜头
          </MenuItem>
        </Popover>
      )}

      {/* 字段可见性 */}
      {fieldsAnchor && (
        <Popover anchor={fieldsAnchor} onClose={() => setFieldsAnchor(null)} width={360}>
          <div className="px-4 py-3.5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-white">显示字段</span>
              <button
                onClick={() =>
                  setVisibleFields((v) =>
                    v.length === SHOT_FIELDS.length ? ['shot', 'timeline'] : SHOT_FIELDS.map((f) => f.key),
                  )
                }
                className="text-[13px] text-muted transition-colors hover:text-white"
              >
                {visibleFields.length === SHOT_FIELDS.length ? '重置' : '全选'}
              </button>
            </div>
            <div className="space-y-4">
              {SHOT_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="mb-2.5 text-[12px] text-faint">{g.title}</div>
                  <div className="flex flex-wrap gap-2.5">
                    {g.fields.map((k) => {
                      const on = visibleFields.includes(k)
                      return (
                        <button
                          key={k}
                          onClick={() => toggleField(k)}
                          className={`rounded-xl border px-4 py-2 text-[14px] transition-colors ${
                            on
                              ? 'border-brand/45 bg-brand/[0.08] text-[#c9f5ee]'
                              : 'border-white/10 bg-transparent text-white/30 hover:border-line hover:text-muted'
                          }`}
                        >
                          {labelOf(k)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Popover>
      )}

      {/* 筛选条件：输入后实时预览命中结果 */}
      {filterAnchor && (
        <Popover anchor={filterAnchor} onClose={() => setFilterAnchor(null)} width={440}>
          <div className="px-4 py-3.5">
            <div className="mb-3 text-[15px] font-semibold text-white">筛选条件</div>
            <FilterComposer
              field={draftField}
              value={draftValue}
              onField={setDraftField}
              onValue={setDraftValue}
              onAdd={addFilter}
            />
            <FilterPreview
              shots={shots}
              filters={filters}
              draftField={draftField}
              draftValue={draftValue}
              onPick={pickHit}
            />
          </div>
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
  cols,
  gridTemplate,
  selected,
  active,
  flash,
  onToggleSelect,
  onCommit,
  onMenu,
}: {
  shot: Shot
  cols: { key: keyof Shot; label: string }[]
  gridTemplate: string
  selected: boolean
  active: boolean
  flash?: boolean
  onToggleSelect: () => void
  onCommit: (patch: Partial<Shot>) => void
  onMenu: (e: React.MouseEvent) => void
}) {
  const vi = videoStateInfo(shot.video)

  return (
    <div
      id={`shot-${shot.id}`}
      className={`grid min-h-[120px] items-stretch rounded-xl border bg-panel transition-colors ${
        active ? 'border-transparent ring-1 ring-brand/50' : 'border-line hover:border-line'
      } ${flash ? 'row-flash' : ''}`}
      style={{ gridTemplateColumns: gridTemplate }}
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

      {/* 可见字段列（均可就地编辑） */}
      {cols.map((c) => (
        <InlineCellEditor
          key={c.key}
          value={String(shot[c.key] ?? '')}
          onCommit={(v) => onCommit({ [c.key]: v } as Partial<Shot>)}
          readView={
            c.key === 'timeline' ? (
              <div className="space-y-1">
                {parseTimeline(shot.timeline).map((line, i) => (
                  <div key={i} className="line-clamp-1 text-white/80">
                    {line || ' '}
                  </div>
                ))}
              </div>
            ) : (
              <div className="line-clamp-3 whitespace-pre-line">{String(shot[c.key] ?? '')}</div>
            )
          }
        />
      ))}

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

/* ---------- 筛选组合框：字段选择 + 关键词，一行显示，回车添加 ---------- */
function FilterComposer({
  field,
  value,
  onField,
  onValue,
  onAdd,
}: {
  field: keyof Shot
  value: string
  onField: (k: keyof Shot) => void
  onValue: (v: string) => void
  onAdd: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-center rounded-xl border border-line bg-panel2 focus-within:border-brand/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap px-3.5 py-2.5 text-[14px] text-white/90"
      >
        {labelOf(field)}
        <ChevronDown size={14} className={`text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <span className="h-5 w-px shrink-0 bg-line" />
      <input
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAdd()
        }}
        placeholder="输入关键词，回车添加"
        className="w-full bg-transparent px-3.5 py-2.5 text-[14px] outline-none placeholder:text-faint"
      />
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-48 overflow-auto rounded-lg border border-line bg-panel py-1 shadow-2xl animate-fadeUp">
          {SHOT_FIELDS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                onField(f.key)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-line ${
                f.key === field ? 'text-brand' : 'text-white/90'
              }`}
            >
              <span>{f.label}</span>
              {f.key === field && <Check size={14} className="ml-2 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- 筛选实时预览：结合已加条件 + 当前草稿，实时列出命中镜头 ---------- */
function FilterPreview({
  shots,
  filters,
  draftField,
  draftValue,
  onPick,
}: {
  shots: Shot[]
  filters: { field: keyof Shot; value: string }[]
  draftField: keyof Shot
  draftValue: string
  onPick: (id: string) => void
}) {
  const draft = draftValue.trim()
  // 未输入关键词且无已加条件时，不默认罗列全部镜头
  if (!draft && filters.length === 0) {
    return (
      <div className="mt-3.5 border-t border-line pt-3">
        <div className="py-4 text-center text-[12px] text-faint">输入关键词，实时预览命中的镜头</div>
      </div>
    )
  }

  const hits = shots.filter(
    (s) =>
      filters.every((f) => fuzzy(f.value, String(s[f.field] ?? ''))) &&
      (!draft || fuzzy(draft, String(s[draftField] ?? ''))),
  )

  return (
    <div className="mt-3.5 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between text-[12px] text-faint">
        <span>命中结果</span>
        <span className="tabular-nums">
          {hits.length}/{shots.length} 个镜头
        </span>
      </div>
      {hits.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-faint">没有符合条件的镜头</div>
      ) : (
        <div className="-mx-1 max-h-[240px] space-y-0.5 overflow-y-auto px-1">
          {hits.map((s) => {
            const snippet = String(s[draftField] ?? '').replace(/\s+/g, ' ').trim()
            return (
              <button
                key={s.id}
                type="button"
                title="定位到该镜头"
                onClick={() => onPick(s.id)}
                className="flex w-full items-baseline gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-line/50"
              >
                <span className="shrink-0 text-[13px] font-medium tabular-nums text-brand">#{s.no}</span>
                <span className="text-faint">·</span>
                <span className="line-clamp-1 text-[13px] text-white/80">{snippet || '（该字段为空）'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------- 单元格就地编辑：点击后原地浮出编辑框，停输入自动保存 ---------- */
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
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { status, schedule, flush } = useAutoSave((v) => onCommit(v))

  const fit = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 132), 360)}px`
  }

  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (el) {
      fit(el)
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  const start = (e: React.MouseEvent) => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width })
    setDraft(value)
    setEditing(true)
  }

  const close = () => {
    flush()
    setEditing(false)
  }

  return (
    <div className="px-3 py-3 text-[13px] leading-relaxed text-white/90">
      <div onClick={start} className="cursor-text">
        {readView}
      </div>

      {editing && rect && (
        <div className="fixed inset-0 z-50" onMouseDown={close}>
          <div
            className="absolute flex flex-col overflow-hidden rounded-xl border border-brand/55 bg-panel shadow-2xl ring-1 ring-brand/15"
            style={{
              top: rect.top - 6,
              left: Math.max(8, Math.min(rect.left - 6, window.innerWidth - rect.width - 20)),
              width: Math.max(rect.width + 12, 320),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <textarea
              ref={ref}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                fit(e.target)
                schedule(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditing(false)
                }
              }}
              className="w-full resize-none bg-transparent px-4 py-3 text-[13.5px] leading-relaxed text-white/90 outline-none placeholder:text-faint"
              placeholder="填写该镜头字段…"
            />
            <div className="flex items-center justify-between border-t border-line/60 px-4 py-2">
              <span className="text-[12px] text-faint">自动保存</span>
              <div className="flex items-center gap-2">
                <SaveBadge status={status} />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    close()
                  }}
                  className="text-[12px] text-muted transition-colors hover:text-white"
                >
                  完成
                </button>
              </div>
            </div>
          </div>
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
