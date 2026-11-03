import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import type { Project } from '@/types'
import { WorkflowTopBar } from '@/components/TopBar'
import StepBar from '@/components/StepBar'

/* ================================================================
   方案页专用外壳组件。
   所有视觉一律复用 src/components/ui.tsx 与各 step 页的既有 class，
   这里只提供「议题 / 状态切换 / 预览画框」这层评审用的包装。
   ================================================================ */

/* ---------- 议题外壳：标题 + 说明 + 原文依据 ---------- */
export function Issue({
  no,
  title,
  desc,
  source,
  children,
}: {
  no: number
  title: string
  desc: string
  source: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium tabular-nums text-brand">{String(no).padStart(2, '0')}</span>
          <h1 className="text-[20px] font-semibold">{title}</h1>
        </div>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">{desc}</p>
      </div>
      <SourceBlock>{source}</SourceBlock>
      {children}
    </div>
  )
}

/* ---------- 原文依据引用块 ---------- */
export function SourceBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111213] p-4 text-[13px] leading-relaxed text-white/60">
      <div className="mb-2 text-[12px] font-medium text-white/40">修复.docx 原文要求</div>
      {children}
    </div>
  )
}

/* ---------- 原文依据里的表格（沿用 Step4 表头配色） ---------- */
export function SourceTable({ head, rows }: { head: [string, string]; rows: [string, ReactNode][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <div className="grid grid-cols-[minmax(160px,1fr)_minmax(200px,1.6fr)] bg-[#101010] text-[13px] text-white/90">
        <div className="border-r border-white/[0.06] px-3 py-2">{head[0]}</div>
        <div className="px-3 py-2">{head[1]}</div>
      </div>
      {rows.map(([a, b], i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(160px,1fr)_minmax(200px,1.6fr)] border-t border-white/10 text-[13px] text-white/70"
        >
          <div className="border-r border-white/[0.06] px-3 py-2">{a}</div>
          <div className="px-3 py-2 text-white/80">{b}</div>
        </div>
      ))}
    </div>
  )
}

/* ---------- 状态切换器：复用 VideoPlayer 版本条的样式 ---------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { key: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-white/10 bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium leading-none transition-colors ${
            o.key === value ? 'bg-brand/15 text-brand' : 'text-white/45 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- 预览画框：把整屏页面装进卡片 ----------
   不设固定高度、不内嵌滚动条（避免页面里套一层滚动），
   ActionBar 用 inline 贴在画框底部而不是视口底部。 */
export function Stage({
  label,
  project,
  step,
  minHeight = 420,
  chrome = true,
  children,
}: {
  label?: string
  project?: Project
  step?: number
  minHeight?: number
  chrome?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && <div className="text-[12px] text-white/40">{label}</div>}
      <div
        className="relative overflow-hidden rounded-xl border border-white/10 bg-ink pb-16"
        style={{ minHeight }}
      >
        {chrome && project && (
          <>
            <WorkflowTopBar name={project.name} balance={project.balance} onBack={() => {}} />
            <StepBar project={project} step={step} onStep={() => {}} />
          </>
        )}
        <div className="mx-auto w-full max-w-[1680px] px-6 py-4 lg:px-10">{children}</div>
      </div>
    </div>
  )
}

/* ---------- 改前 / 改后 并排对比 ---------- */
export function BeforeAfter({ before, after }: { before: ReactNode; after: ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Tag kind="before">改前 · 现状</Tag>
        {before}
      </div>
      <div className="flex flex-col gap-2">
        <Tag kind="after">改后 · 建议</Tag>
        {after}
      </div>
    </div>
  )
}

export function Tag({ kind, children }: { kind: 'before' | 'after' | 'todo'; children: ReactNode }) {
  const cls =
    kind === 'after'
      ? 'border-brand/40 bg-brand/[0.08] text-brand'
      : kind === 'todo'
        ? 'border-amber-400/40 bg-amber-400/[0.08] text-amber-300'
        : 'border-white/15 bg-white/[0.03] text-white/50'
  return (
    <span className={`w-fit rounded-md border px-2 py-1 text-[12px] font-medium leading-none ${cls}`}>
      {children}
    </span>
  )
}

/* ---------- 改动要点清单 ---------- */
export function Notes({ title = '改动要点', items }: { title?: string; items: ReactNode[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111213] p-4">
      <div className="mb-2.5 text-[13px] font-medium text-white/90">{title}</div>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-white/60">
            <Check size={13} className="mt-[3px] shrink-0 text-brand" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- 待确认提示（沿用 LockNotice 的琥珀色） ---------- */
export function OpenQuestion({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-amber-300/90">
      <AlertTriangle size={12} className="mt-[3px] shrink-0" />
      <span>{children}</span>
    </div>
  )
}

/* ---------- 局部 Toast：class 与 src/components/Toast.tsx 完全一致，但不接 store ---------- */
export function useLocalToast() {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])
  const node = toast ? (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-fadeUp">
      <div className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm shadow-2xl">{toast}</div>
    </div>
  ) : null
  return { showToast: setToast, toastNode: node }
}
