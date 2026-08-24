import { useEffect, useState } from 'react'
import type { Asset, Project } from '@/types'
import { useStore } from '@/store/workflowStore'
import { COST } from '@/services/generation'
import {
  Button,
  CostRow,
  Diamond,
  FakeSelect,
  Input,
  Label,
  MenuItem,
  Modal,
  Popover,
  Spinner,
  StatusPill,
  Textarea,
  fmt,
} from '@/components/ui'
import Lightbox from '@/components/Lightbox'

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
  const { extractAssets, generateAssetImages, clearAssetImage, updateAsset, deleteAsset } = useStore()
  const st = project.assetStatus
  const chars = project.assets.filter((a) => a.kind === 'char')
  const scenes = project.assets.filter((a) => a.kind === 'scene')
  const missing = project.assets.filter((a) => a.imgState !== 'done')
  const missChars = missing.filter((a) => a.kind === 'char').length
  const missScenes = missing.filter((a) => a.kind === 'scene').length

  const [extractOpen, setExtractOpen] = useState(false)
  const [reextract, setReextract] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [genFor, setGenFor] = useState<Asset | null>(null)
  const [editFor, setEditFor] = useState<Asset | null>(null)
  const [lightbox, setLightbox] = useState<Asset | null>(null)
  const [menu, setMenu] = useState<{ a: Asset; top: number; left: number } | null>(null)

  const doExtract = async () => {
    setExtractOpen(false)
    setReextract(false)
    await extractAssets()
  }

  return (
    <div>
      {/* 工具栏 */}
      <div className="mb-4 flex items-center gap-3">
        <Button
          variant="soft"
          disabled={st === 'generating'}
          onClick={() => (st === 'done' ? setReextract(true) : setExtractOpen(true))}
        >
          {st === 'generating' ? (
            <>
              <Spinner size={13} /> 提取中…
            </>
          ) : st === 'done' ? (
            '重新提取'
          ) : (
            '提取资产'
          )}
        </Button>
        <StatusPill label="提取状态" status={st} />
      </div>

      {st === 'none' && (
        <>
          <Group title="角色（0）">
            <div className="text-sm text-faint">暂无实体，请先抽出结构。</div>
          </Group>
          <Group title="场景（0）">
            <div className="text-sm text-faint">暂无实体，请先抽出结构。</div>
          </Group>
        </>
      )}

      {st === 'generating' && (
        <div className="flex items-center gap-2 py-10 text-sm text-muted">
          <Spinner /> 正在抽出角色与场景结构…
        </div>
      )}

      {st === 'done' && (
        <>
          {missing.length > 0 && (
            <div className="mb-4 flex items-center gap-3">
              <Button variant="soft" onClick={() => setBatchOpen(true)}>
                一键补全参考图
              </Button>
              <span className="text-xs text-muted">
                {missChars} 角色 + {missScenes} 场景 待生成 · 决定画面统一度
              </span>
            </div>
          )}

          <Group title={`角色（${chars.length}）`}>
            <div className="flex flex-wrap gap-4">
              {chars.map((a) => (
                <AssetCard
                  key={a.id}
                  a={a}
                  onImage={() => onImageClick(a)}
                  onZoom={() => setLightbox(a)}
                  onMenu={(e) => openMenu(a, e)}
                  onName={() => setEditFor(a)}
                />
              ))}
            </div>
          </Group>

          <Group title={`场景（${scenes.length}）`}>
            <div className="flex flex-wrap gap-4">
              {scenes.map((a) => (
                <AssetCard
                  key={a.id}
                  a={a}
                  onImage={() => onImageClick(a)}
                  onZoom={() => setLightbox(a)}
                  onMenu={(e) => openMenu(a, e)}
                  onName={() => setEditFor(a)}
                />
              ))}
            </div>
          </Group>
        </>
      )}

      {/* 提取弹窗 */}
      {extractOpen && (
        <Modal
          title="确认生成：抽出结构"
          onClose={() => setExtractOpen(false)}
          footer={
            <>
              <Button onClick={() => setExtractOpen(false)}>取消</Button>
              <Button variant="primary" onClick={doExtract}>
                确认生成
              </Button>
            </>
          }
        >
          <Label>文本模型</Label>
          <FakeSelect value="灵犀3.1 pro" />
          <CostRow cost={COST.assetExtract} balance={project.balance} />
        </Modal>
      )}

      {reextract && (
        <Modal
          title="重新提取"
          width={380}
          onClose={() => setReextract(false)}
          footer={
            <>
              <Button onClick={() => setReextract(false)}>取消</Button>
              <Button variant="primary" onClick={doExtract}>
                消耗 {COST.assetExtract} 星钻并重新提取
              </Button>
            </>
          }
        >
          <div className="text-sm text-muted">重新提取将重建角色/场景列表；已生成的参考图会尽量保留。</div>
        </Modal>
      )}

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

      {genFor && (
        <GenImageModal
          a={genFor}
          balance={project.balance}
          onClose={() => setGenFor(null)}
          onGen={async () => {
            const id = genFor.id
            setGenFor(null)
            await generateAssetImages([id])
          }}
        />
      )}

      {editFor && (
        <EditDescModal
          a={editFor}
          onClose={() => setEditFor(null)}
          onSave={(patch) => {
            updateAsset(editFor.id, patch)
            setEditFor(null)
          }}
        />
      )}

      {lightbox && <Lightbox title={lightbox.name} url={lightbox.imageUrl} onClose={() => setLightbox(null)} />}

      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { useStore.getState().showToast('请选择本地图片（示意）'); setMenu(null) }}>
            选择图片
          </MenuItem>
          <MenuItem onClick={() => { setGenFor(menu.a); setMenu(null) }}>
            AI 生{menu.a.kind === 'char' ? '角色' : '场景'}
          </MenuItem>
          <MenuItem
            disabled={menu.a.imgState !== 'done'}
            onClick={() => { useStore.getState().showToast('已开始下载（示意）'); setMenu(null) }}
          >
            下载
          </MenuItem>
          <MenuItem
            disabled={menu.a.imgState !== 'done'}
            onClick={() => { clearAssetImage(menu.a.id); setMenu(null) }}
          >
            清除图片
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
    setEditFor(a) // 点图（无论有无图）→ 打开编辑描述；看大图走右上角放大镜
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
  onName,
}: {
  a: Asset
  onImage: () => void
  onZoom: () => void
  onMenu: (e: React.MouseEvent) => void
  onName: () => void
}) {
  const done = a.imgState === 'done'
  return (
    <div className="w-[236px]">
      <div
        onClick={onImage}
        title="点击编辑描述"
        className="group relative flex h-[150px] cursor-pointer items-center justify-center rounded-lg border border-line bg-panel2 bg-cover bg-center text-xs text-faint"
        style={{ backgroundImage: a.imageUrl ? `url("${a.imageUrl}")` : undefined }}
      >
        {a.imgState === 'generating' && (
          <span className="inline-flex items-center gap-2 text-muted">
            <Spinner size={13} /> 生成中…
          </span>
        )}
        {a.imgState === 'none' && <span>生成或上传{a.kind === 'char' ? '角色' : '场景'}图</span>}

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
      <button className="mt-2 flex items-center gap-1 text-sm text-brand hover:underline" onClick={onName}>
        {a.name} <span className="text-[11px] text-muted">✎</span>
      </button>
      <div className="mt-0.5 line-clamp-1 text-xs text-faint">{a.desc}</div>
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

function GenImageModal({
  a,
  balance,
  onClose,
  onGen,
}: {
  a: Asset
  balance: number
  onClose: () => void
  onGen: () => void
}) {
  const [prompt, setPrompt] = useState(a.prompt)
  const [res, setRes] = useState('1K')
  const [calc, setCalc] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setCalc(false), 600)
    return () => clearTimeout(t)
  }, [])
  return (
    <Modal
      title={`AI 生${a.kind === 'char' ? '角色' : '场景'}（${a.name}）`}
      width={720}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={calc} onClick={onGen}>
            确认生成{!calc && ` · ✦${COST.assetImgEach}`}
          </Button>
        </>
      }
    >
      <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="mt-4 flex items-end gap-6">
        <div>
          <Label>图片模型</Label>
          <div className="w-40">
            <FakeSelect value="phan image2" />
          </div>
        </div>
        <div>
          <Label>画面比例</Label>
          <div className="rounded-lg border border-line px-3 py-1 text-sm text-muted">1:1</div>
        </div>
        <div>
          <Label>分辨率</Label>
          <ResChips value={res} onChange={setRes} />
        </div>
        <div className="ml-auto pb-1 text-[13px] text-muted">
          {calc ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size={12} /> 合计预估中…
            </span>
          ) : (
            <span>
              <Diamond /> <span className="text-white">{COST.assetImgEach}</span> · 余额 {fmt(balance)}
            </span>
          )}
        </div>
      </div>
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
  onGen: (ids: string[]) => void
}) {
  const [sel, setSel] = useState<string[]>(assets.map((a) => a.id))
  const [res, setRes] = useState('1K')
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const cost = sel.length * COST.assetImgEach
  return (
    <Modal
      title="一键补全参考图"
      width={720}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-[13px] text-muted">
            已选 {sel.length}/{assets.length} · 合计预计消耗 <span className="text-white">{fmt(cost)}</span> 星钻（{sel.length} 张）· 余额 {fmt(balance)}
          </span>
          <Button variant="primary" disabled={!sel.length} onClick={() => onGen(sel)}>
            生成（{sel.length}）
          </Button>
        </div>
      }
    >
      <div className="max-h-[360px] space-y-4 overflow-y-auto">
        {assets.map((a) => (
          <div key={a.id} className="rounded-lg border border-line p-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} className="accent-brand" />
              <span className="text-brand">{a.name}</span>
              <span className="rounded bg-panel2 px-1.5 py-0.5 text-[11px] text-muted">
                {a.kind === 'char' ? '角色' : '场景'}
              </span>
            </label>
            <div className="mt-2 line-clamp-3 rounded border border-line/60 bg-panel2/50 px-2.5 py-2 text-xs text-muted">
              {a.prompt}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <span className="text-[13px] text-muted">分辨率</span>
        <ResChips value={res} onChange={setRes} />
      </div>
    </Modal>
  )
}

function EditDescModal({
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
  return (
    <Modal
      title={`编辑描述（${a.name}）`}
      width={720}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave({ desc, prompt })}>
            保存
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
        {a.kind === 'char' && <span>角色定位：{importanceCn(a)}</span>}
        <span>别名：{a.alias?.trim() ? a.alias : '暂无'}</span>
        {a.kind === 'scene' && a.belongSegs && <span>出现在第 {a.belongSegs.join('、')} 段</span>}
        {a.kind === 'scene' && a.roles && <span>出场角色：{a.roles.join('、')}</span>}
      </div>
      <Label>描述</Label>
      <Textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="h-3" />
      <Label>图像提示词</Label>
      <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
    </Modal>
  )
}
