import { useState } from 'react'
import { Download, Monitor, MoreVertical, Play } from 'lucide-react'
import type { Project, Shot } from '@/types'
import { SHOT_GROUPS, SHOT_FIELDS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { no2 } from '@/utils/project'
import { ActionBar, Modal, PageHeader, Popover, ReadonlyField } from '@/components/ui'
import VideoPlayer from '@/components/VideoPlayer'
import generatingPlaceholder from '@/assets/video-generating-placeholder.png'

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? String(k)

// 浅青渐变主按钮（与首页 / 弹窗 CTA 一致）
const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

// 描边胶囊：重新生成镜头（对齐 Figma node 6:5342）
function PillOutline({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5"
    >
      {children}
    </button>
  )
}

// 浅青渐变胶囊：批量下载（对齐 Figma node 6:5334）
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

export default function Step5Video({ project }: { project: Project }) {
  const showToast = useStore((s) => s.showToast)
  const goStep = useStore((s) => s.goStep)
  const vids = project.shots.filter((s) => s.video.state !== 'none')

  const [play, setPlay] = useState<Shot | null>(null)
  const [info, setInfo] = useState<Shot | null>(null)
  const [menu, setMenu] = useState<{ s: Shot; top: number; left: number } | null>(null)

  if (vids.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-faint">
        还没有视频。请返回
        <button className="mx-1 text-brand hover:underline" onClick={() => goStep(4)}>
          镜头
        </button>
        页选择镜头并生成视频。
      </div>
    )
  }

  const total = vids.length
  const doneCount = vids.filter((s) => s.video.state === 'done').length
  const allDone = doneCount === total

  return (
    <div>
      {allDone ? (
        <PageHeader
          title="视频成片"
          desc={`${vids.length} 段视频已全部生成。`}
          right={<PillOutline onClick={() => goStep(4)}>重新生成镜头</PillOutline>}
        />
      ) : (
        <PageHeader
          title="正在生成视频"
          desc="正在逐段生成视频，请保持页面打开。"
          right={<PillOutline onClick={() => goStep(4)}>重新生成镜头</PillOutline>}
        />
      )}

      {!allDone && <div className="mb-4 text-[13px] text-muted">已完成 {doneCount}/{total}</div>}

      <div className="flex flex-wrap gap-4">
        {vids.map((s) => {
          const done = s.video.state === 'done'
          return (
            <div
              key={s.id}
              className="w-[226px] overflow-hidden rounded-lg border border-white/5 bg-card"
            >
              {/* 视频预览：完成显示帧 + 播放浮层；生成中显示渐变占位 */}
              <div
                onClick={() => done && setPlay(s)}
                className={`group relative flex aspect-[226/221] w-full items-center justify-center overflow-hidden bg-cover bg-center ${
                  done ? 'cursor-pointer' : 'cursor-default'
                }`}
                style={{ backgroundImage: `url("${generatingPlaceholder}")` }}
              >
                {done && (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition group-hover:bg-black/60">
                    <Play size={28} className="ml-0.5" fill="currentColor" />
                  </span>
                )}
              </div>

              {/* 信息条：镜头名 + 更多；状态 + 时长 */}
              <div className="flex flex-col gap-2 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-[16px] font-medium text-white">镜头 {no2(s.no)}</div>
                  <button
                    className="text-white/60 transition-colors hover:text-white"
                    title="更多"
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMenu({ s, top: r.bottom + 4, left: r.left - 140 })
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className={`font-medium ${done ? 'text-[#00d8dc]' : 'text-[#dcb400]'}`}>
                    {done ? '已完成' : '生成中'}
                  </span>
                  <span className="text-white/40">15 秒</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ActionBar left={allDone ? `${vids.length} 段视频已全部生成` : `正在生成视频 · 已完成 ${doneCount}/${total}`}>
        <PillCTA disabled={!allDone} onClick={() => showToast('已开始批量下载（示意）')}>
          批量下载
        </PillCTA>
      </ActionBar>

      {menu && (
        <Popover anchor={menu} width={150} variant="glass" onClose={() => setMenu(null)}>
          <button
            className="flex items-center gap-2 text-[14px] text-white/90 transition-colors hover:text-white"
            onClick={() => { showToast('已开始下载（示意）'); setMenu(null) }}
          >
            <Download size={16} className="shrink-0" />
            下载视频
          </button>
          <button
            className="flex items-center gap-2 text-[14px] text-white/90 transition-colors hover:text-white"
            onClick={() => { setInfo(menu.s); setMenu(null) }}
          >
            <Monitor size={16} className="shrink-0" />
            查看镜头信息
          </button>
        </Popover>
      )}

      {info && (
        <Modal title={`镜头信息 ${no2(info.no)}`} width={640} onClose={() => setInfo(null)}>
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            {SHOT_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="mb-2 text-xs uppercase tracking-wide text-faint">{g.title}</div>
                {g.fields.map((k) => (
                  <ReadonlyField key={k} label={labelOf(k)} value={String(info[k] ?? '')} />
                ))}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {play && <VideoPlayer shot={play} onClose={() => setPlay(null)} />}
    </div>
  )
}
