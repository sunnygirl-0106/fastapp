import { useEffect, useState } from 'react'
import type { Project, Shot, ShotVideo } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST } from '@/services/generation'
import { no2, fmtDur } from '@/utils/project'
import {
  ActionBar,
  Button,
  CellPopover,
  Diamond,
  GeneratingState,
  MenuItem,
  PageHeader,
  Popover,
  ReadCell,
  StaleNotice,
  fmt,
} from '@/components/ui'
import ShotEditDrawer from './ShotEditDrawer'
import GenShotModal from './GenShotModal'
import VideoConfirmModal from './VideoConfirmModal'

function videoStateInfo(v: ShotVideo): { text: string; cls: string; dot: string } {
  if (v.state === 'generating') return { text: '正在生成视频', cls: 'text-amber-400', dot: 'bg-amber-400' }
  if (v.state === 'done' && v.stale) return { text: '需重新生成', cls: 'text-amber-400', dot: 'bg-amber-400' }
  if (v.state === 'done') return { text: '视频已生成', cls: 'text-brand', dot: 'bg-brand' }
  return { text: '尚未生成视频', cls: 'text-faint', dot: 'bg-faint' }
}

// 分镜表格列（标签对齐参考图）
const SHOT_COLS: { key: keyof Shot; label: string; w: string }[] = [
  { key: 'shot', label: '镜头', w: 'w-[180px]' },
  { key: 'timeline', label: '时间线', w: 'w-[150px]' },
  { key: 'action', label: '核心动作', w: 'w-[170px]' },
  { key: 'anchor', label: '空间锚点', w: 'w-[120px]' },
  { key: 'motion', label: '运动规则', w: 'w-[160px]' },
  { key: 'blocking', label: '人物位置', w: 'w-[150px]' },
  { key: 'continuity', label: '连续性约束', w: 'w-[160px]' },
  { key: 'subject', label: '主体约束', w: 'w-[100px]' },
  { key: 'forbid', label: '不可变化项', w: 'w-[160px]' },
  { key: 'background', label: '背景范围', w: 'w-[140px]' },
]

type ShotPop = { rect: DOMRect; label: string; value: string } | null

export default function Step4Shots({ project }: { project: Project }) {
  const { generateShots, deleteShot, regenerateShot, startVideos } = useStore()
  const st = project.shotStatus
  const shots = project.shots

  const [genOpen, setGenOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [edit, setEdit] = useState<Shot | null>(null)
  const [menu, setMenu] = useState<{ s: Shot; top: number; left: number } | null>(null)
  const [videoConfirm, setVideoConfirm] = useState<string[] | null>(null)
  const [pop, setPop] = useState<ShotPop>(null)

  // 镜头生成完成后，默认选中所有尚未生成视频（或已失效）的镜头
  useEffect(() => {
    if (st !== 'done') return
    setSel(shots.filter((s) => s.video.state === 'none' || s.video.stale).map((s) => s.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, shots.length])

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const allSelected = shots.length > 0 && sel.length === shots.length
  const toggleAll = () => setSel(allSelected ? [] : shots.map((s) => s.id))

  const openPop = (e: React.MouseEvent, label: string, value?: string) => {
    if (!value || !String(value).trim()) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPop({ rect, label, value: String(value) })
  }

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

      {project.shotStale && <StaleNotice text="角色与场景已更新，建议重新生成镜头。" actionText="重新生成镜头" onAction={() => setGenOpen(true)} />}

      <div className="mb-3 text-[13px] text-muted">
        勾选需要生成视频的镜头 · 点击单元格查看完整内容，「操作」可编辑镜头详情
      </div>

      <div className="overflow-x-auto rounded-xl border border-line/70 bg-panel">
        <table className="w-full min-w-[1560px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[110px]" />
            {SHOT_COLS.map((c) => (
              <col key={c.key} className={c.w} />
            ))}
            <col className="w-[56px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-panel2/70 text-[12px] font-medium text-faint">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-brand align-middle"
                  title={allSelected ? '取消全选' : '全选'}
                />
              </th>
              <th className="whitespace-nowrap px-3 py-3">镜号</th>
              {SHOT_COLS.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-3">
                  {c.label}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((s) => {
              const vi = videoStateInfo(s.video)
              return (
                <tr
                  key={s.id}
                  className={`group border-b border-line/50 align-top last:border-b-0 transition-colors ${
                    sel.includes(s.id) ? 'bg-brand/[0.06]' : 'hover:bg-panel2/50'
                  }`}
                >
                  <td className="px-3 py-3.5">
                    <input
                      type="checkbox"
                      checked={sel.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      className="accent-brand align-middle"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[13px] font-medium tabular-nums text-white/85">{no2(s.no)}</span>
                      <span className="text-[11px] text-faint">{fmtDur('15s')}</span>
                    </div>
                    <div className={`mt-1.5 inline-flex items-center gap-1 text-[11px] ${vi.cls}`}>
                      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${vi.dot}`} />
                      {vi.text}
                    </div>
                  </td>
                  {SHOT_COLS.map((c) => (
                    <td key={c.key} className="px-3 py-3">
                      <ReadCell value={String(s[c.key] ?? '')} onClick={(e) => openPop(e, c.label, String(s[c.key] ?? ''))} />
                    </td>
                  ))}
                  <td className="px-3 py-3.5 text-center">
                    <button
                      className="rounded-md px-1.5 py-0.5 text-muted transition-colors hover:bg-panel2 hover:text-white"
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setMenu({ s, top: r.bottom + 4, left: r.left - 160 })
                      }}
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {pop && <CellPopover {...pop} onClose={() => setPop(null)} />}
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
          <MenuItem onClick={() => { setEdit(menu.s); setMenu(null) }}>编辑镜头详情</MenuItem>
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
