import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Image as ImageIcon, Loader2, User, X } from 'lucide-react'

/* ---------- 图标 ---------- */
export const Diamond = ({ className = '' }: { className?: string }) => (
  <span className={`text-brand ${className}`}>✦</span>
)

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-brand/30 border-t-brand animate-spin"
      style={{ width: size, height: size }}
    />
  )
}

/* ---------- 星钻格式 ---------- */
export const fmt = (n: number) => n.toLocaleString('en-US')

/* ---------- 遮罩 ---------- */
export function Overlay({ onClose, children }: { onClose?: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 animate-fadeUp"
      onMouseDown={onClose}
    >
      <div onMouseDown={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

/* ---------- 居中弹窗 ---------- */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 420,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="rounded-xl border border-line bg-panel shadow-2xl" style={{ width }}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-[15px] font-semibold">{title}</div>
          <button className="text-muted hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 pb-4">{footer}</div>}
      </div>
    </Overlay>
  )
}

/* ---------- 自动保存状态角标（正在保存…／已保存） ---------- */
export function SaveBadge({ status }: { status: 'idle' | 'saving' | 'saved' }) {
  if (status === 'saving')
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-muted">
        <Loader2 size={12} className="animate-spin" /> 正在保存…
      </span>
    )
  if (status === 'saved') return <span className="text-[12px] text-brand">已保存</span>
  return null
}

/* ---------- 右侧滑入抽屉（详情面板；sticky header 常驻关闭按钮） ---------- */
export function Drawer({
  title,
  status,
  onClose,
  children,
  width = 600,
}: {
  title: ReactNode
  status?: 'idle' | 'saving' | 'saved'
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 animate-fadeUp" onMouseDown={onClose}>
      <div
        className="flex h-full max-w-[92vw] flex-col border-l border-line bg-panel shadow-2xl animate-slideInRight"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-[1] flex items-center gap-3 border-b border-line bg-panel px-5 py-3.5">
          <div className="text-[15px] font-semibold">{title}</div>
          {status && <SaveBadge status={status} />}
          <button className="ml-auto text-muted hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/* ---------- 按钮 ---------- */
type BtnProps = {
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
  variant?: 'primary' | 'ghost' | 'danger' | 'danger-solid' | 'soft'
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}
export function Button({ children, onClick, variant = 'ghost', disabled, size = 'md', className = '' }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const sz =
    size === 'sm'
      ? 'px-2.5 py-1 text-[13px]'
      : size === 'lg'
        ? 'px-5 py-2.5 text-[15px]'
        : 'px-3.5 py-1.5 text-sm'
  const styles: Record<string, string> = {
    primary: 'bg-brand text-black hover:bg-brand-dim',
    soft: 'bg-panel2 text-brand hover:bg-line',
    ghost: 'bg-panel2 text-white/90 hover:bg-line',
    danger: 'bg-panel2 text-red-400 hover:bg-red-500/15',
    'danger-solid': 'bg-red-500 text-white hover:bg-red-600',
  }
  return (
    <button className={`${base} ${sz} ${styles[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/* ---------- 表单元素 ---------- */
export function Label({ children, req }: { children: ReactNode; req?: boolean }) {
  return (
    <div className="mb-1.5 text-[13px] text-muted">
      {children}
      {req && <span className="ml-0.5 text-red-400">*</span>}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-brand/60 ${props.className ?? ''}`}
    />
  )
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { dim?: boolean }
>(function Textarea({ dim, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-brand/60 ${
        dim ? 'border-line/60 bg-ink' : 'border-line bg-panel2'
      } ${props.className ?? ''}`}
    />
  )
})

/* 只读展示型"下拉"（截图里模型选择等均为静态展示） */
export function FakeSelect({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-panel2 px-3 py-2 text-sm">
      <span>{value}</span>
      <ChevronDown size={14} className="text-faint" />
    </div>
  )
}

/* 可交互下拉选择（模型选择等） */
export function ModelSelect({
  value,
  options,
  onChange,
  width = 168,
}: {
  value: string
  options: readonly string[]
  onChange: (v: string) => void
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <div ref={ref} className="relative" style={{ width }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm transition-colors hover:border-brand/60"
      >
        <span className="truncate">{value}</span>
        <ChevronDown size={14} className={`ml-1 shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-panel py-1 shadow-2xl animate-fadeUp">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-line ${
                o === value ? 'text-brand' : 'text-white/90'
              }`}
            >
              <span className="truncate">{o}</span>
              {o === value && <Check size={14} className="ml-2 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- 弹出菜单（⋯） ---------- */
export function Popover({
  anchor,
  onClose,
  children,
  width = 168,
}: {
  anchor: { top: number; left: number }
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 12))
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div
        className="absolute rounded-lg border border-line bg-panel py-1 shadow-2xl animate-fadeUp"
        style={{ top: anchor.top, left, width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`block w-full px-3.5 py-2 text-left text-[13px] hover:bg-line disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? 'text-red-400' : 'text-white/90'
      }`}
    >
      {children}
    </button>
  )
}

/* ---------- 成本行（模型 / 消耗 / 余额，含"计算中"过渡） ---------- */
export function CostRow({ cost, balance, calculating }: { cost: number; balance: number; calculating?: boolean }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-[13px] text-muted">
      {calculating ? (
        <span className="inline-flex items-center gap-2">
          <Spinner size={12} /> 合计预估中…
        </span>
      ) : (
        <>
          <Diamond />
          <span className="font-medium text-white">{fmt(cost)}</span>
          <span className="text-faint">余额：{fmt(balance)} 星钻</span>
        </>
      )}
    </div>
  )
}

/* 就地改名（标题编辑用） */
export function InlineRename({
  value,
  onCommit,
  className = '',
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      defaultValue={value}
      className={`rounded border border-brand/60 bg-panel2 px-1.5 py-0.5 text-sm outline-none ${className}`}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { e.stopPropagation(); onCommit(value) }
      }}
    />
  )
}

/* ---------- 页头（各步骤主标题 + 说明） ---------- */
export function PageHeader({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[20px] font-semibold">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{desc}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  )
}

/* ---------- 底部主操作栏（每个步骤自己渲染） ---------- */
export function ActionBar({ left, children }: { left?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-line/60 bg-ink/95 px-8 py-3 backdrop-blur">
      <div className="text-[13px] text-muted">{left}</div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}

/* ---------- 星钻确认弹窗内部小行 ---------- */
function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

/* ---------- 全站唯一的星钻确认弹窗 ---------- */
export function GenerateConfirmModal({
  title,
  what,
  count,
  model,
  modelLabel = '生成模型',
  cost,
  balance,
  confirmText,
  extra,
  disabled,
  onConfirm,
  onClose,
  width = 460,
}: {
  title: string
  what: ReactNode
  count?: ReactNode
  model: ReactNode
  modelLabel?: string
  cost: number
  balance: number
  confirmText: string
  extra?: ReactNode
  disabled?: boolean
  onConfirm: () => void
  onClose: () => void
  width?: number
}) {
  return (
    <Modal
      title={title}
      width={width}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={disabled} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-white/85">{what}</div>
      {extra && <div className="mt-4">{extra}</div>}
      <div className="mt-4 space-y-2 rounded-lg bg-panel2 px-3.5 py-3 text-[13px]">
        {count && <Row label="生成数量" value={count} />}
        <Row label={modelLabel} value={model} />
        <Row label="预计消耗" value={<span className="text-white"><Diamond />{fmt(cost)}</span>} />
        <Row label="当前余额" value={`${fmt(balance)} 星钻`} />
      </div>
    </Modal>
  )
}

/* ---------- 骨架卡片 ---------- */
export function SkeletonCard({ h = 92 }: { h?: number }) {
  return <div className="skeleton rounded-xl border border-line/60" style={{ height: h }} />
}

/* ---------- 生成中态：轮换文案 + 骨架卡片（不显示百分比） ---------- */
export function GeneratingState({
  title,
  desc,
  phases,
  skeletons = 3,
}: {
  title: string
  desc: string
  phases: string[]
  skeletons?: number
}) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % phases.length), 1500)
    return () => clearInterval(t)
  }, [phases.length])
  return (
    <div>
      <PageHeader title={title} desc={desc} />
      <div className="mb-5 inline-flex items-center gap-2 rounded-lg bg-panel2 px-3.5 py-2 text-[13px] text-muted">
        <Spinner size={13} />
        <span key={i} className="animate-fadeUp">
          {phases[i]}
        </span>
      </div>
      <div className="space-y-3">
        {Array.from({ length: skeletons }).map((_, k) => (
          <SkeletonCard key={k} />
        ))}
      </div>
    </div>
  )
}

/* ---------- 只读字段：空值不渲染，绝不显示「—」 ---------- */
export function ReadonlyField({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null
  return (
    <div className="mb-4">
      <div className="mb-1 text-[13px] text-muted">{label}</div>
      <div className="whitespace-pre-line text-sm leading-relaxed text-white/85">{value}</div>
    </div>
  )
}

/* ---------- 参考图空态（图标 + 名称 + 待生成参考图） ---------- */
export function RefPlaceholder({ kind, name }: { kind: 'char' | 'scene'; name?: string }) {
  const Icon = kind === 'char' ? User : ImageIcon
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
      <Icon size={30} className="text-faint opacity-40" />
      {name && <span className="mt-1 text-[17px] font-semibold text-white">{name}</span>}
      <span className="text-[12px] text-faint">待生成参考图</span>
    </div>
  )
}

/* ---------- 上游变更提示条 ---------- */
export function StaleNotice({
  text,
  actionText,
  onAction,
}: {
  text: string
  actionText?: string
  onAction?: () => void
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[13px]">
      <span className="text-amber-200/90">{text}</span>
      {actionText && (
        <Button size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  )
}

