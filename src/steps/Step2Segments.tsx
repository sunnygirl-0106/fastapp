import { useState } from 'react'
import type { Project, Segment } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST } from '@/services/generation'
import {
  Button,
  CostRow,
  Drawer,
  FakeSelect,
  Input,
  InlineRename,
  Label,
  Modal,
  Spinner,
  StatusPill,
  Textarea,
} from '@/components/ui'

const COLS = ['段号', '标题', '时长', '场景', '出场角色', '核心动作', '时间线', '原文']

export default function Step2Segments({ project }: { project: Project }) {
  const { generateSegments, addSegment, updateSegmentTitle, deleteSegment } = useStore()
  const [genOpen, setGenOpen] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [edit, setEdit] = useState<Segment | null>(null)
  const [rename, setRename] = useState<string | null>(null)

  const st = project.segStatus
  const segs = project.segments

  const doGen = async () => {
    setGenOpen(false)
    setRegenOpen(false)
    await generateSegments()
  }

  return (
    <div>
      {/* 工具栏 */}
      <div className="mb-4 flex items-center gap-3">
        <Button
          variant="soft"
          onClick={() => (st === 'done' ? setRegenOpen(true) : setGenOpen(true))}
          disabled={st === 'generating'}
        >
          {st === 'generating' ? (
            <>
              <Spinner size={13} /> 生成中…
            </>
          ) : st === 'done' ? (
            '重新生成'
          ) : (
            '生成分段'
          )}
        </Button>
        <StatusPill label="分段状态" status={st} />
      </div>

      {/* 列表标题 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">段列表（{segs.length}）</div>
        {st === 'done' && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            ＋ 新增段
          </Button>
        )}
      </div>

      {/* 三态 */}
      {st === 'none' && <div className="py-10 text-sm text-faint">还没有分段，先生成。</div>}
      {st === 'generating' && (
        <div className="flex items-center gap-2 py-10 text-sm text-muted">
          <Spinner /> 正在生成剧情分段…
        </div>
      )}
      {st === 'done' && (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="grid grid-cols-[60px_160px_70px_90px_120px_120px_120px_1fr] gap-3 border-b border-line bg-panel2 px-4 py-2.5 text-xs text-muted">
            {COLS.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          {segs.map((s) => (
            <div
              key={s.id}
              onClick={() => setEdit(s)}
              className="grid cursor-pointer grid-cols-[60px_160px_70px_90px_120px_120px_120px_1fr] gap-3 border-b border-line/60 px-4 py-3 text-sm last:border-0 hover:bg-panel2"
            >
              <div>{s.no}</div>
              <div
                onClick={(e) => rename === s.id && e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); setRename(s.id) }}
              >
                {rename === s.id ? (
                  <InlineRename
                    value={s.title}
                    onCommit={(v) => {
                      updateSegmentTitle(s.id, v)
                      setRename(null)
                    }}
                  />
                ) : (
                  s.title
                )}
              </div>
              <div className="text-muted">{s.dur}</div>
              <div className="text-faint">{s.scene ?? '—'}</div>
              <div className="text-faint">{s.roles ?? '—'}</div>
              <div className="text-faint">{s.action ?? '—'}</div>
              <div className="text-faint">{s.timeline ?? '—'}</div>
              <div className="line-clamp-2 text-muted">{s.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* 生成分段弹窗 */}
      {genOpen && (
        <Modal
          title="生成分段"
          onClose={() => setGenOpen(false)}
          footer={
            <>
              <Button onClick={() => setGenOpen(false)}>取消</Button>
              <Button variant="primary" onClick={doGen}>
                确认生成
              </Button>
            </>
          }
        >
          <Label>文本模型</Label>
          <FakeSelect value="灵犀3.1 pro" />
          <CostRow cost={COST.segGen} balance={project.balance} />
        </Modal>
      )}

      {/* 重新生成确认 */}
      {regenOpen && (
        <Modal
          title="重新生成分段"
          width={380}
          onClose={() => setRegenOpen(false)}
          footer={
            <>
              <Button onClick={() => setRegenOpen(false)}>取消</Button>
              <Button variant="primary" onClick={doGen}>
                消耗 {COST.segGen} 星钻并重新生成
              </Button>
            </>
          }
        >
          <div className="text-sm text-muted">重新生成将覆盖现有分段，消耗 {COST.segGen} 星钻。</div>
        </Modal>
      )}

      {/* 新增段弹窗 */}
      {addOpen && <AddSegModal nextNo={segs.length + 1} onClose={() => setAddOpen(false)} onAdd={addSegment} />}

      {/* 编辑段抽屉 */}
      {edit && (
        <EditSegDrawer
          seg={edit}
          onClose={() => setEdit(null)}
          onSave={(title) => {
            updateSegmentTitle(edit.id, title)
            setEdit(null)
          }}
          onDelete={() => {
            deleteSegment(edit.id)
            setEdit(null)
          }}
        />
      )}
    </div>
  )
}

function AddSegModal({
  nextNo,
  onClose,
  onAdd,
}: {
  nextNo: number
  onClose: () => void
  onAdd: (title: string, text: string) => void
}) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const ok = title.trim() && text.trim()
  return (
    <Modal
      title="新增段"
      width={480}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              onAdd(title, text)
              onClose()
            }}
          >
            添加
          </Button>
        </>
      }
    >
      <Label>段号（自动）</Label>
      <div className="mb-3 inline-block rounded bg-panel2 px-3 py-1.5 text-sm">{nextNo}</div>
      <Label req>标题</Label>
      <Input placeholder="必填，如：苏晚推门对峙" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="h-3" />
      <Label req>原文</Label>
      <Textarea
        rows={5}
        placeholder="必填，填入该段剧本原文，用于后续提取实体/分镜"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  )
}

function EditSegDrawer({
  seg,
  onClose,
  onSave,
  onDelete,
}: {
  seg: Segment
  onClose: () => void
  onSave: (title: string) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(seg.title)
  const [confirmDel, setConfirmDel] = useState(false)
  const dirty = title.trim() !== seg.title
  const ro = (v?: string) => (
    <div className="min-h-[38px] whitespace-pre-line rounded-lg border border-line bg-panel2/50 px-3 py-2 text-sm text-muted">
      {v && v.length ? v : '—'}
    </div>
  )
  return (
    <Drawer
      width={480}
      header={
        <div className="text-brand text-[15px] font-semibold">
          编辑段 #{seg.no} <span className="ml-2 text-xs font-normal text-faint">时长 15s（不可改）</span>
        </div>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>
            删除段
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" disabled={!dirty} onClick={() => onSave(title)}>
              保存
            </Button>
          </div>
        </>
      }
    >
      <Label req>标题</Label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="mt-4 space-y-1">
        <Label>原文（只读）</Label>
        {ro(seg.text)}
      </div>
      <div className="mt-4 space-y-1">
        <Label>场景（只读）</Label>
        {ro(seg.scene)}
      </div>
      <div className="mt-4 space-y-1">
        <Label>出场角色（只读）</Label>
        {ro(seg.roles)}
      </div>
      <div className="mt-4 space-y-1">
        <Label>核心动作（只读）</Label>
        {ro(seg.action)}
      </div>
      <div className="mt-4 space-y-1">
        <Label>时间线（只读）</Label>
        {ro(seg.timeline)}
      </div>

      {confirmDel && (
        <Modal
          title="删除段"
          width={360}
          onClose={() => setConfirmDel(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDel(false)}>取消</Button>
              <Button variant="primary" onClick={onDelete}>
                确认
              </Button>
            </>
          }
        >
          <div className="text-sm">确定删除「{seg.title}」？</div>
        </Modal>
      )}
    </Drawer>
  )
}
