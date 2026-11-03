import { useState } from 'react'
import { MoreVertical } from 'lucide-react'
import emptyCover from '@/assets/cover-empty.png'
import { formatCreatedAt } from '@/utils/project'
import { STATUS_SAMPLES, type StatusSample } from './data'
import { Issue, Notes, Segmented, SourceTable } from './kit'

const CREATED = new Date(2026, 8, 16, 14, 30).getTime()
const STAGES = ['剧本', '拆解', '角色与场景', '镜头', '视频', '完成']

/* 卡片：逐字复刻 src/pages/ProjectList.tsx:110-187，只把状态文案换成样本值 */
function ProjectCard({ s, mode }: { s: StatusSample; mode: 'before' | 'after' }) {
  const status = mode === 'before' ? s.before : s.after
  const running = mode === 'before' ? (s.runningBefore ?? s.running) : s.running
  return (
    <div className="group relative flex h-[300px] flex-col overflow-hidden rounded-lg border border-white/5 bg-card transition-colors hover:border-white/15">
      <div
        className="relative flex-1 overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: `url("${s.cover ?? emptyCover}")` }}
      >
        {s.cover && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 to-transparent to-[55%]" />
        )}
        <div className="absolute right-3 top-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-3xl bg-black/20 text-white/90 opacity-0 backdrop-blur-[6px] transition group-hover:opacity-100">
            <MoreVertical size={15} />
          </span>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-base font-medium text-white">{s.name}</div>
          {running ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {status}
            </span>
          ) : (
            <span className={`shrink-0 text-xs ${s.done ? 'text-accent' : 'text-white/80'}`}>{status}</span>
          )}
        </div>
        <div className="mt-2 flex items-center text-xs text-white/40">
          <span>{formatCreatedAt(CREATED)}</span>
        </div>
      </div>
    </div>
  )
}

export default function S1ProjectStatus() {
  const [mode, setMode] = useState<'before' | 'after'>('after')

  return (
    <Issue
      no={1}
      title="项目状态"
      desc="项目卡片按当前工作流进度展示状态。现有 10 个状态串里缺「部分生成」这一档——只给部分剧本段落生成了镜头、或只有部分镜头有视频时，卡片会误报成「待生成镜头 / 待生成视频」，看起来像什么都没做。"
      source={
        <SourceTable
          head={['实际情况', '建议展示']}
          rows={[
            ['已完成角色场景准备，还没有镜头', '待生成镜头'],
            ['只为部分剧本段落生成了镜头', <span className="text-brand">镜头部分生成 · 3/10</span>],
            ['镜头已准备好，还没有视频', '待生成视频'],
            ['部分镜头有视频，其余尚未生成', <span className="text-brand">视频部分生成 · 3/10</span>],
            ['所有计划制作的镜头都有可用视频', '已完成'],
          ]}
        />
      }
    >
      <div className="flex items-center gap-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { key: 'before', label: '改前 · 现状' },
            { key: 'after', label: '改后 · 建议' },
          ]}
        />
        <span className="text-[12px] text-white/40">
          {mode === 'before'
            ? '12 张卡片覆盖全部状态；「这个杀手不太冷」「夏日终曲」实际已做了一半，却都显示「待生成视频」'
            : '在原有 10 个状态之间补进 2 个「部分生成」，带进度分数'}
        </span>
      </div>

      {STAGES.map((stage) => {
        const rows = STATUS_SAMPLES.filter((s) => s.stage === stage)
        if (!rows.length) return null
        return (
          <div key={stage} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-white/70">{stage}</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {rows.map((s) => (
                <div key={s.name} className="flex flex-col gap-2">
                  <ProjectCard s={s} mode={mode} />
                  {mode === 'after' && s.why && (
                    <div className="text-[12px] leading-relaxed text-white/40">
                      现状显示「{s.before}」——{s.why}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <Notes
        items={[
          <>
            新增两个状态串：<span className="text-white/90">镜头部分生成 · {'{已生成}'}/{'{段落总数}'}</span> 与{' '}
            <span className="text-white/90">视频部分生成 · {'{已有视频镜头}'}/{'{镜头总数}'}</span>。
          </>,
          <>
            判定规则加在 <code className="text-white/80">src/utils/project.ts</code> 的{' '}
            <code className="text-white/80">projectStatus()</code> 里，按工作流顺序插在现有分支之前：
            <br />
            <span className="text-white/50">
              assets.some(imgState === 'generating') → 正在生成参考图；
              <br />
              有图的资产数 {'>'} 0 && {'<'} assets.length → 参考图部分生成；
              <br />
              shots.length {'>'} 0 && shots.length {'<'} segments.length → 镜头部分生成；
              <br />
              有视频的镜头数 {'>'} 0 && {'<'} shots.length → 视频部分生成
            </span>
          </>,
          <>
            <span className="text-white/90">
              <code className="text-white/80">projectStatus()</code> 目前完全没看{' '}
              <code className="text-white/80">imgState</code>
            </span>
            ——它只认「提取角色与场景」这一步的 <code className="text-white/80">assetStatus</code>，
            所以参考图不管在生成还是生成了一半，卡片都显示「待生成镜头」。
          </>,
          <>
            <span className="text-white/90">
              <code className="text-white/80">isRunning()</code> 也要补一条{' '}
              <code className="text-white/80">assets.some(a =&gt; a.imgState === 'generating')</code>
            </span>
            ，否则参考图生成期间卡片连琥珀呼吸点都不亮，看上去像卡死了。上面切到「改前」就能看到这个差别。
          </>,
          <>
            配色沿用现有三档，不新增颜色：进行中 = 琥珀 + 脉冲点，已完成 ={' '}
            <span className="text-accent">text-accent</span>，其余（含两个「部分生成」）={' '}
            <span className="text-white/80">text-white/80</span>。
          </>,
          <>
            <span className="text-white/90">一张参考图都没生成时仍然显示「待生成镜头」</span>
            ——参考图本来就允许跳过（Step 3 底部有「跳过参考图，继续生成镜头」），不该把它说成待办；
            只有「开始生成了却没生成完」才需要「部分生成」这一档。
          </>,
          <>
            「已完成」的判定不变（<code className="text-white/80">isDone()</code>：所有镜头都有可用视频），因此部分生成不会被误判成已完成。
          </>,
        ]}
      />
    </Issue>
  )
}
