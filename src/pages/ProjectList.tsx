import { useState } from 'react'
import { useStore } from '@/store/workflowStore'
import { ProjectsTopBar } from '@/components/TopBar'
import { Button, Input, Label, Modal, Popover, MenuItem } from '@/components/ui'
import { DEFAULT_BALANCE } from '@/data/mock'

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
    createProject(name)
    setName('')
    setCreateOpen(false)
  }

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
        <main className="flex-1 px-8 py-4">
          <div className="mb-4 flex justify-center">
            <Button variant="ghost" onClick={() => setCreateOpen(true)}>
              ＋ 新建
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => openProject(p.id)}
                className="group relative cursor-pointer rounded-xl bg-panel px-5 py-4 transition-colors hover:bg-panel2"
              >
                <div className="text-brand">《{p.name}》</div>
                <div className="mt-1 text-xs text-faint">
                  #{p.no} · {new Date(p.createdAt).toLocaleString('zh-CN', { hour12: false }).slice(0, 16).replace(/\//g, '-')}
                </div>
                <button
                  className="absolute right-3 top-3 hidden text-muted hover:text-white group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation()
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setMenu({ id: p.id, top: r.bottom + 4, left: r.left - 130 })
                  }}
                >
                  ⋯
                </button>
              </div>
            ))}
          </div>
        </main>
      </div>

      {createOpen && (
        <Modal
          title="新建全自动AI生成项目"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button variant="primary" onClick={submit}>
                创建
              </Button>
            </>
          }
        >
          <Label>项目名称</Label>
          <Input
            autoFocus
            placeholder="输入项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
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

      {confirmDel && (
        <Modal
          title="删除项目"
          width={360}
          onClose={() => setConfirmDel(null)}
          footer={
            <>
              <Button onClick={() => setConfirmDel(null)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  deleteProject(confirmDel)
                  setConfirmDel(null)
                }}
              >
                确认
              </Button>
            </>
          }
        >
          <div className="text-sm">确定删除该项目？此操作不可撤销。</div>
        </Modal>
      )}
    </div>
  )
}
