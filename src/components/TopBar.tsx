import { Bell, ChevronLeft, Settings } from 'lucide-react'
import { Diamond, fmt } from './ui'
import logoMark from '@/assets/logo-mark.svg'
import logoWordmark from '@/assets/logo-wordmark.svg'
import coinIcon from '@/assets/icon-coin.svg'
import avatar from '@/assets/avatar.jpg'

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

/* 首页顶栏：对齐设计稿（logo 锁定 + 星钻 / 创作手册 / 提醒 / 设置 / 头像） */
export function ProjectsTopBar({ balance }: { balance: number }) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-white/10 bg-canvas px-4 backdrop-blur-[10px]">
      <div className="flex items-center gap-2">
        <img src={logoMark} alt="" className="h-5 w-5" />
        <img src={logoWordmark} alt="PhanthyMovie" className="h-[14px] w-auto" />
      </div>
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-2">
          <img src={coinIcon} alt="" className="h-3.5 w-3.5" />
          <span className="tabular-nums text-[14px] text-accent-coin">{fmt(balance)}</span>
        </span>
        <span className="text-[14px] text-[#a3a3a3]">创作手册</span>
        <Bell size={20} className="text-white opacity-40" />
        <Settings size={20} className="text-white/80" />
        <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
      </div>
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
