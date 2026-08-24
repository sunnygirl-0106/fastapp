import { useState } from 'react'
import type { Project, Shot } from '@/types'
import { SHOT_FIELDS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST } from '@/services/generation'
import {
  Button,
  FakeSelect,
  Label,
  MenuItem,
  Modal,
  Popover,
  Spinner,
  Textarea,
  fmt,
} from '@/components/ui'
import ShotEditDrawer from './ShotEditDrawer'

const COLS = ['镜号', ...SHOT_FIELDS.map((f) => f.label)]
const GRID =
  'grid-cols-[70px_240px_220px_180px_150px_180px_140px_180px_140px_180px_160px_60px]'

export default function Step4Shots({ project }: { project: Project }) {
  const { generateShots, deleteShot, regenerateShot, generateVideos, goStep } = useStore()
  const st = project.shotStatus
  const shots = project.shots

  const [genOpen, setGenOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [edit, setEdit] = useState<Shot | null>(null)
  const [menu, setMenu] = useState<{ s: Shot; top: number; left: number } | null>(null)
  const [videoConfirm, setVideoConfirm] = useState<string[] | null>(null)

  const runningVideos = shots.filter((s) => s.video.state === 'generating').length
  const doneVideos = shots.filter((s) => s.video.state === 'done').length
  const allSelected = shots.length > 0 && sel.length === shots.length

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleAll = () => setSel(allSelected ? [] : shots.map((s) => s.id))

  return (
    <div>
      {/* 工具栏 */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="soft" disabled={st === 'generating'} onClick={() => setGenOpen(true)}>
          {st === 'generating' ? (
            <>
              <Spinner size={13} /> 生成中…
            </>
          ) : st === 'done' ? (
            '重新生成'
          ) : (
            '生成分镜'
          )}
        </Button>
        {st === 'done' && (
          <>
            <span className="text-xs text-muted">
              共 {shots.length} 镜 · 约 {shots.length * 15}s
              {runningVideos > 0
                ? ` · ${runningVideos} 镜生成中`
                : doneVideos > 0
                  ? ` · ${doneVideos} 镜已出片`
                  : ''}
            </span>
            <button
              disabled={sel.length === 0}
              onClick={() => setVideoConfirm(sel.length ? sel : shots.map((s) => s.id))}
              className={`ml-2 rounded-lg px-3.5 py-1.5 text-sm ${
                sel.length ? 'bg-brand text-black hover:bg-brand-dim' : 'bg-panel2 text-faint'
              }`}
            >
              生成视频 · {sel.length ? `全部(${sel.length})` : '未选中'}
            </button>
          </>
        )}
      </div>

      <div className="mb-2 text-sm font-medium">分镜（{shots.length}）</div>

      {st === 'none' && <div className="py-10 text-sm text-faint">还没有分镜，请先生成。</div>}
      {st === 'generating' && (
        <div className="flex items-center gap-2 py-10 text-sm text-muted">
          <Spinner /> 正在根据剧情分段生成分镜…
        </div>
      )}

      {st === 'done' && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <div className="min-w-[2020px]">
            <div className={`grid ${GRID} gap-3 border-b border-line bg-panel2 px-3 py-2.5 text-xs text-muted`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-brand" />
                镜号
              </div>
              {SHOT_FIELDS.map((f) => (
                <div key={f.key}>{f.label}</div>
              ))}
              <div>操作</div>
            </div>
            {shots.map((s) => (
              <div
                key={s.id}
                onClick={() => setEdit(s)}
                className={`grid ${GRID} cursor-pointer gap-3 border-b border-line/60 px-3 py-3 text-[13px] last:border-0 hover:bg-panel2 ${
                  sel.includes(s.id) ? 'bg-panel2/60' : ''
                }`}
              >
                <div className="flex items-start gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={sel.includes(s.id)}
                    onChange={() => toggle(s.id)}
                    className="mt-0.5 accent-brand"
                  />
                  <div>
                    <div>{s.no}</div>
                    {s.video.state === 'done' && <div className="mt-1 text-[11px] text-brand">● 已完成</div>}
                    {s.video.state === 'generating' && <div className="mt-1 text-[11px] text-amber-400">生成中</div>}
                  </div>
                </div>
                {SHOT_FIELDS.map((f) => (
                  <div key={f.key} className="line-clamp-3 whitespace-pre-line text-muted">
                    {String(s[f.key] ?? '')}
                  </div>
                ))}
                <div onClick={(e) => e.stopPropagation()}>
                  <button
                    className="text-muted hover:text-white"
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMenu({ s, top: r.bottom + 4, left: r.left - 150 })
                    }}
                  >
                    ⋯
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 生成分镜弹窗 */}
      {genOpen && (
        <GenShotModal
          project={project}
          onClose={() => setGenOpen(false)}
          onGen={async (segNos) => {
            setGenOpen(false)
            await generateShots(segNos)
          }}
        />
      )}

      {/* 行 ⋯ 菜单 */}
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { regenerateShot(menu.s.id); setMenu(null) }}>重出分镜</MenuItem>
          <MenuItem
            onClick={() => {
              setVideoConfirm([menu.s.id])
              setMenu(null)
            }}
          >
            视频生成
          </MenuItem>
          <MenuItem danger onClick={() => { deleteShot(menu.s.id); setMenu(null) }}>
            删除分镜
          </MenuItem>
        </Popover>
      )}

      {/* 编辑分镜抽屉 */}
      {edit && <ShotEditDrawer project={project} shotId={edit.id} onClose={() => setEdit(null)} />}

      {/* 确认生成视频 */}
      {videoConfirm && (
        <VideoConfirmModal
          count={videoConfirm.length}
          balance={project.balance}
          onClose={() => setVideoConfirm(null)}
          onConfirm={async () => {
            const ids = videoConfirm
            setVideoConfirm(null)
            goStep(5)
            await generateVideos(ids)
          }}
        />
      )}
    </div>
  )
}

function GenShotModal({
  project,
  onClose,
  onGen,
}: {
  project: Project
  onClose: () => void
  onGen: (segNos: number[]) => void
}) {
  const [style, setStyle] = useState('')
  const [sel, setSel] = useState<number[]>(project.segments.map((s) => s.no))
  const toggle = (no: number) => setSel((s) => (s.includes(no) ? s.filter((x) => x !== no) : [...s, no]))
  const cost = sel.length * COST.shotGenEach
  return (
    <Modal
      title="生成分镜"
      width={860}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-[13px] text-muted">
            已选 {sel.length} / {project.segments.length} 段 · <span className="text-white">✦{fmt(cost)}</span>
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={!sel.length} onClick={() => onGen(sel)}>
              生成全部（{sel.length}）
            </Button>
          </div>
        </div>
      }
    >
      <Label>文本模型</Label>
      <FakeSelect value="灵犀3.1 pro" />
      <div className="h-3" />
      <Label>风格参考（可选）</Label>
      <Textarea rows={2} placeholder="风格、光影、色调、材质、美术笔触、画面氛围等相关描述" value={style} onChange={(e) => setStyle(e.target.value)} />
      <div className="mb-2 mt-4 text-[13px] text-muted">选择要生成分镜的段（{project.segments.length}）</div>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[40px_60px_160px_70px_90px_1fr] gap-2 border-b border-line bg-panel2 px-3 py-2 text-xs text-muted">
          <div>
            <input
              type="checkbox"
              checked={sel.length === project.segments.length}
              onChange={() => setSel(sel.length === project.segments.length ? [] : project.segments.map((s) => s.no))}
              className="accent-brand"
            />
          </div>
          <div>段号</div>
          <div>标题</div>
          <div>时长</div>
          <div>场景</div>
          <div>原文</div>
        </div>
        {project.segments.map((s) => (
          <div key={s.id} className="grid grid-cols-[40px_60px_160px_70px_90px_1fr] gap-2 border-b border-line/60 px-3 py-2 text-[13px] last:border-0">
            <div>
              <input type="checkbox" checked={sel.includes(s.no)} onChange={() => toggle(s.no)} className="accent-brand" />
            </div>
            <div>{s.no}</div>
            <div>{s.title}</div>
            <div className="text-muted">{s.dur}</div>
            <div className="text-faint">客厅</div>
            <div className="line-clamp-1 text-muted">{s.text}</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function VideoConfirmModal({
  count,
  balance,
  onClose,
  onConfirm,
}: {
  count: number
  balance: number
  onClose: () => void
  onConfirm: () => void
}) {
  const cost = count * COST.videoEach
  return (
    <Modal
      title={`确认生成视频（${count} 段）`}
      width={440}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={onConfirm}>
            确认生成
          </Button>
        </>
      }
    >
      <Label>视频模型</Label>
      <div className="text-brand">Seedance 2.0</div>
      <div className="mt-4 flex gap-8">
        <div>
          <Label>分辨率</Label>
          <FakeSelect value="720p" />
        </div>
        <div>
          <Label>比例</Label>
          <FakeSelect value="9:16" />
        </div>
        <div>
          <Label>配音</Label>
          <input type="checkbox" defaultChecked className="mt-2 accent-brand" />
        </div>
      </div>
      <div className="mt-4 text-[13px] text-muted">
        合计预计消耗 <span className="text-white">{fmt(cost)}</span> 星钻（{count} 段）· 余额 {fmt(balance)}
      </div>
    </Modal>
  )
}
