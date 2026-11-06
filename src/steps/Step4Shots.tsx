import TimelineReflow from '@/components/TimelineReflow'
import { normalizeTimeline } from '@/utils/timeline'
import { useTimelineReflow } from '@/hooks/useTimelineReflow'
import { timelineReflowRevision } from '@/store/workflowStore'
import { Checkbox } from '@/components/ui'
import ShotTextEditor from '@/components/ShotTextEditor'
import MentionText from '@/components/MentionText'
import { timelineLines } from '@/services/parse'
import DurationStepper from '@/components/DurationStepper'
import NoticeBar from '@/components/NoticeBar'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Columns2, Filter, LoaderCircle, MoreHorizontal, Pencil, RotateCcw, Video, Trash2, X } from 'lucide-react'
import type { Project, Shot, ShotVideo } from '@/types'
import { SHOT_FIELDS, SHOT_GROUPS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, videoCost } from '@/services/generation'
import { no2, fmtDur, outdatedDesignShots, shotOutdatedReasons, ungeneratedSegments, shotGenerationBlocked } from '@/utils/project'
import { useAutoSave } from '@/hooks/useAutoSave'
import { getUiScale } from '@/utils/layout'
import {
  ActionBar,
  Button,
  Modal,
  GeneratingState,
  MenuItem,
  PageHeader,
  Popover,
  SaveBadge,
  fmt,
} from '@/components/ui'
import GenShotModal from './GenShotModal'
import VideoConfirmModal from './VideoConfirmModal'

// 浅青渐变主按钮（与首页 / 弹窗 CTA 一致）
const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

function PillOutline({ children, onClick, disabled, title, amber }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; amber?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border px-5 text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-40 ${amber ? 'border-amber-400/40 text-amber-300' : 'border-white/20 text-white'}`}
    >
      {children}
    </button>
  )
}

function PillCTA({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={CTA_GRADIENT}
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function VideoStatusLabel({ video }: { video: ShotVideo }) {
  const generating = video.state === 'generating'
  const done = video.state === 'done'
  const Icon = generating ? LoaderCircle : done ? Check : Video
  return (
    <span className={`inline-flex h-[1.375rem] w-fit shrink-0 items-center gap-1.5 whitespace-nowrap text-[0.75rem] leading-none ${
      generating ? 'text-[#dfc18f]' : done ? 'text-brand/80' : 'text-white/50'
    }`}>
      <Icon size="0.8125rem" strokeWidth={1.7} aria-hidden="true" className={`shrink-0 ${generating ? 'motion-safe:animate-spin' : ''}`} />
      {generating ? '视频生成中' : done ? '视频已生成' : '视频待生成'}
    </span>
  )
}

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? String(k)

// 默认可见列：画面与节奏 + 人物与空间（共 7 列）；「更多设定」默认隐藏，可在「字段」里开启
const DEFAULT_VISIBLE_FIELDS = SHOT_GROUPS.slice(0, 2).flatMap((g) => g.fields)

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

// 使用紧凑的默认宽度，不随屏幕或字段数量拉伸；用户仍可独立拖宽每列。
const COL_W: Partial<Record<keyof Shot, number>> = {
  shot: 240, timeline: 240, action: 160, motion: 160, subject: 160,
  anchor: 160, blocking: 160, continuity: 160, forbid: 160, background: 160,
}

// 新布局单独记忆宽度，避免之前加宽过的列覆盖紧凑默认值。
const COLUMN_WIDTHS_KEY = 'phanthy-shot-column-widths-compact-v1'
const TIMELINE_WIDTH_MIGRATION_KEY = 'phanthy-timeline-width-v15'
const FIXED_COLUMNS = { selection: 40, shot: 176, actions: 64 }
type ResizeField = keyof Shot | 'shotInfo'
type ColumnWidths = Partial<Record<ResizeField, number>>
const defaultWidth = (key: ResizeField) => key === 'shotInfo' ? FIXED_COLUMNS.shot : COL_W[key]!

function readColumnWidths(): ColumnWidths {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMN_WIDTHS_KEY) ?? '{}')
    if (!localStorage.getItem(TIMELINE_WIDTH_MIGRATION_KEY)) {
      if (stored && typeof stored === 'object') delete stored.timeline
      localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(stored))
      localStorage.setItem(TIMELINE_WIDTH_MIGRATION_KEY, '1')
    }
    const widths: ColumnWidths = {}
    for (const key of ['shotInfo', ...SHOT_FIELDS.map(f => f.key)] as ResizeField[]) {
      const width = stored?.[key]
      if (typeof width === 'number' && Number.isFinite(width) && width >= defaultWidth(key)) widths[key] = width
    }
    return widths
  } catch { return {} }
}

export default function Step4Shots({ project }: { project: Project }) {
  const { startShots, deleteShot, regenerateShot, startVideos } = useStore()
  const pending = outdatedDesignShots(project)
  const missing = ungeneratedSegments(project)
  const blocked = shotGenerationBlocked(project)
  const [initialSelection, setInitialSelection] = useState<number[] | undefined>()
  const openGeneration = (segNos?: number[]) => { setInitialSelection(segNos); setGenOpen(true) }
  const st = project.shotStatus
  const shots = project.shots

  const [durationPreview, setDurationPreview] = useState<Record<string, number | undefined>>({})
  const [genOpen, setGenOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const selectionHistory = useRef<{ projectId: string; shots: Map<string, { missingVideo: boolean; reasons: string }> }>({ projectId: '', shots: new Map() })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [deleteFor, setDeleteFor] = useState<Shot | null>(null)
  const [menu, setMenu] = useState<{ s: Shot; top: number; left: number } | null>(null)
  const [videoConfirm, setVideoConfirm] = useState<string[] | null>(null)

  // 列可见性：默认显示前两组共 7 列；镜头（含时长）/选择/操作为常驻列，不参与开关
  const [visibleFields, setVisibleFields] = useState<(keyof Shot)[]>(DEFAULT_VISIBLE_FIELDS)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(readColumnWidths)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [resizingField, setResizingField] = useState<ResizeField | null>(null)
  const resize = useRef<{ key: ResizeField; x: number; width: number; pointerId: number } | null>(null)
  useEffect(() => {
    try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths)) } catch { /* 浏览器禁止存储时仍可调整 */ }
  }, [columnWidths])
  useLayoutEffect(() => {
    if (!resizingField) return
    const { cursor, userSelect } = document.body.style
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => { document.body.style.cursor = cursor; document.body.style.userSelect = userSelect }
  }, [resizingField])
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
  const uiScale = getUiScale()
  const widths = cols.map(c => columnWidths[c.key] ?? defaultWidth(c.key))
  const tracks = [FIXED_COLUMNS.selection, columnWidths.shotInfo ?? FIXED_COLUMNS.shot, ...widths, FIXED_COLUMNS.actions]
  const gridWidth = tracks.reduce((sum, width) => sum + width, 0) * uiScale
  const gridTemplate = tracks.map(width => `${width * uiScale}px`).join(' ')
  const shownShots = shots.filter((s) => filters.every((f) => fuzzy(f.value, String(s[f.field] ?? ''))))

  // 「操作」列仅在表格横向溢出（内容撑到最右侧）时才吸附悬浮；列少时作为普通列
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinned = gridWidth > viewportWidth + 1
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setViewportWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [st])

  const toggleField = (k: keyof Shot) =>
    setVisibleFields((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))
  const addFilter = () => {
    const v = draftValue.trim()
    if (!v) return
    setFilters((fs) => [...fs, { field: draftField, value: v }])
    setDraftValue('')
  }

  // Select new work once; unrelated edits must not undo a manual deselection.
  useEffect(() => {
    if (st !== 'done') return
    const history = selectionHistory.current
    const sameProject = history.projectId === project.id
    const next = new Map(shots.map(s => [s.id, { missingVideo: !s.video.versions.length, reasons: JSON.stringify(s.outdated ?? []) }]))
    setSel(previous => {
      const selected = new Set(sameProject ? previous.filter(id => next.has(id)) : [])
      next.forEach((value, id) => {
        const before = sameProject ? history.shots.get(id) : undefined
        if ((value.missingVideo && !before?.missingVideo) || (value.reasons !== '[]' && value.reasons !== before?.reasons)) selected.add(id)
      })
      return [...selected]
    })
    selectionHistory.current = { projectId: project.id, shots: next }
  }, [project.id, st, shots])

  const ignore = (id: string) => {
    useStore.getState().dismissOutdated(id, 'design')
    setSel(selected => selected.filter(value => value !== id))
  }
  const ignoreAll = () => {
    const ids = new Set(pending.map(s => s.id))
    useStore.getState().dismissAllOutdated('design')
    setSel(selected => selected.filter(id => !ids.has(id)))
  }

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  if (st === 'generating' && shots.length === 0) {
    return (
      <>
        <GeneratingState
          title="正在生成镜头设计"
          desc="AI 正在把剧本段落转化为可生成视频的镜头描述。"
          phases={['正在设计画面构图…', '正在整理人物动作…', '正在检查镜头连贯性…']}
        />
        <ActionBar>
          <PillCTA disabled>正在生成镜头设计…</PillCTA>
        </ActionBar>
      </>
    )
  }

  const detailShot = detailId ? shots.find((s) => s.id === detailId) ?? null : null

  return (
    <div>
      <PageHeader
        title="镜头设计"
        desc={<>
          {`已生成 ${shots.length} 个镜头 · ${project.config.durMode === 'manual' ? `目标 ${project.config.targetDur} 秒 · 当前合计` : '预计成片时长约'} ${shots.reduce((n, s) => n + (durationPreview[s.id] ?? project.segments.find((seg) => seg.id === s.segId)?.dur ?? s.dur), 0)} 秒`}
          {missing.length > 0 && <span className="ml-2 inline-flex flex-wrap items-center gap-2"><span className="text-white/20">|</span>{missing.length} 个段落尚未生成镜头<button disabled={!!blocked} title={blocked} className="text-brand hover:text-brand-light disabled:opacity-40" onClick={() => openGeneration(missing.map(s => s.no))}>去生成</button></span>}
        </>}
        right={<>

          <PillOutline disabled={!!blocked} title={blocked} onClick={() => openGeneration()}>重新生成镜头</PillOutline>
        </>}
      />


      {st === 'generating' && <NoticeBar tone="neutral">正在生成镜头，完成后可操作</NoticeBar>}
      {/* 工具条：字段 / 筛选 + 已加条件 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* 字段：选中/展开时整枚标签高亮（青色描边+底+图标徽章） */}
        <button
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setFieldsAnchor({ top: r.bottom + 6, left: r.left })
          }}
          className={`inline-flex items-center gap-2.5 rounded-[11px] border py-2 pl-2 pr-3.5 transition-colors ${
            fieldsAnchor
              ? 'border-brand/40 bg-brand/[0.08]'
              : 'border-line bg-white/[0.03] hover:border-white/20'
          }`}
        >
          <span
            className={`flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-lg transition-colors ${
              fieldsAnchor ? 'bg-brand/20' : 'bg-white/5'
            }`}
          >
            <Columns2 size="0.875rem" className={fieldsAnchor ? 'text-brand' : 'text-white/70'} />
          </span>
          <span className={`text-[0.8125rem] font-medium ${fieldsAnchor ? 'text-brand' : 'text-white/70'}`}>字段</span>
          {visibleFields.length < SHOT_FIELDS.length && (
            <span
              className={`text-[0.6875rem] font-semibold tabular-nums ${fieldsAnchor ? 'text-brand' : 'text-white/70'} opacity-70`}
            >
              {visibleFields.length}/{SHOT_FIELDS.length}
            </span>
          )}
        </button>

        {/* 筛选：选中/展开时整枚标签高亮，含结果数徽章 */}
        <button
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setFilterAnchor({ top: r.bottom + 6, left: r.left })
          }}
          className={`inline-flex items-center gap-2.5 rounded-[11px] border py-2 pl-2 pr-3.5 transition-colors ${
            filterAnchor
              ? 'border-brand/40 bg-brand/[0.08]'
              : 'border-line bg-white/[0.03] hover:border-white/20'
          }`}
        >
          <span
            className={`flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-lg transition-colors ${
              filterAnchor ? 'bg-brand/20' : 'bg-white/5'
            }`}
          >
            <Filter size="0.875rem" className={filterAnchor ? 'text-brand' : 'text-white/70'} />
          </span>
          <span className={`text-[0.8125rem] font-medium ${filterAnchor ? 'text-brand' : 'text-white/70'}`}>筛选</span>
          {filters.length > 0 && (
            <span className="rounded-full bg-brand px-[0.4375rem] py-[0.1875rem] text-[0.6875rem] font-semibold tabular-nums text-black">
              {filters.length}
            </span>
          )}
        </button>

        {Object.keys(columnWidths).length > 0 && (
          <button
            type="button"
            onClick={() => setColumnWidths({})}
            className="text-[0.75rem] text-muted transition-colors hover:text-white"
          >
            恢复默认列宽
          </button>
        )}

        {filters.map((f, i) => (
          <span
            key={`${f.field}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1 text-[0.75rem] text-brand"
          >
            <span className="text-muted">{labelOf(f.field)}</span>
            <span className="text-white/80">{f.value}</span>
            <button
              onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}
              className="text-muted transition-colors hover:text-white"
              title="移除该条件"
            >
              <X size="0.75rem" />
            </button>
          </span>
        ))}

        {filters.length > 0 && (
          <>
            <button
              onClick={() => setFilters([])}
              className="text-[0.75rem] text-muted transition-colors hover:text-white"
            >
              清除筛选
            </button>
            <span className="text-[0.75rem] text-faint">筛选结果 {shownShots.length} 条</span>
          </>
        )}
      </div>

      {/* 表格：统一深色表格（对齐设计稿）——紧凑默认列宽，内容超出时横向滚动 */}
      <div ref={scrollRef} className="table-scroll overflow-x-auto rounded-lg border border-white/10 bg-card">
        <div className="relative" style={{ width: gridWidth }}>
          {/* 表头（#101010 深色栏） */}
          <div
            className="grid items-stretch bg-[#101010] text-[0.8125rem] text-white/90"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="flex h-12 items-center justify-center">
              <Checkbox aria-label="全选"
                checked={shownShots.length > 0 && shownShots.every((s) => sel.includes(s.id))}
                indeterminate={
                  shownShots.some((s) => sel.includes(s.id)) && !shownShots.every((s) => sel.includes(s.id))
                }
                onChange={() => {
                  const ids = shownShots.map((s) => s.id)
                  const allOn = ids.length > 0 && ids.every((id) => sel.includes(id))
                  setSel((prev) =>
                    allOn ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])),
                  )
                }}
              />
            </div>
            <div className="flex h-12 items-center border-r border-white/[0.06] px-3">镜头</div>
            {cols.map((c) => (
              <div key={c.key} className="relative flex h-12 items-center border-r border-white/[0.06] px-3">
                {c.label}
              </div>
            ))}
            <div
              className={`flex h-12 items-center justify-center bg-[#101010] px-3 ${
                pinned ? 'sticky right-0 z-20 border-l border-white/10 shadow-[-2px_0_6px_rgba(0,0,0,0.5)]' : ''
              }`}
            >
              操作
            </div>
          </div>

          {shownShots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <div className="text-[0.8125rem] text-muted">没有符合条件的镜头</div>
              <button
                onClick={() => setFilters([])}
                className="text-[0.8125rem] text-brand transition-colors hover:text-brand-dim"
              >
                清除筛选
              </button>
            </div>
          ) : (
            <div>
              {shownShots.map((s) => (
                <ShotRow
                  project={project}
                  key={s.id}
                  shot={s}
                  cols={cols}
                  gridTemplate={gridTemplate}
                  pinned={pinned}
                  selected={sel.includes(s.id)}
                  active={detailId === s.id}
                  flash={flashId === s.id}
                  onDurationPreview={(dur) => setDurationPreview((prev) => prev[s.id] === dur ? prev : { ...prev, [s.id]: dur })}
                  onToggleSelect={() => toggle(s.id)}
                  onIgnore={() => ignore(s.id)}
                  onCommit={(patch) => useStore.getState().updateShot(s.id, patch)}
                  onMenu={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setMenu({ s, top: r.bottom + 4, left: r.right - 224 })
                  }}
                />
              ))}
            </div>
          )}
          {/* 一条贯穿表头及所有镜头行的拖动区域，不拦截单元格内容。 */}
          <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: gridTemplate }}>
            <div />
            {([{ key: 'shotInfo', label: '镜头' }, ...cols] as { key: ResizeField; label: string }[]).map(c => (
              <div key={c.key} className="relative min-w-0">
                <div
                  role="separator"
                  aria-label={`调整${c.label}列宽`}
                  aria-orientation="vertical"
                  aria-valuemin={defaultWidth(c.key) * uiScale}
                  aria-valuenow={(columnWidths[c.key] ?? defaultWidth(c.key)) * uiScale}
                  tabIndex={0}
                  title="拖动调整列宽，双击恢复默认宽度"
                  className="group pointer-events-auto absolute -right-1 top-0 z-[5] h-full w-2 touch-none cursor-col-resize select-none outline-none"
                  onPointerDown={e => {
                    if (e.button !== 0) return
                    e.preventDefault(); e.stopPropagation()
                    e.currentTarget.setPointerCapture(e.pointerId)
                    resize.current = { key: c.key, x: e.clientX, width: columnWidths[c.key] ?? defaultWidth(c.key), pointerId: e.pointerId }
                    setResizingField(c.key)
                  }}
                  onPointerMove={e => {
                    const drag = resize.current
                    if (!drag || drag.key !== c.key || drag.pointerId !== e.pointerId) return
                    e.preventDefault(); e.stopPropagation()
                    const width = Math.max(defaultWidth(c.key), drag.width + (e.clientX - drag.x) / uiScale)
                    setColumnWidths(previous => ({ ...previous, [c.key]: width }))
                  }}
                  onPointerUp={e => {
                    if (resize.current?.pointerId !== e.pointerId) return
                    resize.current = null; setResizingField(null)
                    e.currentTarget.releasePointerCapture(e.pointerId)
                  }}
                  onPointerCancel={() => { resize.current = null; setResizingField(null) }}
                  onLostPointerCapture={() => { resize.current = null; setResizingField(null) }}
                  onClick={e => e.stopPropagation()}
                  onDoubleClick={e => {
                    e.preventDefault(); e.stopPropagation()
                    setColumnWidths(previous => { const next = { ...previous }; delete next[c.key]; return next })
                  }}
                  onKeyDown={e => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return
                    e.preventDefault(); e.stopPropagation()
                    setColumnWidths(previous => {
                      const next = { ...previous }
                      if (e.key === 'Home') delete next[c.key]
                      else next[c.key] = Math.max(defaultWidth(c.key), (previous[c.key] ?? defaultWidth(c.key)) + (e.key === 'ArrowRight' ? 16 : -16))
                      return next
                    })
                  }}
                >
                  <span className={`pointer-events-none absolute inset-y-0 left-[0.1875rem] w-[0.125rem] transition-colors group-hover:bg-brand group-focus-visible:bg-brand ${resizingField === c.key ? 'bg-brand' : 'bg-transparent'}`} />
                </div>
              </div>
            ))}
            <div />
          </div>
        </div>
      </div>

      <ActionBar left={<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span>已选择 {sel.length}/{shots.length} 个镜头</span>
        {pending.length > 0 ? <>
          <span className="text-[#5d646a]">·</span>
          <span className="text-[#7c838a]">其中 {pending.filter(s => sel.includes(s.id)).length} 个因{pending.every(s => shotOutdatedReasons(s).every(r => r.kind === 'segText')) ? '剧本改动' : '内容改动'}待更新</span>
          <button type="button" className="text-white/35 transition-colors hover:text-white/70" onClick={ignoreAll}>全部忽略</button>
        </> : <span className="text-[#7c838a]">，可取消个别镜头</span>}
      </div>}>
        <PillCTA disabled={!sel.length} onClick={() => setVideoConfirm(sel)}>
          {sel.length ? (
            <>
              <span className="text-[0.75rem] leading-none">✦</span>
              {fmt(shots.filter((s) => sel.includes(s.id)).reduce((n, s) => n + videoCost(s.dur), 0))} {sel.length === shots.length ? '生成全部' : '生成'} {sel.length} 段视频
            </>
          ) : (
            '请至少选择一个镜头'
          )}
        </PillCTA>
      </ActionBar>

      {/* 右侧详情面板：key 切换镜头时重挂载，卸载前自动 flush */}
      {detailShot && (
        <ShotDetailDrawer key={detailShot.id} assets={project.assets} shot={detailShot} onClose={() => setDetailId(null)} />
      )}

      {/* 重新生成镜头（不切页） */}
      {genOpen && (
        <GenShotModal
          project={project}
          initialSelection={initialSelection}
          onClose={() => setGenOpen(false)}
          onConfirm={(segNos, durations) => {
            setGenOpen(false)
            startShots(segNos, durations)
          }}
        />
      )}

      {/* 行 ⋯ 菜单：仅生成 / 删除 */}
      {menu && (
        <Popover anchor={menu} width={224} variant="menu" onClose={() => setMenu(null)}>
          <MenuItem icon={<Pencil size="1rem" />} onClick={() => { setDetailId(menu.s.id); setMenu(null) }}>编辑镜头详情</MenuItem>
          <div title={blocked}><MenuItem icon={<RotateCcw size="1rem" />} disabled={!!blocked} onClick={() => { regenerateShot(menu.s.id); setMenu(null) }}>重新生成该镜头</MenuItem></div>
          <MenuItem icon={<Video size="1rem" />} onClick={() => { setVideoConfirm([menu.s.id]); setMenu(null) }}>生成该镜头视频</MenuItem>
          <div className="my-1.5 border-t border-white/[0.08]" />
          <MenuItem icon={<Trash2 size="1rem" />} danger onClick={() => { setDeleteFor(menu.s); setMenu(null) }}>
            删除镜头
          </MenuItem>
        </Popover>
      )}

      {/* 字段可见性 */}
      {fieldsAnchor && (
        <Popover anchor={fieldsAnchor} onClose={() => setFieldsAnchor(null)} width={360}>
          <div className="px-4 py-3.5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[0.9375rem] font-semibold text-white">显示字段</span>
              <button
                onClick={() =>
                  setVisibleFields((v) =>
                    v.length === SHOT_FIELDS.length ? DEFAULT_VISIBLE_FIELDS : SHOT_FIELDS.map((f) => f.key),
                  )
                }
                className="text-[0.8125rem] text-muted transition-colors hover:text-white"
              >
                {visibleFields.length === SHOT_FIELDS.length ? '重置' : '全选'}
              </button>
            </div>
            <div className="space-y-4">
              {SHOT_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="mb-2.5 text-[0.75rem] text-faint">{g.title}</div>
                  <div className="flex flex-wrap gap-2.5">
                    {g.fields.map((k) => {
                      const on = visibleFields.includes(k)
                      return (
                        <button
                          key={k}
                          onClick={() => toggleField(k)}
                          className={`rounded-xl border px-4 py-2 text-[0.875rem] transition-colors ${
                            on
                              ? 'border-brand/40 bg-brand/[0.08] text-brand-light'
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
            <div className="mb-3 text-[0.9375rem] font-semibold text-white">筛选条件</div>
            <FilterComposer
              field={draftField}
              value={draftValue}
              onField={setDraftField}
              onValue={setDraftValue}
              onAdd={addFilter}
            />
            <FilterPreview
              assets={project.assets}
              shots={shots}
              filters={filters}
              draftField={draftField}
              draftValue={draftValue}
              onPick={pickHit}
            />
          </div>
        </Popover>
      )}

      {deleteFor && <Modal title="删除镜头" width={480} onClose={() => setDeleteFor(null)} footer={<>
        <Button onClick={() => setDeleteFor(null)}>取消</Button>
        <Button variant="danger-solid" onClick={() => { deleteShot(deleteFor.id); setDeleteFor(null) }}>删除镜头</Button>
      </>}>
        <p className="text-sm leading-relaxed text-white/80">{`确定删除镜头 ${no2(deleteFor.no)} 吗？对应段落会保留，之后可以重新生成镜头${deleteFor.video.versions.length ? `；该镜头已生成的 ${deleteFor.video.versions.length} 个视频版本会一起删除，无法恢复。` : '。'}`}</p>
      </Modal>}

      {/* 确认生成视频 → 先置 generating，再切到第五步 */}
      {videoConfirm && (
        <VideoConfirmModal
          shots={shots.filter((s) => videoConfirm.includes(s.id))}
          balance={project.balance}
          initialModel={project.lastVideoModel}
          onClose={() => setVideoConfirm(null)}
          onConfirm={(model) => {
            const ids = videoConfirm
            setVideoConfirm(null)
            startVideos(ids, model)
          }}
        />
      )}
    </div>
  )
}

/* ---------- 表格行：选择 / 镜头 / 画面 / 时间线 / 操作 ---------- */
function ShotRow({
  project,
  shot,
  cols,
  gridTemplate,
  pinned,
  selected,
  active,
  flash,
  onDurationPreview,
  onToggleSelect,
  onIgnore,
  onCommit,
  onMenu,
}: {
  project: Project
  shot: Shot
  cols: { key: keyof Shot; label: string }[]
  gridTemplate: string
  pinned: boolean
  selected: boolean
  active: boolean
  flash?: boolean
  onDurationPreview: (dur: number | undefined) => void
  onToggleSelect: () => void
  onIgnore: () => void
  onCommit: (patch: Partial<Shot>) => void
  onMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      id={`shot-${shot.id}`}
      className={`shot-table-row grid items-stretch border-b border-white/10 transition-colors last:border-b-0 ${
        active ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'
      } ${flash ? 'row-flash' : ''}`}
      style={{ gridTemplateColumns: gridTemplate, height: '7.5rem', gridTemplateRows: 'minmax(0, 1fr)' }}
    >
      {/* 选择 */}
      <div className="flex items-start justify-center pt-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-6 items-center">
          <Checkbox aria-label={`选择镜头 ${no2(shot.no)}`} checked={selected} onChange={onToggleSelect} />
        </div>
      </div>

      {/* 镜头信息 */}
      <div className="flex min-w-0 flex-col items-start gap-1 border-r border-white/[0.06] px-3 py-3">
        <div className="flex h-6 w-full shrink-0 items-center justify-between gap-2 whitespace-nowrap">
          <span className="shrink-0 text-[0.8125rem] font-medium leading-none tabular-nums text-white/90">镜头 {no2(shot.no)}</span>
          <ShotDurationCell project={project} shot={shot} onPreview={onDurationPreview} />
        </div>
        <div className="flex h-[1.375rem] items-center gap-2 whitespace-nowrap text-[0.75rem] leading-none" data-shot-status>
          {shot.video.state !== 'generating' && !!shotOutdatedReasons(shot).length ? <>
            <span title={shotOutdatedReasons(shot).map(r => r.text).join('\n')} className="inline-flex h-[1.375rem] items-center gap-1.5 text-[#f2b544]">
              <AlertTriangle size="0.8125rem" strokeWidth={1.7} aria-hidden="true" className="shrink-0" />待更新
            </span>
            <button type="button" aria-label={`忽略镜头 ${no2(shot.no)} 的改动`} onClick={e => { e.stopPropagation(); onIgnore() }} className="shot-ignore text-white/35 transition-colors hover:text-white/70">忽略</button>
          </> : <VideoStatusLabel video={shot.video} />}
        </div>
      </div>
      {/* 可见字段列（均可就地编辑） */}
      {cols.map((c) => (
        <InlineCellEditor
          key={c.key}
          field={c.key}
          duration={shot.dur}
          reflowRevision={c.key === 'timeline' ? timelineReflowRevision(project.id, shot.id) : 0}
          assets={project.assets}
          assetIds={shot.assetIds ?? []}
          value={c.key === 'timeline' ? timelineLines(shot.timeline).join('\n') : String(shot[c.key] ?? '')}
          onCommit={(v) => onCommit({ [c.key]: v } as Partial<Shot>)}
          readView={
            c.key === 'timeline' ? (
              <div className="shot-timeline-preview space-y-0.5">
                {timelineLines(shot.timeline).map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-words"><MentionText text={line} assets={project.assets} /></div>
                ))}
              </div>
            ) : (
              <div className="whitespace-pre-line break-words"><MentionText text={String(shot[c.key] ?? '')} assets={project.assets} /></div>
            )
          }
        />
      ))}

      {/* 操作（横向 ⋯）：仅在表格横向溢出时吸附悬浮到最右侧，否则作为普通列居中 */}
      <div
        className={`flex items-start justify-center px-3 py-3 ${
          pinned ? 'sticky right-0 z-10 border-l border-white/10 shadow-[-2px_0_6px_rgba(0,0,0,0.5)]' : ''
        } ${active ? 'bg-[#202325]' : 'bg-card'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="inline-flex h-6 items-center justify-center rounded-full border border-white/10 px-3 text-white/70 transition-colors hover:border-white/25 hover:text-white"
          onClick={onMenu}
          title="更多"
        >
          <MoreHorizontal size="1rem" />
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
        className="m-1.5 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-[0.8125rem] font-medium text-brand transition-colors hover:bg-brand/[0.16]"
      >
        {labelOf(field)}
        <ChevronDown size="0.875rem" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <span className="shrink-0 px-2 text-[0.75rem] text-faint">包含</span>
      <input
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAdd()
        }}
        placeholder="输入关键词，回车添加"
        className="mr-1.5 w-full rounded-lg bg-transparent px-2.5 py-2.5 text-[0.875rem] outline-none placeholder:text-faint"
      />
      {open && (
        <div className="floating-surface absolute left-0 top-full z-10 mt-2 max-h-56 w-48 overflow-auto rounded-xl border p-1.5 animate-fadeUp">
          {SHOT_FIELDS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                onField(f.key)
                setOpen(false)
              }}
              className={`flex min-h-9 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[0.8125rem] hover:bg-white/[0.07] ${
                f.key === field ? 'text-brand' : 'text-white/90'
              }`}
            >
              <span>{f.label}</span>
              {f.key === field && <Check size="0.875rem" className="ml-2 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* 关键词高亮：把命中的关键词包成 <mark>（青底浅青字），支持多关键词 */
function highlightText(text: string, terms: string[]): React.ReactNode {
  const ts = terms.map((t) => t.trim()).filter(Boolean)
  if (!ts.length) return text
  const esc = ts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${esc.join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-[3px] bg-brand/20 px-0.5 text-brand-light">
        {p}
      </mark>
    ) : (
      p
    ),
  )
}

/* ---------- 筛选实时预览：结合已加条件 + 当前草稿，实时列出命中镜头 ---------- */
function FilterPreview({
  assets,
  shots,
  filters,
  draftField,
  draftValue,
  onPick,
}: {
  assets: Project['assets']
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
        <div className="py-4 text-center text-[0.75rem] text-faint">输入关键词，实时预览命中的镜头</div>
      </div>
    )
  }

  const hits = shots.filter(
    (s) =>
      filters.every((f) => fuzzy(f.value, String(s[f.field] ?? ''))) &&
      (!draft || fuzzy(draft, String(s[draftField] ?? ''))),
  )

  // 需要高亮的关键词：当前草稿 + 已加条件里落在当前字段的值
  const terms = [draft, ...filters.filter((f) => f.field === draftField).map((f) => f.value)]

  return (
    <div className="mt-3.5 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between text-[0.75rem] text-faint">
        <span className="tracking-wider">匹配镜头</span>
        <span className="tabular-nums">
          {hits.length}/{shots.length} 个镜头
        </span>
      </div>
      {hits.length === 0 ? (
        <div className="py-6 text-center text-[0.8125rem] text-faint">没有符合条件的镜头</div>
      ) : (
        <div className="-mx-1 flex max-h-[16.25rem] flex-col gap-2 overflow-y-auto px-1 pb-1">
          {hits.map((s) => {
            const snippet = String(s[draftField] ?? '').replace(/\s+/g, ' ').trim()
            return (
              <button
                key={s.id}
                type="button"
                title="定位到该镜头"
                onClick={() => onPick(s.id)}
                className="group w-full rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:border-brand/40 hover:bg-brand/[0.06]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="rounded bg-brand px-1.5 py-1 text-[0.65625rem] font-semibold leading-none tabular-nums text-black">
                    {no2(s.no)}
                  </span>
                  <span className="text-[0.71875rem] text-white/40">{fmtDur(s.dur)}</span>
                </div>
                <div className="mt-2 line-clamp-2 text-[0.78125rem] leading-relaxed text-white/[0.62]">
                  {snippet ? <MentionText text={snippet} assets={assets} renderPlain={text => highlightText(text, terms)} /> : '（该字段为空）'}
                </div>
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
  field, assets, assetIds, duration, reflowRevision,
  value,
  onCommit,
  readView,
}: {
  field: keyof Shot
  duration: number
  reflowRevision: number
  assets: Project['assets']
  assetIds: string[]
  value: string
  onCommit: (v: string) => void
  readView: React.ReactNode
}) {
  const { ref: reflowRef, busy } = useTimelineReflow(reflowRevision)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const { status, schedule, flush, hasPending } = useAutoSave((v) => onCommit(v))

  useLayoutEffect(() => {
    const next = hasPending() && field === 'timeline' ? normalizeTimeline(draft, duration) : value
    setDraft(next)
    if (hasPending() && field === 'timeline') schedule(next)
  }, [reflowRevision])

  const start = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
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
    <div ref={reflowRef} aria-busy={busy} className="relative min-h-0 border-r border-white/[0.06] text-[0.8125rem] leading-relaxed text-white/80" data-shot-field={field}>
      <TimelineReflow busy={busy} className="h-full"><ShotCellPreview onClick={start}>{readView}</ShotCellPreview></TimelineReflow>

      {editing && rect && (
        <div className="fixed inset-0 z-50" onMouseDown={close}>
          <div
            className="absolute flex flex-col overflow-hidden rounded-xl border border-brand/55 bg-panel shadow-2xl ring-1 ring-brand/15"
            style={{
              top: Math.max(8, Math.min(rect.top - 6, window.innerHeight - 450)),
              left: Math.max(8, Math.min(rect.left - 6, window.innerWidth - Math.max(rect.width + 12, 320) - 8)),
              width: Math.min(window.innerWidth - 16, Math.max(rect.width + 12, 320)),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="max-h-[22.5rem] min-h-[8.25rem] overflow-auto px-4 py-3 text-[0.84375rem] leading-relaxed text-white/90" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) flush() }}>
              <TimelineReflow busy={busy}><ShotTextEditor duration={duration} value={draft} timeline={field === 'timeline'} assets={assets} assetIds={assetIds} label={labelOf(field)} autoFocus onEscape={close}
                onChange={v => { setDraft(v); schedule(v) }} /></TimelineReflow>
            </div>
            <div className="flex items-center justify-between border-t border-line/60 px-4 py-2">
              <span className="text-[0.75rem] text-faint">自动保存</span>
              <SaveBadge status={status} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- 右侧详情面板：分组字段 + 更多设定折叠；全自动保存，无保存按钮 ---------- */
function ShotDetailDrawer({ shot, assets, onClose }: { shot: Shot; assets: Project['assets']; onClose: () => void }) {
  const updateShot = useStore((s) => s.updateShot)
  const projectId = useStore(s => s.currentId) ?? ''
  const revision = timelineReflowRevision(projectId, shot.id)
  const { ref: reflowRef, busy } = useTimelineReflow(revision)
  const [draft, setDraft] = useState<Record<string, string>>(() => snapshot(shot))
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [moreOpen, setMoreOpen] = useState(false)

  const { status, schedule, flush, hasPending } = useAutoSave(() => updateShot(shot.id, draftRef.current as Partial<Shot>))

  const setField = (k: keyof Shot, v: string) => {
    setDraft((d) => {
      const nd = { ...d, [k]: v }
      draftRef.current = nd
      return nd
    })
    schedule(v)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => !e.isComposing && e.keyCode !== 229 && e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useLayoutEffect(() => {
    const timeline = hasPending() ? normalizeTimeline(draftRef.current.timeline, shot.dur) : shot.timeline
    const next = { ...draftRef.current, timeline }
    draftRef.current = next
    setDraft(next)
  }, [revision])

  // 单个字段：标签在上、可编辑值框在下（对齐 Figma node 6:6577）
  const renderField = (k: keyof Shot) => (
    <div key={k} className="flex flex-col gap-2">
      <div className="text-[0.875rem] leading-[1.125rem] text-white/60">{labelOf(k)}</div>
      <div ref={k === 'timeline' ? reflowRef : undefined} aria-busy={k === 'timeline' && busy} className="relative rounded-md border border-white/10 bg-card px-3 py-3.5 text-[0.875rem] leading-relaxed text-white/90 focus-within:border-brand/50" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) flush() }}>
        <TimelineReflow busy={k === 'timeline' && busy}><ShotTextEditor duration={shot.dur} value={draft[k]} timeline={k === 'timeline'} assets={assets} assetIds={shot.assetIds ?? []} label={labelOf(k)} onChange={v => setField(k, v)} onEscape={onClose} /></TimelineReflow>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 animate-fadeUp" onMouseDown={onClose}>
      <div
        className="flex h-full w-[35rem] max-w-[92vw] flex-col bg-[#202224] shadow-2xl animate-slideInRight"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部：64px，镜头标题 18px */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-6">
          <div className="text-[1.125rem] font-medium leading-8 text-white/90">镜头 {no2(shot.no)}</div>
          <SaveBadge status={status} />
          <button
            className="ml-auto text-white/50 transition-colors hover:text-white"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size="1rem" />
          </button>
        </div>

        {/* 分组内容：每组之间用顶分隔线隔开 */}
        <div className="flex-1 overflow-y-auto">
          {SHOT_GROUPS.map((g, gi) => {
            const collapsible = gi === SHOT_GROUPS.length - 1 // 更多设定：默认收起
            const open = !collapsible || moreOpen
            return (
              <div
                key={g.title}
                className={`flex flex-col gap-4 p-6 ${gi > 0 ? 'border-t border-white/10' : ''}`}
              >
                {collapsible ? (
                  <button
                    type="button"
                    onClick={() => setMoreOpen((o) => !o)}
                    className="flex items-center gap-1.5 text-[1rem] font-medium leading-[1.125rem] text-white/90"
                  >
                    {g.title}
                    <ChevronDown size="1rem" className={`transition-transform ${moreOpen ? '' : '-rotate-90'}`} />
                  </button>
                ) : (
                  <div className="text-[1rem] font-medium leading-[1.125rem] text-white/90">{g.title}</div>
                )}
                {open && g.fields.map(renderField)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function snapshot(s: Shot): Record<string, string> {
  const o: Record<string, string> = {}
  SHOT_FIELDS.forEach((f) => (o[f.key] = f.key === 'timeline' ? timelineLines(s.timeline).join('\n') : String(s[f.key] ?? '')))
  return o
}


function ShotDurationCell({ project, shot, onPreview }: { project: Project; shot: Shot; onPreview: (dur: number | undefined) => void }) {
  const seg = project.segments.find((s) => s.id === shot.segId)
  return <div className="shrink-0" onClick={e => e.stopPropagation()}>
    <DurationStepper onPreview={onPreview} variant="inline" size="xs" title={`镜头 ${no2(shot.no)} 时长`} value={seg?.dur ?? shot.dur}
      disabled={project.shotStatus === 'generating' || !seg}
      onChange={(dur) => {
        if (seg) useStore.getState().updateSegment(seg.id, { dur })
      }} />
  </div>
}

// Measure overflow again when a column is resized; short descriptions stay fully opaque.
function ShotCellPreview({ children, onClick }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current!
    const measure = () => setOverflow(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [children])
  return <div ref={ref} tabIndex={overflow ? 0 : undefined} onClick={e => {
    // 滚动条上的点击仅滚动，不打开编辑浮层。
    const bounds = e.currentTarget.getBoundingClientRect()
    if (e.currentTarget.clientWidth > 0 && e.clientX >= bounds.left + e.currentTarget.clientWidth) return
    onClick(e)
  }} className="shot-cell-preview absolute inset-3 cursor-text overflow-x-hidden overflow-y-auto outline-none" data-overflow={overflow} title={overflow ? '滚动查看全文，点击编辑' : undefined}>
    {children}
  </div>
}
