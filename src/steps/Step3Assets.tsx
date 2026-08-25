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
  InlineRename,
  Label,
  MenuItem,
  Modal,
  PageHeader,
  Popover,
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
  const missChars = missing.filter((a) => a.kind === 'char').length
  const missScenes = missing.filter((a) => a.kind === 'scene').length

  const [reextract, setReextract] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [genFor, setGenFor] = useState<Asset | null>(null)
  const [editFor, setEditFor] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<Asset | null>(null)
  const [shotOpen, setShotOpen] = useState(false)
  const [menu, setMenu] = useState<{ a: Asset; top: number; left: number } | null>(null)
  const [tab, setTab] = useState<'char' | 'scene'>('char')

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

      {/* 角色 / 场景 分栏切换 */}
      <div className="mb-5 flex items-center gap-6 border-b border-line/60">
        <TabButton label="角色" count={chars.length} active={tab === 'char'} onClick={() => setTab('char')} />
        <TabButton label="场景" count={scenes.length} active={tab === 'scene'} onClick={() => setTab('scene')} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {(tab === 'char' ? chars : scenes).map((a) => (
          <AssetCard
            key={a.id}
            a={a}
            onZoom={() => setLightbox(a)}
            onMenu={(e) => openMenu(a, e)}
            onEdit={() => setEditFor(a.id)}
          />
        ))}
        {(tab === 'char' ? chars : scenes).length === 0 && (
          <div className="col-span-full py-16 text-center text-[13px] text-faint">
            暂无{tab === 'char' ? '角色' : '场景'}
          </div>
        )}
      </div>

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
            选择图片
          </MenuItem>
          <MenuItem onClick={() => { setGenFor(menu.a); setMenu(null) }}>
            AI 生成单张图片
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

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 pb-2.5 text-[15px] transition-colors ${
        active ? 'border-brand font-semibold text-white' : 'border-transparent text-muted hover:text-white'
      }`}
    >
      {label}
      <span className={`ml-1 text-[13px] ${active ? 'text-brand' : 'text-faint'}`}>（{count}）</span>
    </button>
  )
}

function AssetCard({
  a,
  onZoom,
  onMenu,
  onEdit,
}: {
  a: Asset
  onZoom: () => void
  onMenu: (e: React.MouseEvent) => void
  onEdit: () => void
}) {
  const done = a.imgState === 'done'
  const typeCn = a.kind === 'char' ? '角色' : '场景'
  const statusCn = done ? '已生成' : a.imgState === 'generating' ? '生成中' : '待生成'
  return (
    <div
      onClick={onEdit}
      className="group relative flex aspect-square cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-brand/50"
    >
      {/* 已生成：图片铺底 */}
      {done && a.imageUrl && (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${a.imageUrl}")` }} />
      )}
      {/* 生成中：骨架 */}
      {a.imgState === 'generating' && (
        <div className="skeleton absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            <Spinner size={13} /> 正在生成参考图…
          </span>
        </div>
      )}

      {/* 未生成：显示设定描述占位 */}
      {a.imgState === 'none' && (
        <p className="relative z-[1] line-clamp-5 px-4 pt-5 text-[13px] leading-relaxed text-faint">
          {a.desc || a.prompt}
        </p>
      )}

      {/* 右上角操作按钮 */}
      <div className="absolute right-2.5 top-2.5 z-[2] flex items-center gap-1">
        {done && (
          <button
            title="查看大图"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-black/45 text-white/90 opacity-0 hover:bg-black/70 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onZoom()
            }}
          >
            🔍
          </button>
        )}
        <button
          title="更多"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-black/45 text-white/90 opacity-0 hover:bg-black/70 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onMenu(e)
          }}
        >
          ⋯
        </button>
      </div>

      {/* 底部信息条 */}
      <div
        className={`relative z-[1] p-4 ${done ? 'bg-gradient-to-t from-black/85 via-black/45 to-transparent pt-10' : ''}`}
      >
        <div className="text-[17px] font-semibold text-white">{a.name}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-muted">{typeCn}</span>
          <span className="text-xs text-faint">{statusCn}</span>
        </div>
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

/* 居中设定弹窗：名字双击可改，描述可编辑（无自动保存，点“保存”提交） */
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
              onSave({ desc, prompt })
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
        <EditableName value={a.name} onCommit={(v) => onSave({ name: v.trim() || a.name })} />
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

/* 名字：双击进入编辑（无多余提示文案，仅原生 tooltip） */
function EditableName({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <InlineRename
        value={value}
        className="text-[18px] font-semibold"
        onCommit={(v) => {
          onCommit(v)
          setEditing(false)
        }}
      />
    )
  }
  return (
    <div
      title="双击可改名"
      onDoubleClick={() => setEditing(true)}
      className="cursor-text select-none text-[18px] font-semibold text-white"
    >
      {value}
    </div>
  )
}
