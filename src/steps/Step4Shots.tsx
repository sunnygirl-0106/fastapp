import { useEffect, useRef, useState } from 'react'
import { ChevronUp, Loader2, MoreHorizontal } from 'lucide-react'
import type { Project, Shot, ShotVideo } from '@/types'
import { SHOT_CARD_FIELDS, SHOT_FIELDS, SHOT_GROUPS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST } from '@/services/generation'
import { no2, fmtDur } from '@/utils/project'
import { useAutoSave } from '@/hooks/useAutoSave'
import {
  ActionBar,
  Button,
  Diamond,
  GeneratingState,
  MenuItem,
  PageHeader,
  Popover,
  StaleNotice,
  Textarea,
  fmt,
} from '@/components/ui'
import GenShotModal from './GenShotModal'
import VideoConfirmModal from './VideoConfirmModal'

function videoStateInfo(v: ShotVideo): { text: string; cls: string; dot: string } {
  if (v.state === 'generating') return { text: '正在生成视频', cls: 'text-amber-400', dot: 'bg-amber-400' }
  if (v.state === 'done' && v.stale) return { text: '需重新生成', cls: 'text-amber-400', dot: 'bg-amber-400' }
  if (v.state === 'done') return { text: '视频已生成', cls: 'text-brand', dot: 'bg-brand' }
  return { text: '尚未生成视频', cls: 'text-faint', dot: 'bg-faint' }
}

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? String(k)

export default function Step4Shots({ project }: { project: Project }) {
  const { generateShots, deleteShot, regenerateShot, startVideos } = useStore()
  const st = project.shotStatus
  const shots = project.shots

  const [genOpen, setGenOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
          desc="AI 正在把剧本段落转化为可生成视频的镜头描述。"
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

      {project.shotStale && (
        <StaleNotice
          text="角色与场景已更新，建议重新生成镜头。"
          actionText="重新生成镜头"
          onAction={() => setGenOpen(true)}
        />
      )}

      <div className="space-y-3">
        {shots.map((s) => (
          <ShotCard
            key={s.id}
            shot={s}
            selected={sel.includes(s.id)}
            expanded={expandedId === s.id}
            onToggleSelect={() => toggle(s.id)}
            onExpand={() => setExpandedId(s.id)}
            onCollapse={() => setExpandedId((id) => (id === s.id ? null : id))}
            onMenu={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setMenu({ s, top: r.bottom + 4, left: r.left - 168 })
            }}
          />
        ))}
      </div>

      <ActionBar left={`已选择 ${sel.length}/${shots.length} 个镜头`}>
        <Button variant="primary" size="lg" disabled={!sel.length} onClick={() => setVideoConfirm(sel)}>
          {sel.length ? (
            <>
              生成 {sel.length} 段视频 · <Diamond />
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
          <MenuItem onClick={() => { setVideoConfirm([menu.s.id]); setMenu(null) }}>生成该镜头视频</MenuItem>
          <MenuItem danger onClick={() => { deleteShot(menu.s.id); setMenu(null) }}>
            删除镜头
          </MenuItem>
        </Popover>
      )}

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

/* ---------- 单个镜头卡片：收起态 + 行内展开编辑 ---------- */
function ShotCard({
  shot,
  selected,
  expanded,
  onToggleSelect,
  onExpand,
  onCollapse,
  onMenu,
}: {
  shot: Shot
  selected: boolean
  expanded: boolean
  onToggleSelect: () => void
  onExpand: () => void
  onCollapse: () => void
  onMenu: (e: React.MouseEvent) => void
}) {
  const vi = videoStateInfo(shot.video)
  return (
    <div
      className={`rounded-xl border transition-colors ${
        selected ? 'border-line bg-panel' : 'border-line/50 bg-panel opacity-55'
      }`}
    >
      {/* 镜号行 */}
      <div className="flex items-center gap-3 px-5 pt-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="accent-brand"
        />
        <span className="text-[14px] font-medium tabular-nums text-white/90">镜头 {no2(shot.no)}</span>
        <span className="text-[13px] text-faint">{fmtDur('15s')}</span>
        <span className={`inline-flex items-center gap-1.5 text-[12px] ${vi.cls}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${vi.dot}`} />
          {vi.text}
        </span>
        {!selected && <span className="text-xs text-faint">不生成</span>}
        <div className="ml-auto">
          <button
            className="rounded-md px-1.5 py-1 text-muted transition-colors hover:bg-panel2 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              onMenu(e)
            }}
            title="更多"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {expanded ? (
        <ShotExpandedEditor shot={shot} onCollapse={onCollapse} />
      ) : (
        <button
          type="button"
          onClick={onExpand}
          className="block w-full cursor-pointer space-y-3 px-5 pb-4 pt-3 text-left"
        >
          {SHOT_CARD_FIELDS.map((f) => (
            <div key={f.key}>
              <div className="mb-1 text-xs text-muted">{f.label}</div>
              <div className="whitespace-pre-line text-[13.5px] leading-relaxed text-white/90">
                {String(shot[f.key] ?? '')}
              </div>
            </div>
          ))}
        </button>
      )}
    </div>
  )
}

/* ---------- 展开态编辑区：卸载时（收起/切换/离开）自动 flush ---------- */
function ShotExpandedEditor({ shot, onCollapse }: { shot: Shot; onCollapse: () => void }) {
  const updateShot = useStore((s) => s.updateShot)
  const [draft, setDraft] = useState<Record<string, string>>(() => snapshot(shot))
  const draftRef = useRef(draft)
  draftRef.current = draft

  // 单个卡片共用一个保存状态；commit 读取最新 draft，写入整份（store 内部按变化过滤）
  const { status, schedule } = useAutoSave(() => updateShot(shot.id, draftRef.current as Partial<Shot>))

  const setField = (k: keyof Shot, v: string) => {
    setDraft((d) => {
      const nd = { ...d, [k]: v }
      draftRef.current = nd
      return nd
    })
    schedule(v)
  }

  return (
    <div className="px-5 pb-4 pt-1">
      <div className="mb-2 flex h-4 items-center justify-end text-[12px]">
        {status === 'saving' && (
          <span className="inline-flex items-center gap-1 text-muted">
            <Loader2 size={12} className="animate-spin" /> 正在保存…
          </span>
        )}
        {status === 'saved' && <span className="text-brand">已保存</span>}
      </div>

      {SHOT_GROUPS.map((g, gi) => {
        const dim = gi === SHOT_GROUPS.length - 1
        return (
          <div key={g.title} className="mb-4 last:mb-0">
            <div className={`mb-2 text-[13px] font-medium ${dim ? 'text-faint' : 'text-muted'}`}>{g.title}</div>
            <div className="space-y-2.5">
              {g.fields.map((k) => (
                <div key={k} className="grid grid-cols-[76px_1fr] items-start gap-3">
                  <div className="pt-2 text-[13px] text-muted">{labelOf(k)}</div>
                  <Textarea
                    dim={dim}
                    rows={k === 'timeline' || k === 'shot' || k === 'motion' ? 3 : 2}
                    value={draft[k]}
                    onChange={(e) => setField(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-white"
        >
          收起 <ChevronUp size={14} />
        </button>
      </div>
    </div>
  )
}

function snapshot(s: Shot): Record<string, string> {
  const o: Record<string, string> = {}
  SHOT_FIELDS.forEach((f) => (o[f.key] = String(s[f.key] ?? '')))
  return o
}
