import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { ProjectsTopBar } from '@/components/TopBar'
import { DEFAULT_BALANCE } from '@/data/mock'
import S1ProjectStatus from './S1ProjectStatus'
import S2SegmentEdit from './S2SegmentEdit'
import S3VideoVersion from './S3VideoVersion'
import S4ShotInfo from './S4ShotInfo'
import S5ModelDefaults from './S5ModelDefaults'
import S6Failure from './S6Failure'

const ISSUES = [
  { no: 1, key: 's1', short: '项目状态', hint: '缺「部分生成」状态', C: S1ProjectStatus },
  { no: 2, key: 's2', short: '拆解正文可编辑', hint: '只读 → 自动保存', C: S2SegmentEdit },
  { no: 3, key: 's3', short: '下载视频版本选择', hint: '下载时选版本', C: S3VideoVersion },
  { no: 4, key: 's4', short: '查看镜头信息', hint: '跟随当前版本', C: S4ShotInfo },
  { no: 5, key: 's5', short: '模型参数默认值', hint: '入口可用 · 预填推荐', C: S5ModelDefaults },
  { no: 6, key: 's6', short: '生成失败', hint: '保留现场 · 不占版本号', C: S6Failure },
] as const

export default function ProposalApp() {
  const [cur, setCur] = useState<string>('s1')
  const active = ISSUES.find((i) => i.key === cur) ?? ISSUES[0]
  const Section = active.C

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-white">
      <ProjectsTopBar balance={DEFAULT_BALANCE} />
      <div className="flex flex-1">
        {/* 侧边栏：结构与「我的项目」页一致 */}
        <aside className="w-[280px] shrink-0 border-r border-white/5 bg-white/5 py-6">
          <div className="flex flex-col gap-5 px-6">
            <div className="flex flex-col gap-2">
              <div className="text-[22px] font-medium text-white">修复方案</div>
              <div className="text-[13px] leading-relaxed text-white/40">
                全自动工作流「修复」6 条的设计稿。样式与仓库同一套组件，可直接交互。
              </div>
            </div>

            <nav className="flex flex-col gap-1">
              {ISSUES.map((i) => {
                const on = i.key === cur
                return (
                  <button
                    key={i.key}
                    onClick={() => setCur(i.key)}
                    className={`flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      on ? 'bg-brand/20 text-accent-tag' : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-[14px] font-medium">
                      <span className="tabular-nums opacity-60">{String(i.no).padStart(2, '0')}</span>
                      {i.short}
                    </span>
                    <span className={`text-[12px] ${on ? 'text-accent-tag/70' : 'text-white/35'}`}>{i.hint}</span>
                  </button>
                )
              })}
            </nav>

            <div className="rounded-xl bg-white/5 p-4 backdrop-blur-[6px]">
              <div className="text-[12px] text-white/40">对照</div>
              <a
                href="./index.html"
                className="mt-1.5 inline-flex items-center gap-1.5 text-[14px] text-brand transition-opacity hover:opacity-80"
              >
                打开当前线上流程
                <ExternalLink size={13} className="shrink-0" />
              </a>
              <div className="mt-2 text-[12px] leading-relaxed text-white/35">
                本页完全独立，不读写工作流数据。
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-6">
          <Section key={active.key} />
        </main>
      </div>
    </div>
  )
}
