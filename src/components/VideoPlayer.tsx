import { useEffect, useRef, useState } from 'react'
import { Download, Maximize, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import type { Shot } from '@/types'
import { useStore } from '@/store/workflowStore'
import { no2 } from '@/utils/project'
import videoPoster from '@/assets/placeholders/frame-5.jpg'

const DURATION = 15
const SPEEDS = [0.5, 1, 1.5, 2]

export default function VideoPlayer({ shot, onClose }: { shot: Shot; onClose: () => void }) {
  const showToast = useStore((s) => s.showToast)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [speedOpen, setSpeedOpen] = useState(false)
  const raf = useRef<number>()
  const last = useRef<number>(performance.now())
  const containerRef = useRef<HTMLDivElement>(null)
  const url = shot.video.versions[0]?.url

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
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p) }
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
        className="flex max-h-[92vh] w-[800px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部：标题 + 关闭 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">镜头 {no2(shot.no)}</div>
          <button className="text-white/50 transition-colors hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        {/* 画面：9:16 竖屏居中（无真实视频时用占位图，保证不为空） */}
        <div className="flex items-center justify-center overflow-hidden bg-black/20 p-4">
          <div
            className="aspect-[9/16] h-[68vh] max-h-[560px] cursor-pointer overflow-hidden rounded-md bg-cover bg-center"
            style={{ backgroundImage: `url("${url ?? videoPoster}")` }}
            onClick={() => setPlaying((p) => !p)}
          />
        </div>

        {/* 控制条：播放/时间/进度 + 音量/速度/下载/全屏 */}
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
            <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${(t / DURATION) * 100}%` }} />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
              style={{ left: `${(t / DURATION) * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-4 text-white/70">
            {/* 音量 */}
            <button className="transition-colors hover:text-white" onClick={() => setMuted((m) => !m)} title="音量">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {/* 播放速度 */}
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
                      className={`block w-16 px-3 py-1 text-left text-[13px] hover:bg-white/5 ${s === rate ? 'text-brand' : 'text-white/80'}`}
                      onClick={() => { setRate(s); setSpeedOpen(false) }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 下载 */}
            <button className="transition-colors hover:text-white" onClick={() => showToast('已开始下载（示意）')} title="下载">
              <Download size={18} />
            </button>

            {/* 全屏 */}
            <button className="transition-colors hover:text-white" onClick={toggleFullscreen} title="全屏">
              <Maximize size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
