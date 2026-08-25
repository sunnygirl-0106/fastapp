import { useEffect, useState } from 'react'
import type { Project, Shot, ShotVideo } from '@/types'
import { SHOT_PRIMARY_FIELDS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST } from '@/services/generation'
import { no2, fmtDur } from '@/utils/project'
import {
  ActionBar,
  Button,
  Diamond,
  GeneratingState,
  MenuItem,
  PageHeader,
  Popover,
  StaleNotice,
  fmt,
} from '@/components/ui'
import ShotEditDrawer from './ShotEditDrawer'
import GenShotModal from './GenShotModal'
import VideoConfirmModal from './VideoConfirmModal'

function VideoStateBadge({ v }: { v: ShotVideo }) {
  let text = '尚未生成视频'
  let cls = 'text-faint'
  if (v.state === 'generating') {
    text = '正在生成视频'
    cls = 'text-amber-400'
  } else if (v.state === 'done' && v.stale) {
    text = '需重新生成'
    cls = 'text-amber-400'
  } else if (v.state === 'done') {
    text = '视频已生成'
    cls = 'text-brand'
  }
  return <span className={`text-xs ${cls}`}>{text}</span>
}

export default function Step4Shots({ project }: { project: Project }) {
  const { generateShots, deleteShot, regenerateShot, startVideos } = useStore()
  const st = project.shotStatus
  const shots = project.shots

  const [genOpen, setGenOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [edit, setEdit] = useState<Shot | null>(null)
  const [menu, setMenu] = useState<{ s: Shot; top: number; left: number } | null>(null)
  const [videoConfirm, setVideoConfirm] = useState<string[] | null>(null)

  // 镜头生成完成后，默认选中所有尚未生成视频（或已失效）的镜头
  useEffect(() => {
    if (st !== 'done') return
    setSel(shots.filter((s) => s.video.state === 'none' || s.video.stale).map((s) => s.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, shots.length])

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  if (st === 'generating') {
    return (
      <>
        <GeneratingState
          title="正在生成镜头设计"
          desc="AI 正在把故事段落转化为可生成视频的镜头描述。"
          phases={['正在设计画面构图…', '正在整理人物动作…', '正在检查镜头连贯性…']}
        />
        <ActionBar>
          <Button variant="primary" size="lg" disabled>
            正在生成镜头设计…
          </Button>
        </ActionBar>
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="镜头设计"
        desc={`已生成 ${shots.length} 个镜头，预计成片时长约 ${shots.length * 15} 秒。`}
        right={
          <Button variant="ghost" size="sm" onClick={() => setGenOpen(true)}>
            重新生成镜头
          </Button>
        }
      />

      {project.shotStale && <StaleNotice text="角色与场景已更新，建议重新生成镜头。" actionText="重新生成镜头" onAction={() => setGenOpen(true)} />}

      <div className="space-y-3">
        {shots.map((s) => (
          <div key={s.id} className="rounded-xl border border-line/60 bg-panel px-5 py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={sel.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  className="accent-brand"
                />
                <span className="text-xs text-faint tabular-nums">
                  镜头 {no2(s.no)} · {fmtDur('15s')}
                </span>
                <VideoStateBadge v={s.video} />
              </div>
              <button
                className="text-muted hover:text-white"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setMenu({ s, top: r.bottom + 4, left: r.left - 160 })
                }}
              >
                ⋯
              </button>
            </div>

            {SHOT_PRIMARY_FIELDS.map((f) => (
              <div key={f.key} className="mt-3">
                <div className="text-xs text-faint">{f.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-white/85">
                  {String(s[f.key] ?? '')}
                </div>
              </div>
            ))}

            <button className="mt-3 text-[13px] text-brand hover:underline" onClick={() => setEdit(s)}>
              查看并编辑镜头详情
            </button>
          </div>
        ))}
      </div>

      <ActionBar left={`已选择 ${sel.length}/${shots.length} 个镜头，可取消个别镜头`}>
        <Button variant="primary" size="lg" disabled={!sel.length} onClick={() => setVideoConfirm(sel)}>
          {sel.length ? (
            <>
              生成全部 {sel.length} 段视频 · <Diamond />
              {fmt(sel.length * COST.videoEach)}
            </>
          ) : (
            '请至少选择一个镜头'
          )}
        </Button>
      </ActionBar>

      {/* 重新生成镜头（不切页） */}
      {genOpen && (
        <GenShotModal
          project={project}
          onClose={() => setGenOpen(false)}
          onConfirm={(segNos) => {
            setGenOpen(false)
            generateShots(segNos)
          }}
        />
      )}

      {/* 行 ⋯ 菜单 */}
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { regenerateShot(menu.s.id); setMenu(null) }}>重新生成该镜头</MenuItem>
          <MenuItem
            onClick={() => {
              setVideoConfirm([menu.s.id])
              setMenu(null)
            }}
          >
            生成该镜头视频
          </MenuItem>
          <MenuItem danger onClick={() => { deleteShot(menu.s.id); setMenu(null) }}>
            删除镜头
          </MenuItem>
        </Popover>
      )}

      {/* 编辑镜头抽屉 */}
      {edit && <ShotEditDrawer project={project} shotId={edit.id} onClose={() => setEdit(null)} />}

      {/* 确认生成视频 → 先置 generating，再切到第五步 */}
      {videoConfirm && (
        <VideoConfirmModal
          count={videoConfirm.length}
          balance={project.balance}
          onClose={() => setVideoConfirm(null)}
          onConfirm={() => {
            const ids = videoConfirm
            setVideoConfirm(null)
            startVideos(ids)
          }}
        />
      )}
    </div>
  )
}
