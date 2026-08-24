import { useEffect, useRef, useState } from 'react'
import type { Shot } from '@/types'
import { SHOT_FIELDS } from '@/types'
import { useStore } from '@/store/workflowStore'

const DURATION = 15
const SPEEDS = [0.5, 1, 1.5, 2]

export default function VideoPlayer({ shot, onClose }: { shot: Shot; onClose: () => void }) {
  const showToast = useStore((s) => s.showToast)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [scriptOpen, setScriptOpen] = useState(false)
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
          <div className="text-sm">视频 · seg_{String(shot.no).padStart(3, '0')}</div>
          <button className="text-muted hover:text-white" onClick={onClose}>
            ✕
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

            {/* 生成脚本浮层 */}
            {scriptOpen && (
              <div className="absolute inset-0 overflow-y-auto rounded-lg bg-black/85 p-5 text-[13px] leading-relaxed">
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold text-brand">生成该视频的分镜脚本 · 镜号 {shot.no}</div>
                  <button className="text-muted hover:text-white" onClick={() => setScriptOpen(false)}>
                    ✕
                  </button>
                </div>
                <div className="space-y-2.5">
                  {SHOT_FIELDS.map((f) => (
                    <div key={f.key}>
                      <span className="text-brand">{f.label}：</span>
                      <span className="whitespace-pre-line text-white/80">{String(shot[f.key] ?? '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 控件条：播放/时间/进度 + 音量/速度/脚本/下载/全屏 */}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 rounded-b-lg bg-gradient-to-t from-black/75 to-transparent px-4 py-3">
              <button className="text-lg" onClick={() => setPlaying((p) => !p)} title={playing ? '暂停' : '播放'}>
                {playing ? '⏸' : '▶'}
              </button>
              <span className="text-xs tabular-nums text-white/80">
                {mmss(t)} / {mmss(DURATION)}
              </span>
              <div className="relative h-1 flex-1 cursor-pointer rounded bg-white/25" onClick={seek}>
                <div className="absolute inset-y-0 left-0 rounded bg-white" style={{ width: `${(t / DURATION) * 100}%` }} />
              </div>

              {/* 音量 */}
              <button className="text-muted hover:text-white" onClick={() => setMuted((m) => !m)} title="音量">
                {muted ? '🔇' : '🔊'}
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

              {/* 查看生成脚本 */}
              <button
                className="text-muted hover:text-white"
                onClick={() => setScriptOpen((o) => !o)}
                title="查看生成该视频的脚本"
              >
                📄
              </button>

              {/* 下载 */}
              <button className="text-muted hover:text-white" onClick={() => showToast('已开始下载（示意）')} title="下载">
                ⭳
              </button>

              {/* 全屏 */}
              <button className="text-muted hover:text-white" onClick={toggleFullscreen} title="全屏">
                ⛶
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
