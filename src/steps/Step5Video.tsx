import OutdatedChip from '@/components/OutdatedChip'
import { useState } from 'react'
import { Download, Monitor, MoreVertical, Play } from 'lucide-react'
import type { Project, Shot } from '@/types'
import { useStore } from '@/store/workflowStore'
import { no2, currentVersion, videoDownloads, videoDownloadToast } from '@/utils/project'
import { ActionBar, PageHeader, Popover, MenuItem } from '@/components/ui'
import VideoVersionSelect from '@/components/VideoVersionSelect'
import VideoPlayer from '@/components/VideoPlayer'
import generatingPlaceholder from '@/assets/video-generating-placeholder.png'

import ShotVideoInfoModal from './ShotVideoInfoModal'

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
function PillCTA({ children, onClick, disabled }: { children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean }) {
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

  const setCurrentVersion = useStore(s => s.setCurrentVideoVersion)
  const [playId, setPlayId] = useState<string | null>(null)
  const [infoId, setInfoId] = useState<string | null>(null)
  const play = project.shots.find(s => s.id === playId)
  const info = project.shots.find(s => s.id === infoId)
  const [downloadAnchor, setDownloadAnchor] = useState<{ top: number; left: number } | null>(null)
  const download = (shots: Shot[], all = false) => showToast(videoDownloadToast(videoDownloads(shots, all)))
  const [infoVersion, setInfoVersion] = useState<string>('')
  const selectedVersion = info?.video.versions.find((v) => v.tag === infoVersion) ?? (info ? currentVersion(info.video) : undefined)
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

      {!allDone && <div className="mb-4 text-[0.8125rem] text-muted">已完成 {doneCount}/{total}</div>}

      <div className="flex flex-wrap gap-4">
        {vids.map((s) => {
          const done = s.video.state === 'done'
          const version = currentVersion(s.video)
          const cover = (done && version?.url) || generatingPlaceholder
          return (
            <div
              key={s.id}
              className="w-[226px] overflow-hidden rounded-lg border border-white/5 bg-card"
            >
              {/* 视频预览：完成显示帧 + 播放浮层；生成中显示渐变占位 */}
              <div
                onClick={() => done && setPlayId(s.id)}
                className={`group relative flex aspect-[226/221] w-full items-center justify-center overflow-hidden bg-cover bg-center ${
                  done ? 'cursor-pointer' : 'cursor-default'
                }`}
                style={{ backgroundImage: `url("${cover}")` }}
              >
                {done && (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition group-hover:bg-black/60">
                    <Play size="1.75rem" className="ml-0.5" fill="currentColor" />
                  </span>
                )}
                {done && s.video.versions.length > 1 && <>
                  <VideoVersionSelect badge versions={s.video.versions} value={version?.tag} onChange={tag => setCurrentVersion(s.id, tag)} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/65 to-transparent px-3 pb-3 pt-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {s.video.versions.slice(-3).map(v => <button key={v.tag} type="button" aria-label={`镜头 ${no2(s.no)} ${v.tag}`} aria-pressed={v.tag === version?.tag}
                      className={`pointer-events-auto rounded-full px-3 py-1 text-xs backdrop-blur-sm focus-visible:outline-brand ${v.tag === version?.tag ? 'bg-white text-black/80' : 'bg-black/45 text-white/80 hover:bg-black/65'}`}
                      onClick={e => { e.stopPropagation(); setCurrentVersion(s.id, v.tag) }}>{v.tag}</button>)}
                  </div>
                </>}
              </div>

              {/* 信息条：镜头名 + 更多；状态 + 时长 */}
              <div className="flex flex-col gap-2 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[1rem] font-medium text-white">镜头 {no2(s.no)}</span>

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
                    <MoreVertical size="1.125rem" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[0.75rem]">
                  <span className={`font-medium ${done ? 'text-[#00d8dc]' : 'text-[#dcb400]'}`}>
                    {done ? '已完成' : '生成中'}
                    {!!s.outdated?.length && <OutdatedChip shot={s} onRegenerateVideo={() => goStep(4)} />}
                  </span>
                  <span className="text-white/40">{currentVersion(s.video)?.dur ?? s.dur} 秒</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ActionBar left={allDone ? `${total} 个镜头 · 共 ${clipCount} 段视频` : `正在生成视频 · 已完成 ${doneCount}/${total}`}>
        <PillCTA disabled={!allDone} onClick={e => { if (clipCount === total) download(vids); else { const r = e.currentTarget.getBoundingClientRect(); setDownloadAnchor({ top: r.top - 130, left: r.right - 240 }) } }}>
          批量下载
        </PillCTA>
      </ActionBar>

      {downloadAnchor && <Popover anchor={downloadAnchor} width={240} variant="menu" onClose={() => setDownloadAnchor(null)}>
        <MenuItem icon={<Download size="1rem" />} onClick={() => { download(vids); setDownloadAnchor(null) }}><span>下载当前版本<span className="block text-xs text-white/40">{total} 段视频</span></span></MenuItem>
        <MenuItem icon={<Download size="1rem" />} onClick={() => { download(vids, true); setDownloadAnchor(null) }}><span>下载全部版本<span className="block text-xs text-white/40">{clipCount} 段视频</span></span></MenuItem>
      </Popover>}

      {menu && (
        <Popover anchor={menu} width={224} variant="menu" onClose={() => setMenu(null)}>
          <MenuItem icon={<Download size="1rem" />}
            onClick={() => { download([project.shots.find(s => s.id === menu.s.id) ?? menu.s]); setMenu(null) }}
          >
            下载视频
          </MenuItem>
          {menu.s.video.versions.length > 1 && <MenuItem icon={<Download size="1rem" />} onClick={() => { download([menu.s], true); setMenu(null) }}>下载全部版本</MenuItem>}
          <MenuItem icon={<Monitor size="1rem" />}
            onClick={() => { setInfoId(menu.s.id); setInfoVersion(currentVersion(menu.s.video)?.tag ?? ''); setMenu(null) }}
          >
            查看镜头信息
          </MenuItem>
        </Popover>
      )}

      {info && <ShotVideoInfoModal project={project} shot={info} version={selectedVersion} onVersionChange={setInfoVersion} onClose={() => setInfoId(null)} />}

      {play && <VideoPlayer shot={play} onClose={() => setPlayId(null)} />}
    </div>
  )
}
