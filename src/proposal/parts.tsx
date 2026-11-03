import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, Download, Maximize, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import type { Shot, VideoVersion } from '@/types'
import { SHOT_FIELDS, SHOT_GROUPS } from '@/types'
import { Diamond, Overlay, fmt } from '@/components/ui'
import { no2, preferredVersion } from '@/utils/project'
import videoPoster from '@/assets/placeholders/frame-5.jpg'
import { versionMeta } from './data'

const DURATION = 15
const SPEEDS = [0.5, 1, 1.5, 2]

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? String(k)

/* ================================================================
   S3 / S4 共用的「改后」控件。
   样式一律沿用 VideoPlayer.tsx / Step5Video.tsx 的既有 class。
   ================================================================ */

/** 版本条：沿用 VideoPlayer.tsx:73-90 的 segmented 样式；采用版本挂「已采用」icon */
export function VersionBar({
  versions,
  active,
  adopted,
  onPick,
  size = 'md',
}: {
  versions: VideoVersion[]
  active: string
  adopted: string
  onPick: (tag: string) => void
  size?: 'sm' | 'md'
}) {
  if (!versions.length) return null
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[10px] border border-white/10 bg-black/30 p-1">
      {versions.map((v) => (
        <button
          key={v.tag}
          onClick={(e) => {
            e.stopPropagation()
            onPick(v.tag)
          }}
          title={v.tag === adopted ? `${v.tag}（已采用）` : `查看 ${v.tag}`}
          className={`inline-flex items-center gap-1 rounded-md font-medium leading-none transition-colors ${pad} ${
            v.tag === active ? 'bg-brand/15 text-brand' : 'text-white/45 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          {v.tag}
          {v.tag === adopted && <BadgeCheck size={size === 'sm' ? 11 : 12} className="shrink-0 text-brand" />}
        </button>
      ))}
    </div>
  )
}

/* ---------- 「镜头 01 · v1 生成信息」弹窗 ----------
   壳体与分组排版逐字沿用 Step5Video.tsx:173-202，改动：
   1) 标题带版本号  2) 标题右侧可切版本  3) 新增「生成参数」组 */
export function ShotInfoModal({
  shot,
  initialTag,
  adopted,
  onClose,
  showVersionSwitch = true,
}: {
  shot: Shot
  initialTag: string
  adopted: string
  onClose: () => void
  showVersionSwitch?: boolean
}) {
  const versions = shot.video.versions
  const [tag, setTag] = useState(initialTag)
  const ver = versions.find((v) => v.tag === tag) ?? versions[versions.length - 1]
  const meta = ver ? versionMeta(ver, shot) : null

  const fields: [string, string][] = meta
    ? [
        ['视频模型', meta.model],
        ['分辨率', meta.res],
        ['画面比例', meta.ratio],
        ['配音', meta.voice ? '生成配音' : '不生成配音'],
        ['生成时间', new Date(ver!.createdAt).toLocaleString('zh-CN', { hour12: false })],
      ]
    : []

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[80vh] w-[800px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
        <div className="flex h-16 shrink-0 items-center gap-4 border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">
            镜头 {no2(shot.no)} · {tag} 生成信息
          </div>
          {showVersionSwitch && (
            <VersionBar versions={versions} active={tag} adopted={adopted} onPick={setTag} />
          )}
          <button
            className="ml-auto text-white/50 transition-colors hover:text-white"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>

        <div className="table-scroll flex flex-col gap-6 overflow-y-auto px-6 py-6">
          {/* 新增：生成该版本时使用的参数 */}
          {meta && (
            <div className="flex flex-col gap-4">
              <div className="text-[16px] font-medium leading-[18px] text-white/90">生成参数</div>
              <div className="flex flex-col gap-2 rounded-lg bg-black/40 p-3">
                {fields.map(([k, v]) => (
                  <div key={k} className="flex min-h-[32px] items-center justify-between gap-3">
                    <span className="shrink-0 text-sm text-white/60">{k}</span>
                    <span className="text-right text-sm text-white">{v}</span>
                  </div>
                ))}
                <div className="flex min-h-[32px] items-center justify-between gap-3">
                  <span className="shrink-0 text-sm text-white/60">本次消耗</span>
                  <span className="inline-flex items-center gap-1 text-white">
                    <Diamond />
                    {fmt(meta.cost)} 星钻
                  </span>
                </div>
              </div>
            </div>
          )}

          {SHOT_GROUPS.map((g) => (
            <div key={g.title} className="flex flex-col gap-4">
              <div className="text-[16px] font-medium leading-[18px] text-white/90">{g.title}</div>
              {g.fields.map((k) => {
                // 画面描述展示该版本生成时的快照，其余字段取当前值
                const value = k === 'shot' && meta ? meta.shotSnapshot : String(shot[k] ?? '')
                return (
                  <div key={k} className="flex flex-col gap-2">
                    <div className="text-[12px] leading-[18px] text-white/40">{labelOf(k)}</div>
                    <div className="whitespace-pre-line text-[14px] leading-5 text-white/80">{value || '—'}</div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- 改后的播放器 ----------
   逐字沿用 VideoPlayer.tsx，改动：
   1) 版本条带「已采用」icon  2) 新增「采用此版本」  3) 下载 = 下载正在播放的版本 */
export function PlayerV2({
  shot,
  initialTag,
  adopted,
  onAdopt,
  onClose,
  onToast,
}: {
  shot: Shot
  initialTag: string
  adopted: string
  onAdopt: (tag: string) => void
  onClose: () => void
  onToast: (m: string) => void
}) {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [speedOpen, setSpeedOpen] = useState(false)
  const raf = useRef<number>()
  const last = useRef<number>(performance.now())
  const containerRef = useRef<HTMLDivElement>(null)

  const versions = shot.video.versions
  const [tag, setTag] = useState(initialTag || preferredVersion(shot.video)?.tag || '')
  const active = versions.find((v) => v.tag === tag) ?? versions[versions.length - 1]
  const url = active?.url

  useEffect(() => {
    const loop = (now: number) => {
      const dt = ((now - last.current) / 1000) * rate
      last.current = now
      if (playing) setT((x) => (x + dt >= DURATION ? 0 : x + dt))
      raf.current = requestAnimationFrame(loop)
    }
    last.current = performance.now()
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current!)
  }, [playing, rate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setT(((e.clientX - r.left) / r.width) * DURATION)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onMouseDown={onClose}>
      <div
        ref={containerRef}
        className="flex max-h-[90vh] w-[1120px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-16 shrink-0 items-center gap-4 border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">镜头 {no2(shot.no)}</div>
          <VersionBar
            versions={versions}
            active={active?.tag ?? ''}
            adopted={adopted}
            onPick={(v) => {
              setTag(v)
              setT(0)
            }}
          />
          {/* 新增：把当前预览的版本设为采用版本 */}
          {active && active.tag !== adopted ? (
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-panel2 px-2.5 py-1 text-[13px] font-medium text-brand transition-colors hover:bg-line"
              onClick={() => {
                onAdopt(active.tag)
                onToast(`已将 ${active.tag} 设为该镜头的采用版本`)
              }}
            >
              采用此版本
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12px] text-white/40">
              <BadgeCheck size={12} className="shrink-0 text-brand" />
              当前为采用版本
            </span>
          )}
          <button
            className="ml-auto text-white/50 transition-colors hover:text-white"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center justify-center overflow-hidden bg-black/20 p-4">
          <div
            className="aspect-[9/16] h-[min(calc(90vh_-_148px),620px)] max-w-full cursor-pointer overflow-hidden rounded-md bg-cover bg-center"
            style={{ backgroundImage: `url("${url ?? videoPoster}")` }}
            onClick={() => setPlaying((p) => !p)}
          />
        </div>

        <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
          <button
            className="text-white/90 transition-colors hover:text-white"
            onClick={() => setPlaying((p) => !p)}
            title={playing ? '暂停' : '播放'}
          >
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <span className="text-[12px] tabular-nums text-white/60">
            {mmss(t)} / {mmss(DURATION)}
          </span>
          <div className="group relative h-1 flex-1 cursor-pointer rounded-full bg-white/20" onClick={seek}>
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white"
              style={{ width: `${(t / DURATION) * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
              style={{ left: `${(t / DURATION) * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-4 text-white/70">
            <button className="transition-colors hover:text-white" onClick={() => setMuted((m) => !m)} title="音量">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            <div className="relative">
              <button
                className="text-[13px] font-medium transition-colors hover:text-white"
                onClick={() => setSpeedOpen((o) => !o)}
                title="播放速度"
              >
                {rate}x
              </button>
              {speedOpen && (
                <div className="absolute bottom-8 right-0 rounded-lg border border-white/10 bg-[#242628] py-1 shadow-xl backdrop-blur-[10px]">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      className={`block w-16 px-3 py-1 text-left text-[13px] hover:bg-white/5 ${
                        s === rate ? 'text-brand' : 'text-white/80'
                      }`}
                      onClick={() => {
                        setRate(s)
                        setSpeedOpen(false)
                      }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 改后：下载的是正在播放的版本，文件名带版本号 */}
            <button
              className="transition-colors hover:text-white"
              onClick={() => onToast(`已开始下载 镜头${no2(shot.no)}_${active?.tag}.mp4（示意）`)}
              title={`下载 ${active?.tag ?? ''}`}
            >
              <Download size={18} />
            </button>

            <button className="transition-colors hover:text-white" onClick={toggleFullscreen} title="全屏">
              <Maximize size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
