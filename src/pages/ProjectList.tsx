import { useState } from 'react'
import { ChevronLeft, MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useStore } from '@/store/workflowStore'
import { ProjectsTopBar } from '@/components/TopBar'
import { Button, Input, Label, Modal, Overlay } from '@/components/ui'
import { DEFAULT_BALANCE } from '@/data/mock'
import { formatCreatedAt, isDone, isRunning, projectCover, projectStatus } from '@/utils/project'
import emptyCover from '@/assets/cover-empty.png'

// 设计稿主按钮渐变（浅青 → 白青）
const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

export default function ProjectList() {
  const projects = useStore((s) => s.projects)
  const openProject = useStore((s) => s.openProject)
  const createProject = useStore((s) => s.createProject)
  const renameProject = useStore((s) => s.renameProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const balance = projects[0]?.balance ?? DEFAULT_BALANCE
  const cfg = projects[0]?.config

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')

  const submit = () => {
    if (!name.trim()) return
    createProject(name)
    setName('')
    setCreateOpen(false)
  }

  const startRename = (id: string, current: string) => {
    setMenuId(null)
    setRenameId(id)
    setRenameName(current)
  }

  const submitRename = () => {
    if (!renameId || !renameName.trim()) return
    renameProject(renameId, renameName)
    setRenameId(null)
  }

  const delTarget = projects.find((p) => p.id === confirmDel)

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-white">
      <ProjectsTopBar balance={balance} />
      <div className="flex flex-1">
        {/* 侧边栏 */}
        <aside className="w-[200px] shrink-0 border-r border-white/5 bg-white/5 py-4">
          <div className="flex flex-col gap-3 px-4">
            <div className="flex items-center gap-2 text-base text-white">
              <ChevronLeft size={16} className="text-[#9b9b9b]" /> 工作流
            </div>
            <div className="rounded-lg bg-white/5 p-3 backdrop-blur-[6px]">
              <div className="text-[10px] text-white/40">当前模式</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-medium text-white">{cfg?.mode ?? '全自动 AI 生成'}</span>
                <button className="text-[10px] text-accent-tag">切换模式</button>
              </div>
            </div>
          </div>
        </aside>

        {/* 主区 */}
        <main className="flex-1 px-8 py-6">
          {/* 页头 */}
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h1 className="text-xl font-medium text-white">我的项目</h1>
              <p className="mt-1.5 text-xs text-white/60">管理您的 AI 视频项目 · 共 {projects.length} 个项目</p>
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              style={CTA_GRADIENT}
              className="flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium text-black transition-transform hover:brightness-105 active:scale-[0.98]"
            >
              <Plus size={14} strokeWidth={2.5} /> 新建项目
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {projects.map((p) => {
              const running = isRunning(p)
              const done = isDone(p)
              const cover = projectCover(p)
              const status = projectStatus(p)
              return (
                <div
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className="group relative flex h-[300px] cursor-pointer flex-col overflow-hidden rounded-lg border border-white/5 bg-card transition-colors hover:border-white/15"
                >
                  {/* 封面 */}
                  <div
                    className="relative flex-1 overflow-hidden bg-cover bg-center"
                    style={{ backgroundImage: `url("${cover ?? emptyCover}")` }}
                  >
                    {/* 顶部渐隐，保证操作按钮清晰；空态图本身已带暗底，仅在有封面图时叠加 */}
                    {cover && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 to-transparent to-[55%]" />
                    )}

                    {/* 更多操作：默认隐藏，hover 卡片或菜单展开时显示 */}
                    <div className="absolute right-3 top-3">
                      <button
                        title="更多操作"
                        aria-label="更多操作"
                        className={`flex h-8 w-8 items-center justify-center rounded-3xl bg-black/20 text-white/90 backdrop-blur-[6px] transition hover:bg-black/50 hover:text-white focus:opacity-100 ${
                          menuId === p.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuId(menuId === p.id ? null : p.id)
                        }}
                      >
                        <MoreVertical size={15} />
                      </button>

                      {menuId === p.id && (
                        <div
                          className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-white/10 bg-[#1c1e20] py-1 shadow-xl shadow-black/40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-white/90 transition hover:bg-white/5"
                            onClick={() => startRename(p.id, p.name)}
                          >
                            <Pencil size={14} className="text-white/50" /> 重命名
                          </button>
                          <button
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-red-400 transition hover:bg-red-500/10"
                            onClick={() => {
                              setMenuId(null)
                              setConfirmDel(p.id)
                            }}
                          >
                            <Trash2 size={14} /> 删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 文字区 */}
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-base font-medium text-white">{p.name}</div>
                      {running ? (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-amber-300">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                          {status}
                        </span>
                      ) : (
                        <span className={`shrink-0 text-xs ${done ? 'text-accent' : 'text-white/80'}`}>{status}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center text-xs text-white/40">
                      <span>{formatCreatedAt(p.createdAt)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>

      {/* 点击空白关闭卡片菜单 */}
      {menuId && <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />}

      {renameId && (
        <Modal
          title="重命名项目"
          width={380}
          onClose={() => setRenameId(null)}
          footer={
            <>
              <Button onClick={() => setRenameId(null)}>取消</Button>
              <Button variant="primary" disabled={!renameName.trim()} onClick={submitRename}>
                保存
              </Button>
            </>
          }
        >
          <Label>项目名称</Label>
          <Input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitRename()}
          />
        </Modal>
      )}

      {createOpen && (
        <Overlay onClose={() => setCreateOpen(false)}>
          <div className="w-[460px] overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
            {/* 头部 */}
            <div className="flex h-16 items-center justify-between border-b border-white/5 px-5">
              <div className="text-base font-medium text-white">新建视频项目</div>
              <button
                className="text-white/50 transition-colors hover:text-white"
                onClick={() => setCreateOpen(false)}
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </div>

            {/* 主体 */}
            <div className="flex flex-col gap-3 px-5 py-6">
              <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                <Pencil size={12} className="text-white/90" /> 项目名称
              </div>
              <input
                autoFocus
                placeholder="例如：最后的外卖"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="w-full rounded-lg bg-black/40 p-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:ring-1 focus:ring-accent/40"
              />
              <div className="text-sm text-white/40">创建后将从添加剧本内容开始</div>
            </div>

            {/* 底部操作 */}
            <div className="flex h-16 items-center justify-end gap-2 px-5 pb-5">
              <button
                onClick={() => setCreateOpen(false)}
                className="h-10 w-24 rounded-full border border-white/20 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={!name.trim()}
                style={CTA_GRADIENT}
                className="h-10 w-24 rounded-full text-sm font-medium text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                创建项目
              </button>
            </div>
          </div>
        </Overlay>
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
