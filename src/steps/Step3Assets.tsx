import { createPortal } from 'react-dom'
import { renameOccurrences, shotsReferencingAsset, shotGenerationBlocked } from '@/utils/project'
import { useRef, useState, type ReactNode } from 'react'
import { Eraser, Image, MoreVertical, Plus, Pencil, Sparkles, Trash2, X } from 'lucide-react'
import type { Asset, Project } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import {
  ActionBar,
  Button,
  Diamond,
  GeneratingState,
  Modal,
  ModelSelect,
  Overlay,
  PageHeader,
  Popover,
  Spinner,
  fmt,
} from '@/components/ui'
import Lightbox from '@/components/Lightbox'
import GenShotModal from './GenShotModal'
import defaultCover from '@/assets/asset-cover-default.png'

// 浅青渐变主按钮（与首页 / 弹窗 CTA 一致）
const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

/* ---------- 胶囊按钮（对齐设计稿） ---------- */
function PillCTA({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={CTA_GRADIENT}
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function PillOutline({ children, onClick, disabled, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export default function Step3Assets({ project }: { project: Project }) {
  const { addAsset, generateAssetImages, clearAssetImage, updateAsset, deleteAsset, startShots, goStep } =
    useStore()
  const blocked = shotGenerationBlocked(project)
  const imagesGenerating = project.assets.some((a) => a.imgState === 'generating')
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadId = useRef<string | null>(null)
  const [deleteFor, setDeleteFor] = useState<Asset | null>(null)
  const st = project.assetStatus
  const chars = project.assets.filter((a) => a.kind === 'char')
  const scenes = project.assets.filter((a) => a.kind === 'scene')
  const missing = project.assets.filter((a) => a.imgState !== 'done')

  const [addKind, setAddKind] = useState<Asset['kind'] | null>(null)
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
          onGen={() => setGenFor(a)}
        />
      ))
    )

  // 固定卡宽 210–230，自动排列：适中密度，卡片不随屏拉大
  const gridCls = 'grid grid-cols-[repeat(auto-fill,minmax(210px,230px))] justify-start gap-4'

  return (
    <div>
      <PageHeader
        title="角色与场景"
        desc="完善角色与场景的设定和参考图，可以让后续画面更加一致。"
      />

      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0]; const id = uploadId.current
        e.target.value = ''
        if (!file || !id) return
        const reader = new FileReader()
        reader.onload = () => updateAsset(id, { imageUrl: String(reader.result), imgState: 'done' })
        reader.readAsDataURL(file)
      }} />
      <Section title="角色" count={chars.length}>
        <div className={gridCls}>{renderCards(chars, '暂无角色')}<AddAssetCard kind="char" onClick={() => setAddKind('char')} /></div>
      </Section>
      <Section title="场景" count={scenes.length}>
        <div className={gridCls}>{renderCards(scenes, '暂无场景')}<AddAssetCard kind="scene" onClick={() => setAddKind('scene')} /></div>
      </Section>

      <ActionBar left="生成视频时会参考这些角色与场景图，保持画面一致">
        {imagesGenerating ? <PillCTA disabled>正在生成参考图…</PillCTA> : missing.length > 0 ? <>
          <PillCTA onClick={() => setBatchOpen(true)}>✦{fmt(missing.length * COST.assetImgEach)} 生成全部参考图</PillCTA>
          {project.shots.length > 0 && <PillOutline onClick={() => goStep(4)}>下一步：镜头设计</PillOutline>}
        </> : project.shots.length > 0 ? <PillCTA onClick={() => goStep(4)}>下一步：镜头设计</PillCTA> :
          <span title={blocked}><PillCTA disabled={!!blocked} onClick={() => setShotOpen(true)}>✦{fmt(project.segments.length * COST.shotGenEach)} 生成镜头设计</PillCTA></span>}
      </ActionBar>

      {addKind && <EditableAssetSettingModal
        a={{ id: 'new-asset', kind: addKind, name: '', prompt: '', importance: 'minor', imgState: 'none' }}
        project={project} isNew onClose={() => setAddKind(null)}
        onSave={(patch) => addAsset(addKind, { name: patch.name ?? '', prompt: patch.prompt ?? '' })}
      />}

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

      {/* 设定编辑与名称同步替换 */}
      {editFor &&
        (() => {
          const a = project.assets.find((x) => x.id === editFor)
          if (!a) return null
          return (
            <EditableAssetSettingModal
              a={a}
              project={project}
              onClose={() => setEditFor(null)}
              onSave={(patch) => updateAsset(a.id, patch)}
            />
          )
        })()}

      {deleteFor && <Modal title={`删除${deleteFor.kind === 'char' ? '角色' : '场景'}`} width={480} onClose={() => setDeleteFor(null)} footer={<><Button onClick={() => setDeleteFor(null)}>取消</Button><Button variant="danger-solid" onClick={() => { deleteAsset(deleteFor.id); setDeleteFor(null) }}>删除{deleteFor.kind === 'char' ? '角色' : '场景'}</Button></>}>
        <p className="text-sm leading-relaxed text-white/80">{(() => {
          const n = shotsReferencingAsset(project, deleteFor).length
          return n ? `「${deleteFor.name}」被 ${n} 个镜头引用。删除后，这些镜头会标记为待更新。` : `确定删除「${deleteFor.name}」吗？`
        })()}</p>
      </Modal>}

      {lightbox && <Lightbox title={lightbox.name} url={lightbox.imageUrl} onClose={() => setLightbox(null)} />}

      {/* 生成镜头设计弹窗（与 Step4 共用） */}
      {shotOpen && (
        <GenShotModal
          project={project}
          onClose={() => setShotOpen(false)}
          onConfirm={(segNos, durations) => {
            setShotOpen(false)
            startShots(segNos, durations)
          }}
        />
      )}

      {menu && (
        <Popover anchor={menu} width={168} variant="glass" onClose={() => setMenu(null)}>
          <MenuRow icon={<Image size={16} />} onClick={() => { uploadId.current = menu.a.id; uploadRef.current?.click(); setMenu(null) }}>
            选择本地图片
          </MenuRow>
          <MenuRow icon={<Sparkles size={16} />} onClick={() => { setGenFor(menu.a); setMenu(null) }}>
            {menu.a.imgState === 'done' ? 'AI 重新生成图片' : 'AI 生成图片'}
          </MenuRow>
          <MenuRow icon={<Pencil size={16} />} onClick={() => { setEditFor(menu.a.id); setMenu(null) }}>
            编辑{menu.a.kind === 'char' ? '角色' : '场景'}设定
          </MenuRow>
          <MenuRow
            icon={<Eraser size={16} />}
            disabled={menu.a.imgState !== 'done'}
            onClick={() => { clearAssetImage(menu.a.id); setMenu(null) }}
          >
            清除参考图
          </MenuRow>
          <MenuRow icon={<Trash2 size={16} />} onClick={() => { setDeleteFor(menu.a); setMenu(null) }}>
            删除{menu.a.kind === 'char' ? '角色' : '场景'}
          </MenuRow>
        </Popover>
      )}
    </div>
  )

  // 菜单定位在点击位置的右下方（left 取按钮右缘）
  function openMenu(a: Asset, e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ a, top: r.bottom + 6, left: r.right + 6 })
  }
}

/* 玻璃菜单行：16px 图标 + 14px 文案（对齐 Figma node 6:3206） */
function MenuRow({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: ReactNode
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-2 text-[14px] text-white/90 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="shrink-0 text-white/80">{icon}</span>
      {children}
    </button>
  )
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

function AddAssetCard({ kind, onClick }: { kind: Asset['kind']; onClick: () => void }) {
  return <button onClick={onClick} className="relative flex flex-col rounded-lg border border-dashed border-white/20 bg-panel text-sm text-white/60 transition-colors hover:border-brand/50 hover:text-brand">
    <span aria-hidden className="aspect-square w-full" /><span aria-hidden className="h-[66px]" />
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-3"><Plus size={28} />新增{kind === 'char' ? '角色' : '场景'}</span>
  </button>
}

function AssetCard({
  a,
  onZoom,
  onMenu,
  onGen,
}: {
  a: Asset
  onZoom: () => void
  onMenu: (e: React.MouseEvent) => void
  onGen: () => void
}) {
  const done = a.imgState === 'done'
  const generating = a.imgState === 'generating'
  const kindCn = a.kind === 'char' ? '角色' : '场景'
  const subtitle = generating ? '正在生成参考图…' : done ? kindCn : '待生成参考图'
  const inert = generating
  const onCoverClick = () => {
    if (inert) return
    if (done) onZoom()
    else if (a.imgState === 'none') onGen()
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-white/15">
      {/* 封面：正方形，铺满 —— 已生成用参考图，否则用默认封面图（对齐 Figma node 20:53） */}
      <div
        onClick={onCoverClick}
        tabIndex={inert ? -1 : 0}
        className={`relative aspect-square overflow-hidden bg-panel2 outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
          inert ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        <div
          className={`absolute inset-0 bg-center bg-no-repeat ${a.kind === 'char' ? 'bg-contain bg-black/30' : 'bg-cover'}`}
          style={{ backgroundImage: `url("${done && a.imageUrl ? a.imageUrl : defaultCover}")` }}
        />
        {generating && (
          <div className="skeleton absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              <Spinner size={13} /> 正在生成参考图…
            </span>
          </div>
        )}
      </div>

      {/* 名称条：名字在下方，右侧竖向「⋮」更多操作（无 hover 操作） */}
      <div className="flex items-center justify-between gap-2 px-4 py-3.5">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium leading-tight text-white">{a.name}</div>
          <div className="mt-1.5 truncate text-[12px] leading-none text-white/40">{subtitle}</div>
        </div>
        {!generating && (
          <button
            title="更多操作"
            aria-label="更多操作"
            className="-mr-1 shrink-0 rounded-md p-1 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              onMenu(e)
            }}
          >
            <MoreVertical size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

function ResChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {['1K', '2K', '4K'].map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`flex h-9 items-center rounded-xl border px-3 text-sm font-medium transition-colors ${
            value === r ? 'border-brand text-brand' : 'border-white/20 text-white hover:border-white/40'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

/* 单张参考图生成弹窗（对齐 Figma node 6:3453）：可编辑提示词 + 模型/比例/分辨率 + 消耗 */
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
  const [ratio, setRatio] = useState('1:1')
  const [res, setRes] = useState('1K')
  const cost = COST.assetImgEach
  const ok = prompt.trim().length > 0

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[86vh] w-[660px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
        {/* 头部 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">AI 生成{kindCn}（{a.name}）</div>
          <button className="text-white/50 transition-colors hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
          <div className="text-sm text-white/60">生图提示词</div>
          <textarea
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label="生图提示词"
            placeholder={`描述「${a.name}」的外观，用于生成参考图和镜头设计；版式和风格会自动添加`}
            className="w-full resize-none rounded-lg border border-transparent bg-black/40 p-3 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-brand/40"
          />

          <div className="flex flex-wrap items-center gap-4">
            <ModelSelect value={model} options={MODEL_OPTIONS.image} onChange={setModel} variant="pill" width={148} />
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-white">画面比例</span>
              <ModelSelect value={ratio} options={['1:1', '9:16', '16:9', '4:3', '3:4']} onChange={setRatio} variant="pill" width={84} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-white">分辨率</span>
              <ResChips value={res} onChange={setRes} />
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex h-16 shrink-0 items-center justify-end gap-4 px-5 pb-5">
          <div className="text-[14px] text-white/60">
            合计预计消耗 <span className="text-brand">{fmt(cost)}</span> 星钻（1 张）· 余额 {fmt(balance)}
          </div>
          <PillCTA disabled={!ok} onClick={() => onConfirm({ prompt })}>
            确认生成
          </PillCTA>
        </div>
      </div>
    </Overlay>
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
  const [ratio, setRatio] = useState('1:1')
  const [res, setRes] = useState('1K')

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const allOn = sel.length === assets.length
  const toggleAll = () => setSel(allOn ? [] : assets.map((a) => a.id))

  const chars = assets.filter((a) => a.kind === 'char')
  const scenes = assets.filter((a) => a.kind === 'scene')
  const cost = sel.length * COST.assetImgEach

  const confirm = () => {
    if (!sel.length || sel.some(id => !prompts[id]?.trim())) return
    const edits: Record<string, string> = {}
    sel.forEach((id) => {
      const a = assets.find((x) => x.id === id)
      if (a && prompts[id] !== a.prompt) edits[id] = prompts[id]
    })
    onGen(sel, edits)
  }

  const renderGroup = (title: string, list: Asset[], kindCn: string, divider: boolean) =>
    list.length === 0 ? null : (
      <div className={divider ? 'border-b border-white/5 pb-6' : ''}>
        <div className="mb-3 text-[16px] font-medium text-white">
          {title}
          <span className="text-[#525252]">（{list.length}）</span>
        </div>
        <div className="space-y-3">
          {list.map((a) => {
            const on = sel.includes(a.id)
            return (
              <div key={a.id} className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(a.id)}
                    className="h-[18px] w-[18px] rounded accent-brand"
                  />
                  <span className="text-[14px] font-semibold text-white">{a.name}</span>
                  <span className="rounded-full bg-black/60 px-3 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-[6px]">
                    {kindCn}
                  </span>
                </label>
                <textarea
                  rows={4}
                  value={prompts[a.id] ?? ''}
                  onChange={(e) => setPrompts((p) => ({ ...p, [a.id]: e.target.value }))}
                  aria-label={`生图提示词 · ${a.name}`}
                  placeholder={`描述「${a.name}」的外观，用于生成参考图和镜头设计；版式和风格会自动添加`}
                  className="w-full resize-none rounded-lg border border-transparent bg-black/40 p-3 text-[14px] leading-relaxed text-white/90 outline-none placeholder:text-white/30 focus:border-brand/40"
                />
              </div>
            )
          })}
        </div>
      </div>
    )

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[86vh] w-[640px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
        {/* 头部 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">一键补全参考图</div>
          <button className="text-white/50 transition-colors hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        {/* 角色 / 场景 列表（可滚动） */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
          {renderGroup('角色', chars, '角色', scenes.length > 0)}
          {renderGroup('场景', scenes, '场景', false)}
        </div>

        {/* 全选提示 */}
        <label className="flex shrink-0 cursor-pointer items-center gap-2 px-5 pt-2">
          <input
            type="checkbox"
            checked={allOn}
            onChange={toggleAll}
            className="h-[18px] w-[18px] rounded accent-brand"
          />
          <span className="text-[12px] text-white/60">
            已选择 {sel.length}/{assets.length} 个，可取消个别参考图
          </span>
        </label>

        {/* 参数：模型 / 画面比例 / 分辨率 */}
        <div className="flex shrink-0 flex-wrap items-center gap-4 px-5 py-3">
          <ModelSelect value={model} options={MODEL_OPTIONS.image} onChange={setModel} variant="pill" width={148} />
          <div className="flex items-center gap-3">
            <span className="text-sm text-white">画面比例</span>
            <ModelSelect value={ratio} options={['1:1', '9:16', '16:9', '4:3', '3:4']} onChange={setRatio} variant="pill" width={84} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white">分辨率</span>
            <ResChips value={res} onChange={setRes} />
          </div>
        </div>

        {/* 底部：消耗 + 确认 */}
        <div className="flex h-16 shrink-0 items-center justify-end gap-4 px-5 pb-5">
          <div className="flex items-center gap-1 text-[14px] text-[#999]">
            <Diamond />
            合计预计消耗<span className="text-brand">{fmt(cost)}星钻</span>（{sel.length}张）
          </div>
          <PillCTA disabled={!sel.length || sel.some(id => !prompts[id]?.trim())} onClick={confirm}>
            确认生成（{sel.length}）
          </PillCTA>
        </div>
      </div>
    </Overlay>
  )
}

function EditableAssetSettingModal({
  isNew = false,
  project,
  a,
  onClose,
  onSave,
}: {
  isNew?: boolean
  a: Asset
  project: Project
  onClose: () => void
  onSave: (patch: Partial<Asset>) => void
}) {
  const isChar = a.kind === 'char'
  const kindCn = isChar ? '角色' : '场景'
  const [name, setName] = useState(a.name)
  const [nameTouched, setNameTouched] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const duplicate = project.assets.some((x) => x.id !== a.id && x.name === name.trim())
  const occurrences = renameOccurrences(project, a.name)
  const save = (sync: boolean) => {
    onSave(isNew ? { name, prompt } : { prompt })
    if (!isNew && name.trim() !== a.name) useStore.getState().renameAsset(a.id, name, sync)
    onClose()
  }
  const [prompt, setPrompt] = useState(a.prompt)

  const boxCls =
    'w-full resize-none rounded-lg border border-transparent bg-black/40 p-3 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-brand/40'

  return (
    <Overlay onClose={syncOpen ? () => setSyncOpen(false) : onClose}>
      <div className="flex max-h-[86vh] w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
        {/* 头部 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">{isNew ? `新增${kindCn}` : `编辑${kindCn}设定`}</div>
          <button className="text-white/50 transition-colors hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
          {/* 名称与跨类型重名校验 */}
          <div className="flex flex-col gap-2">
            <div className="text-[14px] text-white/60">{kindCn}名称</div>
            <input aria-label={`${kindCn}名称`} className={boxCls} value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true) }} />
            {duplicate && <p className="text-xs text-red-400">名称已被其他角色或场景使用</p>}
            {nameTouched && !name.trim() && <p className="text-xs text-red-400">名称不能为空</p>}
          </div>

          {/* 生图提示词 */}
          <div className="flex flex-col gap-3">
            <div className="text-[14px] text-white/60">生图提示词</div>
            <textarea
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-label="生图提示词"
              placeholder={`描述「${name.trim() || kindCn}」的外观，用于生成参考图和镜头设计；版式和风格会自动添加`}
              className={boxCls}
            />
            <div className="text-[14px] text-white/40">用于生成参考图和镜头设计</div>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex h-16 shrink-0 items-center justify-end gap-2 px-5 pb-5">
          <PillOutline onClick={onClose}>取消</PillOutline>
          <PillCTA
            disabled={!name.trim() || duplicate || !prompt.trim()}
            onClick={() => {
              setNameTouched(true)
              if (!name.trim() || duplicate || !prompt.trim()) return
              if (!isNew && name.trim() !== a.name && occurrences.length) setSyncOpen(true)
              else save(false)
            }}
          >
            {isNew ? '添加' : '保存'}
          </PillCTA>
        </div>
        {syncOpen && <SyncRenameModal oldName={a.name} newName={name.trim()} occurrences={occurrences} onClose={() => setSyncOpen(false)} onSave={save} />}
      </div>
    </Overlay>
  )
}


function SyncRenameModal({ oldName, newName, occurrences, onClose, onSave }: {
  oldName: string; newName: string; occurrences: ReturnType<typeof renameOccurrences>; onClose: () => void; onSave: (sync: boolean) => void
}) {
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
    <div className="w-[640px] max-w-[92vw] rounded-xl border border-white/5 bg-[#1c1e20] p-5 shadow-2xl backdrop-blur" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="text-base font-medium">同步替换段落和镜头文本？</h2><button aria-label="返回编辑" onClick={onClose}><X size={14} /></button></div>
      <p className="my-3 text-sm text-white/60">检测到 {occurrences.length} 处文本包含旧名称「{oldName}」</p>
      <div className="max-h-[360px] space-y-2 overflow-auto">{occurrences.map((hit, i) => <div key={i} className="rounded-lg bg-black/30 p-3"><div className="mb-2 text-xs text-faint">{hit.source}</div><p className="text-sm text-white/80">{hit.before}<span className="text-red-400 line-through">{oldName}</span><span className="text-brand">{newName}</span>{hit.after}</p></div>)}</div>
      <div className="mt-5 flex justify-end gap-2"><PillOutline onClick={() => onSave(false)}>仅修改名称</PillOutline><PillCTA onClick={() => onSave(true)}>同步替换并保存</PillCTA></div>
    </div>
  </div>, document.body)
}
