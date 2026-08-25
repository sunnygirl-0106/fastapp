import { Bell, ChevronLeft } from 'lucide-react'
import { Diamond, fmt } from './ui'

function RightCluster({ balance }: { balance: number }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-brand">充值中心</span>
      <span className="inline-flex items-center gap-1">
        <Diamond />
        <span className="tabular-nums">{fmt(balance)}</span>
      </span>
      <Bell size={16} className="text-muted" />
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand/70 to-indigo-500/70 text-[11px] font-bold text-black">
        8
      </span>
    </div>
  )
}

export function ProjectsTopBar({ balance }: { balance: number }) {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="text-brand">▚</span>
        <span className="italic text-[17px] font-semibold tracking-wide">PhanthyMovie</span>
      </div>
      <RightCluster balance={balance} />
    </header>
  )
}

export function WorkflowTopBar({ name, balance, onBack }: { name: string; balance: number; onBack: () => void }) {
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-2 text-sm">
        <button className="inline-flex items-center gap-1 text-white/80 hover:text-white" onClick={onBack}>
          <ChevronLeft size={16} /> 返回
        </button>
        <span className="text-brand">{name}</span>
      </div>
      <RightCluster balance={balance} />
    </header>
  )
}
