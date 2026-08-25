import { useState } from 'react'
import type { GenStatus, Project, Shot } from '@/types'
import { SHOT_GROUPS, SHOT_FIELDS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { no2 } from '@/utils/project'
import { ActionBar, Button, MenuItem, Modal, PageHeader, Popover, ReadonlyField, Spinner } from '@/components/ui'
import VideoPlayer from '@/components/VideoPlayer'

// 统一状态文案（预留 failed 分支，当前 GenStatus 无 failed）
function videoStateText(state: GenStatus | 'failed'): { text: string; cls: string } {
  switch (state) {
    case 'generating':
      return { text: '生成中', cls: 'text-amber-400' }
    case 'done':
      return { text: '生成完成', cls: 'text-brand' }
    case 'failed':
      return { text: '生成失败', cls: 'text-red-400' }
    default:
      return { text: '等待生成', cls: 'text-faint' }
  }
}

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? String(k)

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
          right={<Button size="sm" onClick={() => showToast('已开始批量下载（示意）')}>批量下载</Button>}
        />
      ) : (
        <PageHeader title="正在生成视频" desc="正在逐段生成视频，请保持页面打开。" />
      )}

      {!allDone && <div className="mb-4 text-[13px] text-muted">已完成 {doneCount}/{total}</div>}

      <div className="flex flex-wrap gap-4">
        {vids.map((s) => {
          const done = s.video.state === 'done'
          const url = s.video.versions[0]?.url
          const stat = videoStateText(s.video.state)
          return (
            <div key={s.id} className="w-[236px] overflow-hidden rounded-lg border border-line bg-panel">
              <div
                onClick={() => done && setPlay(s)}
                className={`relative flex h-[150px] items-center justify-center bg-cover bg-center ${
                  done ? 'cursor-pointer' : ''
                } ${done ? '' : 'skeleton'}`}
                style={{ backgroundImage: done && url ? `url("${url}")` : undefined }}
              >
                {done ? (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70">
                    ▶
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-xs text-muted">
                    <Spinner size={13} /> 生成中…
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <div>
                  <div className="text-[13px] text-white">
                    镜头 {no2(s.no)} · 15 秒
                  </div>
                  <div className={`text-xs ${stat.cls}`}>{stat.text}</div>
                </div>
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
          )
        })}
      </div>

      <ActionBar left={allDone ? `${vids.length} 段视频已全部生成` : `正在生成视频 · 已完成 ${doneCount}/${total}`}>
        <Button variant="primary" size="lg" disabled={!allDone} onClick={() => showToast('已开始批量下载（示意）')}>
          批量下载
        </Button>
      </ActionBar>

      {menu && (
        <Popover anchor={menu} width={140} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { showToast('已开始下载（示意）'); setMenu(null) }}>下载视频</MenuItem>
          <MenuItem onClick={() => { setInfo(menu.s); setMenu(null) }}>查看镜头信息</MenuItem>
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
