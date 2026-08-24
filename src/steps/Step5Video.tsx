import { useState } from 'react'
import type { Project, Shot } from '@/types'
import { SHOT_FIELDS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { Button, MenuItem, Modal, Popover, Spinner } from '@/components/ui'
import VideoPlayer from '@/components/VideoPlayer'

export default function Step5Video({ project }: { project: Project }) {
  const showToast = useStore((s) => s.showToast)
  const goStep = useStore((s) => s.goStep)
  const vids = project.shots.filter((s) => s.video.state !== 'none')

  const [play, setPlay] = useState<Shot | null>(null)
  const [snapshot, setSnapshot] = useState<Shot | null>(null)
  const [menu, setMenu] = useState<{ s: Shot; top: number; left: number } | null>(null)

  if (vids.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-faint">
        还没有视频。请返回
        <button className="mx-1 text-brand hover:underline" onClick={() => goStep(4)}>
          分镜
        </button>
        页勾选分镜并点击「生成视频」。
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">视频（{vids.length} 段）</div>
        <Button size="sm" onClick={() => showToast('已开始批量下载（示意）')}>
          批量下载
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        {vids.map((s) => {
          const done = s.video.state === 'done'
          const url = s.video.versions[0]?.url
          return (
            <div key={s.id} className="w-[236px] overflow-hidden rounded-lg border border-line bg-panel">
              <div
                className="relative flex h-[150px] items-center justify-center bg-cover bg-center"
                style={{ backgroundImage: url ? `url("${url}")` : undefined, background: url ? undefined : 'linear-gradient(135deg,#2a2a2e,#141416)' }}
              >
                {done ? (
                  <button
                    onClick={() => setPlay(s)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                  >
                    ▶
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-2 text-xs text-muted">
                    <Spinner size={13} /> 生成中…
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-brand">分镜#{s.no} v1</span>
                <div className="flex items-center gap-2">
                  <span className={done ? 'text-brand' : 'text-amber-400'}>● {done ? '已完成' : '生成中'}</span>
                  <button
                    className="text-muted hover:text-white"
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMenu({ s, top: r.bottom + 4, left: r.left - 140 })
                    }}
                  >
                    ⋯
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {menu && (
        <Popover anchor={menu} width={140} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { showToast('已开始下载（示意）'); setMenu(null) }}>下载</MenuItem>
          <MenuItem onClick={() => { setSnapshot(menu.s); setMenu(null) }}>分镜快照</MenuItem>
        </Popover>
      )}

      {snapshot && (
        <Modal title="分镜快照" width={640} onClose={() => setSnapshot(null)}>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-[13px]">
            <div>
              <span className="text-brand">镜号：</span>
              {snapshot.no}
            </div>
            {SHOT_FIELDS.map((f) => (
              <div key={f.key}>
                <span className="text-brand">{f.label}：</span>
                <span className="whitespace-pre-line text-muted">{String(snapshot[f.key] ?? '')}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {play && <VideoPlayer shot={play} onClose={() => setPlay(null)} />}
    </div>
  )
}
