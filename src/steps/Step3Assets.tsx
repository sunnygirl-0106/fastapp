import { useState } from 'react'
import type { Asset, Project } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST, MODELS } from '@/services/generation'
import {
  ActionBar,
  Button,
  Diamond,
  GenerateConfirmModal,
  GeneratingState,
  Label,
  MenuItem,
  Modal,
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

const importanceCn = (a: Asset) => {
  const map: Record<string, string> = {
    major: '主角',
    main: '主角',
    lead: '主角',
    supporting: '配角',
    minor: '次要角色',
    background: '背景角色',
  }
  return map[a.importance as string] ?? '配角'
}

export default function Step3Assets({ project }: { project: Project }) {
  const { extractAssets, generateAssetImages, clearAssetImage, updateAsset, deleteAsset, startShots } = useStore()
  const st = project.assetStatus
  const chars = project.assets.filter((a) => a.kind === 'char')
  const scenes = project.assets.filter((a) => a.kind === 'scene')
  const missing = project.assets.filter((a) => a.imgState !== 'done')
  const missChars = missing.filter((a) => a.kind === 'char').length
  const missScenes = missing.filter((a) => a.kind === 'scene').length

  const [reextract, setReextract] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [genFor, setGenFor] = useState<Asset | null>(null)
  const [editFor, setEditFor] = useState<Asset | null>(null)
  const [lightbox, setLightbox] = useState<Asset | null>(null)
  const [shotOpen, setShotOpen] = useState(false)
  const [menu, setMenu] = useState<{ a: Asset; top: number; left: number } | null>(null)

  if (st === 'generating') {
    return (
      <>
        <GeneratingState
          title="正在识别角色与场景"
          desc="AI 正在从故事中整理人物设定和主要场景。"
          phases={['正在识别主要角色…', '正在整理人物设定…', '正在提取故事场景…']}
        />
        <ActionBar>
          <Button variant="primary" size="lg" disabled>
            正在提取角色与场景…
          </Button>
        </ActionBar>
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="角色与场景"
        desc={`已识别 ${chars.length} 个角色和 ${scenes.length} 个场景。完善参考图，可以让后续画面更加一致。`}
        right={
          <Button variant="ghost" size="sm" onClick={() => setReextract(true)}>
            重新提取
          </Button>
        }
      />

      {project.assetStale && (
        <StaleNotice
          text="故事已重新拆解，建议重新提取角色与场景。"
          actionText="重新提取"
          onAction={() => setReextract(true)}
        />
      )}

      <div className="mb-4 text-[13px] text-muted">
        已识别 {chars.length} 个角色 · {scenes.length} 个场景
      </div>

      <Group title="角色">
        <div className="flex flex-wrap gap-4">
          {chars.map((a) => (
            <AssetCard
              key={a.id}
              a={a}
              onImage={() => onImageClick(a)}
              onZoom={() => setLightbox(a)}
              onMenu={(e) => openMenu(a, e)}
              onEdit={() => setEditFor(a)}
            />
          ))}
        </div>
      </Group>

      <Group title="场景">
        <div className="flex flex-wrap gap-4">
          {scenes.map((a) => (
            <AssetCard
              key={a.id}
              a={a}
              onImage={() => onImageClick(a)}
              onZoom={() => setLightbox(a)}
              onMenu={(e) => openMenu(a, e)}
              onEdit={() => setEditFor(a)}
            />
          ))}
        </div>
      </Group>

      {/* 底部主操作栏：两种形态 */}
      {missing.length > 0 ? (
        <ActionBar left={`共 ${missing.length} 张参考图，每张 ${COST.assetImgEach} 星钻`}>
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
          onGen={async (ids) => {
            setBatchOpen(false)
            await generateAssetImages(ids)
          }}
        />
      )}

      {/* 单张生成参考图 */}
      {genFor && (
        <GenerateConfirmModal
          title={`生成${genFor.kind === 'char' ? '角色' : '场景'}参考图`}
          what={`将为「${genFor.name}」生成一张参考图。`}
          count="1 张参考图"
          modelLabel="图片模型"
          model={MODELS.image}
          cost={COST.assetImgEach}
          balance={project.balance}
          confirmText="确认生成参考图"
          onClose={() => setGenFor(null)}
          onConfirm={async () => {
            const id = genFor.id
            setGenFor(null)
            await generateAssetImages([id])
          }}
        />
      )}

      {/* 编辑设定 */}
      {editFor && (
        <EditSettingModal
          a={editFor}
          onClose={() => setEditFor(null)}
          onSave={(patch) => {
            updateAsset(editFor.id, patch)
            setEditFor(null)
          }}
        />
      )}

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
            上传参考图
          </MenuItem>
          <MenuItem onClick={() => { setGenFor(menu.a); setMenu(null) }}>
            生成参考图
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

  function onImageClick(a: Asset) {
    if (a.imgState === 'generating') return
    if (a.imgState === 'done') setLightbox(a) // 有图看大图
    else setGenFor(a) // 无图打开单张生成弹窗
  }
  function openMenu(a: Asset, e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ a, top: r.bottom + 4, left: r.left - 150 })
  }
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 text-sm font-medium">{title}</div>
      {children}
    </section>
  )
}

function AssetCard({
  a,
  onImage,
  onZoom,
  onMenu,
  onEdit,
}: {
  a: Asset
  onImage: () => void
  onZoom: () => void
  onMenu: (e: React.MouseEvent) => void
  onEdit: () => void
}) {
  const done = a.imgState === 'done'
  return (
    <div className="w-[236px]">
      <div
        onClick={onImage}
        className="group relative h-[150px] cursor-pointer overflow-hidden rounded-lg border border-line bg-cover bg-center"
        style={{ backgroundImage: a.imageUrl ? `url("${a.imageUrl}")` : undefined }}
      >
        {a.imgState === 'none' && <RefPlaceholder kind={a.kind} />}
        {a.imgState === 'generating' && (
          <div className="skeleton flex h-full items-center justify-center">
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              <Spinner size={13} /> 正在生成参考图…
            </span>
          </div>
        )}

        <div className="absolute right-2 top-2 flex items-center gap-1">
          {done && (
            <button
              title="查看大图"
              className="flex h-6 w-6 items-center justify-center rounded bg-black/45 text-white/90 opacity-0 hover:bg-black/70 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onZoom() }}
            >
              🔍
            </button>
          )}
          <button
            title="更多"
            className="flex h-6 w-6 items-center justify-center rounded bg-black/45 text-white/90 opacity-0 hover:bg-black/70 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onMenu(e) }}
          >
            ⋯
          </button>
        </div>
      </div>

      <div className="mt-2 text-sm font-medium text-white">{a.name}</div>
      <div className="mt-0.5 text-xs text-faint">{a.kind === 'char' ? importanceCn(a) : '场景'}</div>
      <div className="mt-1 line-clamp-2 text-xs text-muted">{a.desc}</div>

      <div className="mt-2 flex items-center gap-3 text-[13px]">
        <button className="text-brand hover:underline" onClick={onEdit}>
          编辑设定
        </button>
        {done && <span className="text-xs text-faint">参考图已生成</span>}
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

function BatchModal({
  assets,
  balance,
  onClose,
  onGen,
}: {
  assets: Asset[]
  balance: number
  onClose: () => void
  onGen: (ids: string[]) => void
}) {
  const [sel, setSel] = useState<string[]>(assets.map((a) => a.id))
  const [res, setRes] = useState('1K')
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const nChar = assets.filter((a) => a.kind === 'char').length
  const nScene = assets.filter((a) => a.kind === 'scene').length
  const what = `将为 ${nChar} 个角色和 ${nScene} 个场景生成参考图。`

  return (
    <GenerateConfirmModal
      title="生成参考图"
      what={what}
      count={`${sel.length} 张参考图`}
      modelLabel="图片模型"
      model={MODELS.image}
      cost={sel.length * COST.assetImgEach}
      balance={balance}
      confirmText={`确认生成 ${sel.length} 张参考图`}
      disabled={!sel.length}
      width={520}
      onClose={onClose}
      onConfirm={() => onGen(sel)}
      extra={
        <div>
          <div className="mb-2 text-[13px] text-muted">
            已选择 {sel.length}/{assets.length}
          </div>
          <div className="max-h-[240px] space-y-2 overflow-y-auto">
            {assets.map((a) => (
              <label
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-line/60 bg-panel2/50 px-3 py-2 text-[13px]"
              >
                <input type="checkbox" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} className="accent-brand" />
                <span className="text-white">{a.name}</span>
                <span className="rounded bg-panel2 px-1.5 py-0.5 text-[11px] text-muted">
                  {a.kind === 'char' ? '角色' : '场景'}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4">
            <span className="text-[13px] text-muted">分辨率</span>
            <ResChips value={res} onChange={setRes} />
          </div>
        </div>
      }
    />
  )
}

function EditSettingModal({
  a,
  onClose,
  onSave,
}: {
  a: Asset
  onClose: () => void
  onSave: (patch: Partial<Asset>) => void
}) {
  const [desc, setDesc] = useState(a.desc)
  const [prompt, setPrompt] = useState(a.prompt)
  const isChar = a.kind === 'char'
  return (
    <Modal
      title={isChar ? '编辑角色设定' : '编辑场景设定'}
      width={640}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave({ desc, prompt })}>
            保存修改
          </Button>
        </>
      }
    >
      {isChar && (
        <div className="mb-4 flex items-center gap-2 text-[13px]">
          <span className="text-muted">角色名称：</span>
          <span className="text-white">{a.name}</span>
          <span className="rounded bg-panel2 px-1.5 py-0.5 text-[11px] text-muted">{importanceCn(a)}</span>
        </div>
      )}
      <Label>{isChar ? '角色描述' : '场景描述'}</Label>
      <Textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="h-3" />
      <Label>参考图描述</Label>
      <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="mt-1 text-[12px] text-faint">将用于生成{isChar ? '角色' : '场景'}参考图</div>
    </Modal>
  )
}
