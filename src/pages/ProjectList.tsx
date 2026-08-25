import { useState } from 'react'
import { useStore } from '@/store/workflowStore'
import { ProjectsTopBar } from '@/components/TopBar'
import { Button, Input, Label, Modal, Popover, MenuItem } from '@/components/ui'
import { DEFAULT_BALANCE } from '@/data/mock'
import { formatCreatedAt, isDone, isRunning, projectStatus } from '@/utils/project'

export default function ProjectList() {
  const projects = useStore((s) => s.projects)
  const openProject = useStore((s) => s.openProject)
  const createProject = useStore((s) => s.createProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const balance = projects[0]?.balance ?? DEFAULT_BALANCE

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const submit = () => {
    if (!name.trim()) return
    createProject(name)
    setName('')
    setCreateOpen(false)
  }

  const delTarget = projects.find((p) => p.id === confirmDel)

  return (
    <div className="flex min-h-screen flex-col">
      <ProjectsTopBar balance={balance} />
      <div className="flex flex-1">
        {/* 侧边栏 */}
        <aside className="w-64 shrink-0 border-r border-line/60 px-5 py-4">
          <div className="flex items-center gap-2 text-[17px] font-semibold">
            <span className="text-muted">‹</span> 工作流
          </div>
          <div className="mt-3 flex gap-2">
            <span className="rounded bg-panel2 px-2 py-1 text-xs text-muted">9:16 竖屏</span>
            <span className="rounded bg-panel2 px-2 py-1 text-xs text-muted">写实</span>
          </div>
          <div className="mt-4 rounded-lg bg-panel p-3">
            <div className="text-xs text-faint">当前模式</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-medium">全自动 AI 生成</span>
              <button className="text-xs text-brand">切换模式</button>
            </div>
          </div>
        </aside>

        {/* 主区 */}
        <main className="flex-1 px-8 py-6">
          {/* 页头 */}
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h1 className="text-[22px] font-semibold">我的项目</h1>
              <p className="mt-1 text-[13px] text-muted">管理你的 AI 视频项目 · 共 {projects.length} 个项目</p>
            </div>
            <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
              ＋ 新建项目
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const running = isRunning(p)
              const done = isDone(p)
              return (
                <div
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className="group relative cursor-pointer rounded-xl border border-line/60 bg-panel px-5 py-4 pr-12 transition-colors hover:border-line hover:bg-panel2"
                >
                  <div className="text-[15px] font-medium text-white">{p.name}</div>

                  <div className="mt-2 flex items-center gap-2 text-[13px]">
                    {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />}
                    <span className={running ? 'text-amber-300' : done ? 'text-brand' : 'text-muted'}>
                      {projectStatus(p)}
                    </span>
                  </div>

                  <div className="mt-3 text-xs text-faint">{p.config.ratio} · {p.config.style}</div>
                  <div className="mt-1 text-xs text-faint">{formatCreatedAt(p.createdAt)}</div>

                  {/* ⋯ 按钮：位置固定预留（pr-12），默认弱显示，悬浮变亮，绝不消失 */}
                  <button
                    className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-50 transition hover:bg-line hover:text-white group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setMenu({ id: p.id, top: r.bottom + 4, left: r.left - 130 })
                    }}
                  >
                    ⋯
                  </button>
                </div>
              )
            })}
          </div>
        </main>
      </div>

      {createOpen && (
        <Modal
          title="新建视频项目"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button variant="primary" disabled={!name.trim()} onClick={submit}>
                创建项目
              </Button>
            </>
          }
        >
          <Label>项目名称</Label>
          <Input
            autoFocus
            placeholder="例如：最后的外卖"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <div className="mt-2 text-[13px] text-faint">创建后将从添加故事内容开始。</div>
        </Modal>
      )}

      {menu && (
        <Popover anchor={{ top: menu.top, left: menu.left }} onClose={() => setMenu(null)} width={140}>
          <MenuItem
            danger
            onClick={() => {
              setConfirmDel(menu.id)
              setMenu(null)
            }}
          >
            删除项目
          </MenuItem>
        </Popover>
      )}

      {confirmDel && delTarget && (
        <Modal
          title="删除项目"
          width={380}
          onClose={() => setConfirmDel(null)}
          footer={
            <>
              <Button onClick={() => setConfirmDel(null)}>取消</Button>
              <Button
                variant="danger-solid"
                onClick={() => {
                  deleteProject(confirmDel)
                  setConfirmDel(null)
                }}
              >
                删除项目
              </Button>
            </>
          }
        >
          <div className="text-sm text-white/85">确定删除「{delTarget.name}」吗？删除后无法恢复。</div>
        </Modal>
      )}
    </div>
  )
}
