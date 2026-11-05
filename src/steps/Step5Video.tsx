import OutdatedChip from '@/components/OutdatedChip'
import MentionText from '@/components/MentionText'
import { timelineLines, formatTimeline } from '@/services/parse'
import { useState } from 'react'
import { Download, Monitor, MoreVertical, Play, X } from 'lucide-react'
import type { Project, Shot } from '@/types'
import { SHOT_GROUPS, SHOT_FIELDS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { no2, preferredVersion } from '@/utils/project'
import { ActionBar, Overlay, PageHeader, Popover } from '@/components/ui'
import VideoPlayer from '@/components/VideoPlayer'
import generatingPlaceholder from '@/assets/video-generating-placeholder.png'

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? String(k)

// 浅青渐变主按钮（与首页 / 弹窗 CTA 一致）
const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

// 描边胶囊：重新生成视频（对齐 Figma node 6:5342）
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
  // 镜头集合是固定的，所以一个镜头一张卡；同一镜头的多个版本挂在卡下面，
  // 点开播放器切换查看。
  const vids = project.shots.filter((s) => s.video.state !== 'none')

  const [play, setPlay] = useState<Shot | null>(null)
  const [info, setInfo] = useState<Shot | null>(null)
  const [infoVersion, setInfoVersion] = useState<string>('')
  const selectedVersion = info?.video.versions.find((v) => v.tag === infoVersion) ?? (info ? preferredVersion(info.video) : undefined)
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
  const clipCount = vids.reduce((n, s) => n + s.video.versions.length, 0)

  return (
    <div>
      {allDone ? (
        <PageHeader
          title="视频成片"
          desc={`${total} 个镜头，共 ${clipCount} 段视频。同一镜头的每次重新生成都会保留为一个新版本。`}
          right={<PillOutline onClick={() => goStep(4)}>重新生成视频</PillOutline>}
        />
      ) : (
        <PageHeader
          title="正在生成视频"
          desc="正在逐段生成视频，请保持页面打开。"
          right={<PillOutline onClick={() => goStep(4)}>重新生成视频</PillOutline>}
        />
      )}

      {!allDone && <div className="mb-4 text-[13px] text-muted">已完成 {doneCount}/{total}</div>}

      <div className="flex flex-wrap gap-4">
        {vids.map((s) => {
          const done = s.video.state === 'done'
          const version = preferredVersion(s.video)
          const cover = (done && version?.url) || generatingPlaceholder
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
                style={{ backgroundImage: `url("${cover}")` }}
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
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[16px] font-medium text-white">镜头 {no2(s.no)}</span>
                    {done && version && (
                      <span className="rounded-full border border-line px-1.5 py-0.5 text-[11px] leading-none text-white/50">
                        {version.tag}
                      </span>
                    )}
                  </div>
                  <button
                    className="text-white/60 transition-colors hover:text-white"
                    title="更多"
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      // 菜单定位在点击位置的右下方
                      setMenu({ s, top: r.bottom + 6, left: r.right + 6 })
                    }}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className={`font-medium ${done ? 'text-[#00d8dc]' : 'text-[#dcb400]'}`}>
                    {done ? '已完成' : '生成中'}
                    {!!s.outdated?.length && <OutdatedChip shot={s} project={project} onRegenerateVideo={() => goStep(4)} />}
                  </span>
                  <span className="text-white/40">{preferredVersion(s.video)?.dur ?? s.dur} 秒</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ActionBar left={allDone ? `${total} 个镜头 · 共 ${clipCount} 段视频` : `正在生成视频 · 已完成 ${doneCount}/${total}`}>
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
            onClick={() => { setInfo(menu.s); setInfoVersion(preferredVersion(menu.s.video)?.tag ?? ''); setMenu(null) }}
          >
            <Monitor size={16} className="shrink-0" />
            查看镜头信息
          </button>
        </Popover>
      )}

      {info && (
        <Overlay onClose={() => setInfo(null)}>
          <div className="flex max-h-[80vh] w-[800px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
            {/* 头部 */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
              <div className="text-base font-medium text-white">镜头信息 {no2(info.no)}</div>
              <button className="text-white/50 transition-colors hover:text-white" onClick={() => setInfo(null)} aria-label="关闭">
                <X size={14} />
              </button>
            </div>

            {/* 内容：只读，滑条仅悬浮时显示 */}
            <div className="table-scroll flex flex-col gap-6 overflow-y-auto px-6 py-6">
              <div className="flex items-center gap-4">
                <div className="text-sm text-white/70">时长：{selectedVersion?.dur ?? info.dur} 秒</div>
                {info.video.versions.length > 1 && <select aria-label="视频信息版本" className="rounded bg-black/40 p-2 text-sm" value={selectedVersion?.tag} onChange={(e) => setInfoVersion(e.target.value)}>
                  {info.video.versions.map((v) => <option key={v.tag} value={v.tag}>{v.tag}</option>)}
                </select>}
              </div>
              <section className="space-y-3">
                <h3 className="text-base text-white/90">视频提示词</h3>
                <div className="whitespace-pre-wrap text-sm leading-6 text-white/80"><MentionText text={selectedVersion?.videoPrompt ?? '此历史版本未保存视频提示词'} assets={project.assets} references={selectedVersion?.referenceImages} /></div>
              </section>
              <section className="space-y-3">
                <h3 className="text-base text-white/90">生成时的参考图</h3>
                {selectedVersion?.referenceImages === undefined ? <p className="text-sm text-white/50">此历史版本未保存参考图列表</p> : selectedVersion.referenceImages.length === 0 ? <p className="text-sm text-white/50">未使用参考图</p> :
                  <div className="flex flex-wrap gap-4">{selectedVersion.referenceImages.map((ref) => <figure key={ref.assetId} className="w-32">
                    <img src={ref.imageUrl} alt={`${ref.label} ${ref.name}`} className="h-32 w-32 rounded object-cover" />
                    <figcaption className="mt-2 text-xs text-white/70">{ref.label} · {ref.kind === 'char' ? '角色' : '场景'}「{ref.name}」</figcaption>
                  </figure>)}</div>}
              </section>
              <div className="text-sm text-white/50">当前镜头设计</div>
              {SHOT_GROUPS.map((g) => (
                <div key={g.title} className="flex flex-col gap-4">
                  <div className="text-[16px] font-medium leading-[18px] text-white/90">{g.title}</div>
                  {g.fields.map((k) => (
                    <div key={k} className="flex flex-col gap-2">
                      <div className="text-[12px] leading-[18px] text-white/40">{labelOf(k)}</div>
                      <div className="whitespace-pre-line text-[14px] leading-5 text-white/80">
                        <MentionText text={(k === 'timeline' ? formatTimeline(timelineLines(info.timeline)) : String(info[k] ?? '')) || '—'} assets={project.assets} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {play && <VideoPlayer shot={play} onClose={() => setPlay(null)} />}
    </div>
  )
}
