import { useState, type ReactNode } from 'react'
import { MoreHorizontal, Pencil, X } from 'lucide-react'
import type { Asset, Project } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import {
  ActionBar,
  Button,
  Diamond,
  GenerateConfirmModal,
  GeneratingState,
  Input,
  Label,
  MenuItem,
  Modal,
  ModelSelect,
  Overlay,
  PageHeader,
  Popover,
  RefPlaceholder,
  Spinner,
  StaleNotice,
  Textarea,
  fmt,
} from '@/components/ui'
import Lightbox from '@/components/Lightbox'
import GenShotModal from './GenShotModal'

export default function Step3Assets({ project }: { project: Project }) {
  const { extractAssets, generateAssetImages, clearAssetImage, updateAsset, deleteAsset, startShots } = useStore()
  const st = project.assetStatus
  const chars = project.assets.filter((a) => a.kind === 'char')
  const scenes = project.assets.filter((a) => a.kind === 'scene')
  const missing = project.assets.filter((a) => a.imgState !== 'done')

  const [reextract, setReextract] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [genFor, setGenFor] = useState<Asset | null>(null)
  const [editFor, setEditFor] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<Asset | null>(null)
  const [shotOpen, setShotOpen] = useState(false)
  const [menu, setMenu] = useState<{ a: Asset; top: number; left: number } | null>(null)

  if (st === 'generating') {
    return (
      <>
        <GeneratingState
          title="正在识别角色与场景"
          desc="AI 正在从剧本中整理人物设定和主要场景。"
          phases={['正在识别主要角色…', '正在整理人物设定…', '正在提取剧本场景…']}
        />
        <ActionBar>
          <Button variant="primary" size="lg" disabled>
            正在提取角色与场景…
          </Button>
        </ActionBar>
      </>
    )
  }

  const renderCards = (list: Asset[], emptyText: string) =>
    list.length === 0 ? (
      <div className="col-span-full py-8 text-[13px] text-faint">{emptyText}</div>
    ) : (
      list.map((a) => (
        <AssetCard
          key={a.id}
          a={a}
          onZoom={() => setLightbox(a)}
          onMenu={(e) => openMenu(a, e)}
          onEdit={() => setEditFor(a.id)}
          onGen={() => setGenFor(a)}
        />
      ))
    )

  // 固定卡宽 260–280，自动排列：大屏 5–6 列、中屏 4、小屏 2–3，卡片不随屏拉大
  const gridCls = 'grid grid-cols-[repeat(auto-fill,minmax(260px,280px))] justify-start gap-4'

  return (
    <div>
      <PageHeader
        title="角色与场景"
        desc="完善角色与场景的设定和参考图，可以让后续画面更加一致。"
        right={
          <Button variant="ghost" size="sm" onClick={() => setReextract(true)}>
            重新提取
          </Button>
        }
      />

      {project.assetStale && (
        <StaleNotice
          text="剧本已重新拆解，建议重新提取角色与场景。"
          actionText="重新提取"
          onAction={() => setReextract(true)}
        />
      )}

      <Section title="角色" count={chars.length}>
        <div className={gridCls}>{renderCards(chars, '暂无角色')}</div>
      </Section>
      <Section title="场景" count={scenes.length}>
        <div className={gridCls}>{renderCards(scenes, '暂无场景')}</div>
      </Section>

      {/* 底部主操作栏：两种形态 */}
      {missing.length > 0 ? (
        <ActionBar>
          <button className="text-[13px] text-muted hover:text-white" onClick={() => setShotOpen(true)}>
            跳过参考图，继续生成镜头
          </button>
          <Button variant="primary" size="lg" onClick={() => setBatchOpen(true)}>
            生成全部参考图 · <Diamond />
            {fmt(missing.length * COST.assetImgEach)}
          </Button>
        </ActionBar>
      ) : (
        <ActionBar left="镜头将参考已生成的角色与场景图，保持画面一致">
          <Button variant="primary" size="lg" onClick={() => setShotOpen(true)}>
            生成镜头设计 · <Diamond />
            {fmt(project.segments.length * COST.shotGenEach)}
          </Button>
        </ActionBar>
      )}

      {/* 重新提取确认 */}
      {reextract && (
        <GenerateConfirmModal
          title="确认重新提取角色与场景"
          what="重新提取将重建角色与场景列表；已生成的参考图会尽量保留，下游镜头和视频会被标记为需要重新生成。"
          model={MODELS.text}
          cost={COST.assetExtract}
          balance={project.balance}
          confirmText="确认并重新提取"
          onClose={() => setReextract(false)}
          onConfirm={() => {
            setReextract(false)
            extractAssets()
          }}
        />
      )}

      {/* 批量生成参考图 */}
      {batchOpen && (
        <BatchModal
          assets={missing}
          balance={project.balance}
          onClose={() => setBatchOpen(false)}
          onGen={async (ids, edits) => {
            Object.entries(edits).forEach(([id, prompt]) => updateAsset(id, { prompt }))
            setBatchOpen(false)
            await generateAssetImages(ids)
          }}
        />
      )}

      {/* 单张生成参考图 */}
      {genFor && (
        <GenAssetImageModal
          a={genFor}
          balance={project.balance}
          onClose={() => setGenFor(null)}
          onConfirm={async (patch) => {
            const id = genFor.id
            if (patch.prompt !== genFor.prompt) updateAsset(id, { prompt: patch.prompt })
            setGenFor(null)
            await generateAssetImages([id])
          }}
        />
      )}

      {/* 编辑设定：居中弹窗 */}
      {editFor &&
        (() => {
          const a = project.assets.find((x) => x.id === editFor)
          if (!a) return null
          return (
            <AssetSettingModal
              a={a}
              onClose={() => setEditFor(null)}
              onSave={(patch) => updateAsset(a.id, patch)}
            />
          )
        })()}

      {lightbox && <Lightbox title={lightbox.name} url={lightbox.imageUrl} onClose={() => setLightbox(null)} />}

      {/* 生成镜头设计弹窗（与 Step4 共用） */}
      {shotOpen && (
        <GenShotModal
          project={project}
          onClose={() => setShotOpen(false)}
          onConfirm={(segNos) => {
            setShotOpen(false)
            startShots(segNos)
          }}
        />
      )}

      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { useStore.getState().showToast('请选择本地图片（示意）'); setMenu(null) }}>
            选择本地图片
          </MenuItem>
          <MenuItem onClick={() => { setGenFor(menu.a); setMenu(null) }}>
            {menu.a.imgState === 'done' ? 'AI 重新生成图片' : 'AI 生成图片'}
          </MenuItem>
          <MenuItem
            disabled={menu.a.imgState !== 'done'}
            onClick={() => { useStore.getState().showToast('已开始下载（示意）'); setMenu(null) }}
          >
            下载参考图
          </MenuItem>
          <MenuItem
            disabled={menu.a.imgState !== 'done'}
            onClick={() => { clearAssetImage(menu.a.id); setMenu(null) }}
          >
            清除参考图
          </MenuItem>
          <MenuItem danger onClick={() => { deleteAsset(menu.a.id); setMenu(null) }}>
            删除{menu.a.kind === 'char' ? '角色' : '场景'}
          </MenuItem>
        </Popover>
      )}
    </div>
  )

  function openMenu(a: Asset, e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ a, top: r.bottom + 4, left: r.left - 150 })
  }
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-3 text-[15px] font-semibold">
        {title}
        <span className="ml-1 text-muted">（{count}）</span>
      </div>
      {children}
    </div>
  )
}

function AssetCard({
  a,
  onZoom,
  onMenu,
  onEdit,
  onGen,
}: {
  a: Asset
  onZoom: () => void
  onMenu: (e: React.MouseEvent) => void
  onEdit: () => void
  onGen: () => void
}) {
  const done = a.imgState === 'done'
  const generating = a.imgState === 'generating'
  const kindCn = a.kind === 'char' ? '角色' : '场景'

  const onCardClick = () => {
    if (done) onZoom()
    else if (a.imgState === 'none') onEdit()
    // generating：无响应
  }

  return (
    <div
      onClick={onCardClick}
      tabIndex={generating ? -1 : 0}
      className={`group relative flex aspect-square flex-col overflow-hidden rounded-xl border border-line bg-panel outline-none transition-colors focus-visible:border-brand/60 ${
        generating ? 'cursor-default' : 'cursor-pointer hover:border-brand/50'
      }`}
    >
      {/* 已生成：图片铺底 */}
      {done && a.imageUrl && (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${a.imageUrl}")` }} />
      )}

      {/* 生成中：骨架 */}
      {generating && (
        <div className="skeleton absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <Spinner size={13} /> 正在生成参考图…
          </span>
        </div>
      )}

      {/* 未生成：图标空态常显；hover/聚焦/触控时叠加遮罩 + 淡入两个按钮 */}
      {a.imgState === 'none' && (
        <div className="relative z-[1] flex flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center">
            <RefPlaceholder kind={a.kind} name={a.name} />
          </div>
          <div className="reveal pointer-events-none absolute inset-0 bg-black/30" />
          <div className="reveal relative flex items-center justify-center gap-2 px-3 pb-3">
            <Button size="sm" onClick={stop(onEdit)}>编辑设定</Button>
            <Button size="sm" variant="primary" onClick={stop(onGen)}>
              生成参考图
            </Button>
          </div>
        </div>
      )}

      {/* 右上角 ⋯：默认隐藏，hover/聚焦/触控揭示 */}
      {!generating && (
        <button
          title="更多"
          className="reveal absolute right-2.5 top-2.5 z-[2] flex h-7 w-7 items-center justify-center rounded-md bg-black/45 text-white/90 hover:bg-black/70"
          onClick={(e) => {
            e.stopPropagation()
            onMenu(e)
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      )}

      {/* 已生成：底部信息条常显名称；「编辑设定」随揭示淡入 */}
      {done && (
        <div className="relative z-[1] mt-auto bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 pt-10">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[17px] font-semibold text-white">{a.name}</div>
              <div className="mt-0.5 text-xs text-muted">{kindCn}</div>
            </div>
            <button
              onClick={stop(onEdit)}
              className="reveal inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-white/70 transition-colors hover:text-white"
            >
              <Pencil size={12} /> 编辑设定
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 阻止卡片点击穿透的小工具
const stop = (fn: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation()
  fn()
}

function ResChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {['1K', '2K', '4K'].map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`rounded-lg border px-3 py-1 text-sm ${
            value === r ? 'border-brand text-brand' : 'border-line text-muted hover:text-white'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

/* 单张参考图生成：大图弹窗 —— 可编辑提示词 + 模型/比例/分辨率 + 消耗 */
function GenAssetImageModal({
  a,
  balance,
  onClose,
  onConfirm,
}: {
  a: Asset
  balance: number
  onClose: () => void
  onConfirm: (patch: { prompt: string }) => void
}) {
  const kindCn = a.kind === 'char' ? '角色' : '场景'
  const [prompt, setPrompt] = useState(a.prompt)
  const [model, setModel] = useState<string>(MODELS.image)
  const [ratio, setRatio] = useState('9:16')
  const [res, setRes] = useState('1K')
  const cost = COST.assetImgEach
  const ok = prompt.trim().length > 0

  return (
    <Modal title={`AI 生成${kindCn}参考图 · ${a.name}`} width={880} onClose={onClose}>
      <Textarea
        rows={9}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={`描述「${a.name}」的外观、气质与画面风格，用于生成${kindCn}参考图`}
        className="text-[13.5px] leading-relaxed"
      />

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <Label>图片模型</Label>
          <ModelSelect value={model} options={MODEL_OPTIONS.image} onChange={setModel} width={176} />
        </div>
        <div>
          <Label>画面比例</Label>
          <ModelSelect value={ratio} options={['9:16', '16:9', '1:1', '4:3', '3:4']} onChange={setRatio} width={104} />
        </div>
        <div>
          <Label>分辨率</Label>
          <ResChips value={res} onChange={setRes} />
        </div>

        <div className="ml-auto flex items-center gap-5">
          <div className="text-[13px] text-muted">
            合计预计消耗 <span className="font-semibold text-brand">{fmt(cost)}</span> 星钻（1 张）
          </div>
          <Button variant="primary" disabled={!ok} onClick={() => onConfirm({ prompt })}>
            确认生成
          </Button>
        </div>
      </div>

      <div className="mt-3 text-[12px] text-faint">当前余额 {fmt(balance)} 星钻 · 提示词可编辑，将用于本次生成</div>
    </Modal>
  )
}

function BatchModal({
  assets,
  balance,
  onClose,
  onGen,
}: {
  assets: Asset[]
  balance: number
  onClose: () => void
  onGen: (ids: string[], edits: Record<string, string>) => void
}) {
  const [sel, setSel] = useState<string[]>(assets.map((a) => a.id))
  const [prompts, setPrompts] = useState<Record<string, string>>(
    Object.fromEntries(assets.map((a) => [a.id, a.prompt])),
  )
  const [model, setModel] = useState<string>(MODELS.image)
  const [ratio, setRatio] = useState('9:16')
  const [res, setRes] = useState('1K')

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const allOn = sel.length === assets.length
  const toggleAll = () => setSel(allOn ? [] : assets.map((a) => a.id))

  const chars = assets.filter((a) => a.kind === 'char')
  const scenes = assets.filter((a) => a.kind === 'scene')
  const cost = sel.length * COST.assetImgEach

  const confirm = () => {
    if (!sel.length) return
    const edits: Record<string, string> = {}
    sel.forEach((id) => {
      const a = assets.find((x) => x.id === id)
      if (a && prompts[id] !== a.prompt) edits[id] = prompts[id]
    })
    onGen(sel, edits)
  }

  const renderGroup = (title: string, list: Asset[], kindCn: string) =>
    list.length === 0 ? null : (
      <div className="mb-5">
        <div className="mb-2.5 text-[14px] font-semibold text-brand">
          {title}（{list.length}）
        </div>
        <div className="space-y-3">
          {list.map((a) => {
            const on = sel.includes(a.id)
            return (
              <div
                key={a.id}
                className="rounded-xl border border-line/60 bg-panel2/30 px-4 py-3 transition-colors focus-within:bg-panel2/60"
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="accent-brand" />
                  <span className={`text-[14px] font-medium ${on ? 'text-brand' : 'text-white/80'}`}>{a.name}</span>
                  <span className="rounded bg-panel2 px-1.5 py-0.5 text-[11px] text-muted">{kindCn}</span>
                </label>
                <Textarea
                  rows={3}
                  dim
                  value={prompts[a.id] ?? ''}
                  onChange={(e) => setPrompts((p) => ({ ...p, [a.id]: e.target.value }))}
                  className="mt-2.5 text-[13px] leading-relaxed"
                  placeholder={`描述「${a.name}」的外观与画面风格`}
                />
              </div>
            )
          })}
        </div>
      </div>
    )

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[86vh] w-[880px] max-w-[92vw] flex-col rounded-xl border border-line bg-panel shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-[15px] font-semibold">一键补全参考图</div>
          <button className="text-muted hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        {/* 列表（可滚动） */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {renderGroup('角色', chars, '角色')}
          {renderGroup('场景', scenes, '场景')}
        </div>

        {/* 底部控制条 */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-5 py-3.5">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={allOn} onChange={toggleAll} className="accent-brand" />
            已选 {sel.length}/{assets.length}
          </label>
          <div>
            <div className="mb-1 text-[12px] text-muted">图片模型</div>
            <ModelSelect value={model} options={MODEL_OPTIONS.image} onChange={setModel} width={160} />
          </div>
          <div>
            <div className="mb-1 text-[12px] text-muted">画面比例</div>
            <ModelSelect value={ratio} options={['9:16', '16:9', '1:1', '4:3', '3:4']} onChange={setRatio} width={100} />
          </div>
          <div>
            <div className="mb-1 text-[12px] text-muted">分辨率</div>
            <ResChips value={res} onChange={setRes} />
          </div>
          <div className="ml-auto flex items-center gap-5">
            <div className="text-[13px] text-muted">
              合计预计消耗 <span className="font-semibold text-brand">{fmt(cost)}</span> 星钻（{sel.length} 张）
            </div>
            <Button variant="primary" disabled={!sel.length} onClick={confirm}>
              生成（{sel.length}）
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* 居中设定弹窗：名称与描述一起在点「保存」时提交 */
function AssetSettingModal({
  a,
  onClose,
  onSave,
}: {
  a: Asset
  onClose: () => void
  onSave: (patch: Partial<Asset>) => void
}) {
  const isChar = a.kind === 'char'
  const [name, setName] = useState(a.name)
  const [desc, setDesc] = useState(a.desc)
  const [prompt, setPrompt] = useState(a.prompt)

  return (
    <Modal
      title={isChar ? '编辑角色设定' : '编辑场景设定'}
      width={640}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              onSave({ name: name.trim() || a.name, desc, prompt })
              onClose()
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <Label>{isChar ? '角色名称' : '场景名称'}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <Label>{isChar ? '角色描述' : '场景描述'}</Label>
      <Textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="h-3" />
      <Label>参考图描述</Label>
      <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="mt-1 text-[12px] text-faint">用于生成{isChar ? '角色' : '场景'}参考图</div>
    </Modal>
  )
}
