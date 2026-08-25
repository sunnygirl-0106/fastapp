import { useMemo, useState } from 'react'
import type { Project, Shot } from '@/types'
import { SHOT_FIELDS, SHOT_GROUPS } from '@/types'
import { useStore } from '@/store/workflowStore'
import { Button, Drawer, Modal, Textarea } from '@/components/ui'
import { no2 } from '@/utils/project'

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? k

export default function ShotEditDrawer({
  project,
  shotId,
  onClose,
}: {
  project: Project
  shotId: string
  onClose: () => void
}) {
  const { updateShot, deleteShot } = useStore()
  const shots = project.shots
  const [curId, setCurId] = useState(shotId)
  const idx = shots.findIndex((s) => s.id === curId)
  const shot = shots[idx]

  const [draft, setDraft] = useState<Record<string, string>>(() => snapshot(shot))
  const [confirmDel, setConfirmDel] = useState(false)
  const [pending, setPending] = useState<null | number>(null) // 未保存拦截：目标 index，-1=关闭

  const dirty = useMemo(() => SHOT_FIELDS.some((f) => draft[f.key] !== String(shot[f.key] ?? '')), [draft, shot])

  function snapshot(s: Shot): Record<string, string> {
    const o: Record<string, string> = {}
    SHOT_FIELDS.forEach((f) => (o[f.key] = String(s[f.key] ?? '')))
    return o
  }

  const save = () => updateShot(curId, draft as Partial<Shot>)

  const gotoIndex = (i: number) => {
    if (i < 0 || i >= shots.length) return
    if (dirty) { setPending(i); return }
    switchTo(i)
  }
  const switchTo = (i: number) => {
    const s = shots[i]
    setCurId(s.id)
    setDraft(snapshot(s))
  }

  const tryClose = () => {
    if (dirty) setPending(-1)
    else onClose()
  }

  if (!shot) return null

  return (
    <Drawer
      width={640}
      header={
        <div className="flex items-center gap-3">
          <span className="text-brand text-[15px] font-semibold">镜头详情 {no2(shot.no)}</span>
          <div className="flex items-center gap-1 text-xs text-muted">
            <button className="px-1 hover:text-white disabled:opacity-30" disabled={idx === 0} onClick={() => gotoIndex(idx - 1)}>
              ‹ 上一段
            </button>
            <span>
              {idx + 1}/{shots.length}
            </span>
            <button
              className="px-1 hover:text-white disabled:opacity-30"
              disabled={idx === shots.length - 1}
              onClick={() => gotoIndex(idx + 1)}
            >
              下一段 ›
            </button>
          </div>
        </div>
      }
      onClose={tryClose}
      footer={
        <>
          <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>
            删除镜头
          </Button>
          <div className="flex gap-2">
            <Button onClick={tryClose}>关闭</Button>
            <Button variant="primary" disabled={!dirty} onClick={() => { save(); onClose() }}>
              保存修改
            </Button>
          </div>
        </>
      }
    >
      {SHOT_GROUPS.map((g) => (
        <div key={g.title} className="mb-5">
          <div className="mb-2 text-xs uppercase tracking-wide text-faint">{g.title}</div>
          {g.fields.map((k) => (
            <div key={k} className="mb-3">
              <div className="mb-1 text-sm text-brand">
                {labelOf(k)}
                {k === 'timeline' && <span className="ml-1 text-xs text-faint">（每行一条）</span>}
              </div>
              <Textarea
                rows={k === 'timeline' || k === 'shot' || k === 'motion' ? 3 : 2}
                value={draft[k]}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ))}

      {confirmDel && (
        <Modal
          title="删除镜头"
          width={380}
          onClose={() => setConfirmDel(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDel(false)}>取消</Button>
              <Button variant="danger-solid" onClick={() => { deleteShot(curId); onClose() }}>
                删除镜头
              </Button>
            </>
          }
        >
          <div className="text-sm text-white/85">确定删除镜头 {no2(shot.no)} 吗？删除后无法恢复。</div>
        </Modal>
      )}

      {pending !== null && (
        <Modal
          title="未保存的修改"
          width={380}
          onClose={() => setPending(null)}
          footer={
            <>
              <Button onClick={() => setPending(null)}>继续编辑</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = pending
                  setDraft(snapshot(shot)) // 放弃
                  setPending(null)
                  if (target === -1) onClose()
                  else switchTo(target)
                }}
              >
                放弃修改
              </Button>
            </>
          }
        >
          <div className="text-sm text-muted">当前分镜有未保存的修改，是否放弃？</div>
        </Modal>
      )}
    </Drawer>
  )
}
