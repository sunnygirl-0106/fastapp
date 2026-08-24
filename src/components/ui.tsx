import { useEffect, useRef, type ReactNode } from 'react'

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
          <button className="text-muted hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 pb-4">{footer}</div>}
      </div>
    </Overlay>
  )
}

/* ---------- 右侧抽屉 ---------- */
export function Drawer({
  title,
  header,
  onClose,
  children,
  footer,
  width = 460,
}: {
  title?: string
  header?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute right-0 top-0 flex h-full flex-col border-l border-line bg-panel shadow-2xl animate-fadeUp"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          {header ?? <div className="text-brand text-[15px] font-semibold">{title}</div>}
          <button className="text-muted hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- 按钮 ---------- */
type BtnProps = {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'soft'
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}
export function Button({ children, onClick, variant = 'ghost', disabled, size = 'md', className = '' }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const sz = size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3.5 py-1.5 text-sm'
  const styles: Record<string, string> = {
    primary: 'bg-brand text-black hover:bg-brand-dim',
    soft: 'bg-panel2 text-brand hover:bg-line',
    ghost: 'bg-panel2 text-white/90 hover:bg-line',
    danger: 'bg-panel2 text-red-400 hover:bg-red-500/15',
  }
  return (
    <button className={`${base} ${sz} ${styles[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/* ---------- 状态胶囊 ---------- */
export function StatusPill({ label, status }: { label: string; status: 'none' | 'generating' | 'done' }) {
  const map = {
    none: { dot: 'bg-faint', text: '未开始' },
    generating: { dot: 'bg-amber-400', text: '生成中' },
    done: { dot: 'bg-brand', text: '已完成' },
  }[status]
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-panel2 px-3 py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${map.dot}`} />
      <span>{map.text}</span>
    </span>
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

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-y rounded-lg border border-line bg-panel2 px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-brand/60 ${props.className ?? ''}`}
    />
  )
}

/* 只读展示型"下拉"（截图里模型选择等均为静态展示） */
export function FakeSelect({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-panel2 px-3 py-2 text-sm">
      <span>{value}</span>
      <span className="text-faint">▾</span>
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

/* ---------- 通用确认弹窗 ---------- */
export function ConfirmDialog({
  text,
  confirmText = '确认',
  onConfirm,
  onCancel,
  danger,
}: {
  text: string
  confirmText?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}) {
  return (
    <Overlay onClose={onCancel}>
      <div className="w-[360px] rounded-xl border border-line bg-panel p-5 shadow-2xl">
        <div className="text-sm">{text}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button variant={danger ? 'primary' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Overlay>
  )
}

/* 双击就地改名（表格标题用） */
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
