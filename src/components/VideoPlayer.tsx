import { useEffect, useRef, useState } from 'react'
import { Download, Maximize, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import type { Shot } from '@/types'
import { useStore } from '@/store/workflowStore'
import { no2 } from '@/utils/project'

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
    <div className="fixed inset-0 z-50 bg-black/80 p-6" onMouseDown={onClose}>
      <div
        ref={containerRef}
        className="mx-auto flex h-full max-w-6xl flex-col rounded-xl border border-line bg-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部：仅标题 + 关闭 */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="text-sm">镜头 {no2(shot.no)}</div>
          <button className="text-muted hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {/* 画面 */}
        <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
          <div className="relative h-full">
            <div
              className="h-full rounded-lg bg-cover bg-center"
              style={{
                aspectRatio: '9 / 16',
                backgroundImage: url ? `url("${url}")` : undefined,
                background: url ? undefined : 'linear-gradient(135deg,#2a2a2e,#141416)',
              }}
              onClick={() => setPlaying((p) => !p)}
            />

            {/* 控件条：播放/时间/进度 + 音量/速度/下载/全屏 */}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 rounded-b-lg bg-gradient-to-t from-black/75 to-transparent px-4 py-3">
              <button onClick={() => setPlaying((p) => !p)} title={playing ? '暂停' : '播放'}>
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <span className="text-xs tabular-nums text-white/80">
                {mmss(t)} / {mmss(DURATION)}
              </span>
              <div className="relative h-1 flex-1 cursor-pointer rounded bg-white/25" onClick={seek}>
                <div className="absolute inset-y-0 left-0 rounded bg-white" style={{ width: `${(t / DURATION) * 100}%` }} />
              </div>

              {/* 音量 */}
              <button className="text-muted hover:text-white" onClick={() => setMuted((m) => !m)} title="音量">
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>

              {/* 播放速度 */}
              <div className="relative">
                <button
                  className="rounded px-1.5 text-xs text-white/80 hover:bg-white/10"
                  onClick={() => setSpeedOpen((o) => !o)}
                  title="播放速度"
                >
                  {rate}x
                </button>
                {speedOpen && (
                  <div className="absolute bottom-7 right-0 rounded-lg border border-line bg-panel py-1 shadow-xl">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        className={`block w-16 px-3 py-1 text-left text-xs hover:bg-line ${s === rate ? 'text-brand' : 'text-white/80'}`}
                        onClick={() => { setRate(s); setSpeedOpen(false) }}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 下载 */}
              <button className="text-muted hover:text-white" onClick={() => showToast('已开始下载（示意）')} title="下载">
                <Download size={18} />
              </button>

              {/* 全屏 */}
              <button className="text-muted hover:text-white" onClick={toggleFullscreen} title="全屏">
                <Maximize size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
