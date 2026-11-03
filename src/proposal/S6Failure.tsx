import { useEffect, useState } from 'react'
import { AlertTriangle, MoreHorizontal, MoreVertical, Play, RotateCcw } from 'lucide-react'
import type { Shot } from '@/types'
import { ActionBar, Diamond, PageHeader, Spinner, fmt } from '@/components/ui'
import { COST, mockImage } from '@/services/generation'
import { no2, preferredVersion } from '@/utils/project'
import { sampleAssets, sampleSegments, sampleShots, SAMPLE_SCRIPT } from '@/data/mock'
import failedCover from '@/assets/cover-failed.svg'
import { makeProject, withVersions } from './data'
import { Issue, Notes, Segmented, SourceTable, Stage, useLocalToast } from './kit'

const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

type Where = 'seg' | 'asset' | 'shot' | 'img' | 'batch' | 'newver'

/* ---------- 底部操作栏里的失败说明：不额外占一行，复用已有的 ActionBar 左槽 ---------- */
function BarFail({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-red-400">
      <AlertTriangle size={13} className="shrink-0" />
      {children}
    </span>
  )
}

/* ---------- 重试按钮：永远带上「成功后预计消耗」 ---------- */
function RetryCTA({
  label,
  cost,
  busy,
  onClick,
}: {
  label: string
  cost: number
  busy?: boolean
  onClick?: () => void
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      style={CTA_GRADIENT}
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? <Spinner size={12} /> : <span className="text-[12px] leading-none">✦</span>}
      {busy ? '正在生成…' : `${fmt(cost)} ${label}`}
    </button>
  )
}

/* ================= ① 拆解剧本失败 ================= */
function SegFail() {
  const project = makeProject({ segStatus: 'none', assetStatus: 'none', shotStatus: 'none', segments: [], shots: [] })
  return (
    <Stage project={project} step={1}>
      <PageHeader title="添加剧本" desc="粘贴或输入完整剧本内容，AI 会将其拆解为剧本段落。" />
      {/* 失败落在输入框本身：描边转红，内容一字不动 */}
      <textarea
        readOnly
        value={SAMPLE_SCRIPT}
        className="min-h-[300px] w-full resize-y rounded-xl border border-red-500/30 bg-panel px-5 py-4 text-sm leading-7 outline-none"
      />
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-faint">{SAMPLE_SCRIPT.length} 字</span>
        <span className="text-brand">已保存</span>
      </div>
      <ActionBar inline left={<BarFail>拆解失败：模型返回超时，剧本内容已完整保留</BarFail>}>
        <RetryCTA label="重新拆解" cost={COST.segGen} />
      </ActionBar>
    </Stage>
  )
}

/* ================= ② 提取角色与场景失败 ================= */
/* 只有成功 / 失败两态：识别结果是一次性的语义产物，部分识别出来的也不可信，失败就整体重来 */
function AssetFail() {
  const segs = sampleSegments()
  const project = makeProject({ assetStatus: 'none', shotStatus: 'none', assets: [], shots: [] })
  return (
    <Stage project={project} step={2}>
      <PageHeader title="剧本拆解" desc={`共 ${segs.length} 个剧本段落`} />
      <div className="space-y-3">
        {segs.map((s) => (
          <div key={s.id} className="rounded-lg border border-white/10 bg-[#111213] p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums text-white/40">{no2(s.no)}</span>
              <span className="text-sm font-medium leading-snug text-white">{s.title}</span>
              <span className="text-sm tabular-nums text-white/40">15 秒</span>
            </div>
            <p className="mt-2 max-h-[4.5rem] overflow-hidden whitespace-pre-line text-xs leading-relaxed text-white/60">
              {s.text}
            </p>
          </div>
        ))}
      </div>
      <ActionBar inline left={<BarFail>提取失败，段落内容保持不变</BarFail>}>
        <RetryCTA label="重新提取角色与场景" cost={COST.assetExtract} />
      </ActionBar>
    </Stage>
  )
}

/* ================= ③ 生成镜头失败 ================= */
/* 镜头设计是一张表（Step4Shots.tsx）：一行＝一个镜头，由对应的剧本段落生成。
   某段失败＝这一行根本没被生成出来，所以失败落成表里的一条占位行，占住它本该在的位置。 */

// 对齐 Step4Shots.tsx:120 buildGridTemplate()：选择 44 / 镜头 150 / 字段列 / 操作 76
const SHOT_COLS = [
  { key: 'shot', label: '画面描述', min: 240, grow: 3 },
  { key: 'timeline', label: '时间安排', min: 220, grow: 2.4 },
  { key: 'action', label: '主要动作', min: 160, grow: 1.6 },
] as const
const SHOT_GRID = `44px 150px ${SHOT_COLS.map((c) => `minmax(${c.min}px, ${c.grow}fr)`).join(' ')} 76px`

function ShotFail() {
  const segs = sampleSegments()
  const shot = sampleShots()[0]
  const failedNos = [2, 3]

  return (
    <Stage project={makeProject({ shots: [shot] })} step={4}>
      <PageHeader
        title="镜头设计"
        desc="已生成 1 个镜头，预计成片时长约 15 秒。"
        right={
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5">
            重新生成镜头
          </button>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-white/10 bg-card">
        <div className="w-full min-w-[720px]">
          {/* 表头 */}
          <div className="grid items-stretch bg-[#101010] text-[13px] text-white/90" style={{ gridTemplateColumns: SHOT_GRID }}>
            <div className="flex h-12 items-center justify-center">
              <input type="checkbox" checked readOnly className="h-[18px] w-[18px] rounded accent-brand" />
            </div>
            <div className="flex h-12 items-center border-r border-white/[0.06] px-3">镜头</div>
            {SHOT_COLS.map((c) => (
              <div key={c.key} className="flex h-12 items-center border-r border-white/[0.06] px-3">
                {c.label}
              </div>
            ))}
            <div className="flex h-12 items-center justify-center px-3">操作</div>
          </div>

          {/* 成功行：与线上完全一致，不加任何「成功」标记 */}
          <div
            className="grid min-h-[120px] items-stretch border-b border-white/10"
            style={{ gridTemplateColumns: SHOT_GRID }}
          >
            <div className="flex items-center justify-center">
              <input type="checkbox" checked readOnly className="accent-brand" />
            </div>
            <div className="flex flex-col justify-center gap-1 border-r border-white/[0.06] px-3 py-3">
              <span className="text-[14px] font-medium tabular-nums text-white/90">镜头 {no2(shot.no)}</span>
              <span className="text-[12px] text-faint">15 秒</span>
              <span className="inline-flex items-center gap-1.5 text-[12px] text-faint">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-faint" />
                尚未生成视频
              </span>
            </div>
            {SHOT_COLS.map((c) => (
              <div key={c.key} className="border-r border-white/[0.06] px-3 py-3 text-[13px] text-white/80">
                <div className="line-clamp-3 whitespace-pre-line">{shot[c.key]}</div>
              </div>
            ))}
            <div className="flex items-center justify-center px-3 py-3">
              <span className="inline-flex items-center justify-center rounded-full border border-white/10 px-3 py-1.5 text-white/70">
                <MoreHorizontal size={16} />
              </span>
            </div>
          </div>

          {/* 失败行：这一段没生成出镜头，用占位行占住它的位置——不是把成功行染红 */}
          {failedNos.map((no, i) => {
            const seg = segs.find((x) => x.no === no)!
            return (
              <div
                key={seg.id}
                className={`grid min-h-[92px] items-stretch bg-red-500/[0.04] ${
                  i === failedNos.length - 1 ? '' : 'border-b border-white/10'
                }`}
                style={{ gridTemplateColumns: SHOT_GRID }}
              >
                {/* 没有镜头就没有可勾选的对象 */}
                <div className="flex items-center justify-center">
                  <input type="checkbox" disabled className="accent-brand opacity-25" />
                </div>
                <div className="flex flex-col justify-center gap-1 border-r border-white/[0.06] px-3 py-3">
                  <span className="text-[14px] font-medium tabular-nums text-white/40">段落 {no2(no)}</span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-red-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                    生成失败
                  </span>
                </div>
                {/* 字段列没有内容可填，合并成一格放段落原文 */}
                <div className="flex items-center px-3 py-3" style={{ gridColumn: `3 / span ${SHOT_COLS.length}` }}>
                  <p className="line-clamp-2 text-[12px] leading-relaxed text-white/45">{seg.text}</p>
                </div>
                {/* 操作列留空：这一行没有镜头，⋯ 里的编辑/删除都无从谈起 */}
                <div />
              </div>
            )
          })}
        </div>
      </div>

      <ActionBar inline left={<BarFail>{failedNos.length} 个段落生成失败</BarFail>}>
        <RetryCTA label="重新生成失败段落" cost={failedNos.length * COST.shotGenEach} />
      </ActionBar>
    </Stage>
  )
}

/* ================= ④ 生成参考图失败 ================= */
function ImgFail() {
  const assets = sampleAssets()
  const project = makeProject()
  const failedId = assets[0].id

  return (
    <Stage project={project} step={3}>
      <PageHeader title="角色与场景" desc="完善角色与场景的设定和参考图，可以让后续画面更加一致。" />
      <div className="mb-3 text-[13px] font-medium text-white/90">角色与场景（{assets.length}）</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,230px))] justify-start gap-4">
        {assets.map((a) => {
          const failed = a.id === failedId
          return (
            <div
              key={a.id}
              className={`flex flex-col overflow-hidden rounded-lg border bg-panel transition-colors ${
                failed ? 'border-red-500/30' : 'border-line hover:border-white/15'
              }`}
            >
              {/* 失败用专门的占位图；失败标记落在封面上，封面自带深色底保证可读 */}
              <div className="relative aspect-square overflow-hidden bg-panel2">
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url("${failed ? failedCover : mockImage(a.name, a.id)}")` }}
                />
                {failed && (
                  <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[11px] leading-none text-red-400 backdrop-blur-[6px]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                    生成失败
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-medium leading-tight text-white">{a.name}</div>
                  {/* 「角色 / 场景」是类型不是状态，不该被失败顶掉 */}
                  <div className="mt-1.5 truncate text-[12px] leading-none text-white/40">
                    {a.kind === 'char' ? '角色' : '场景'}
                  </div>
                </div>
                <MoreVertical size={18} className="shrink-0 text-white/50" />
              </div>
            </div>
          )
        })}
      </div>
      <ActionBar inline left={<BarFail>1 张参考图生成失败</BarFail>}>
        <RetryCTA label="重新生成参考图" cost={COST.assetImgEach} />
      </ActionBar>
    </Stage>
  )
}

/* ================= ⑤⑥ 视频相关 ================= */
/* 「首次生成失败」和「批量部分失败」是同一件事——一批视频首次生成、其中几个没出来，合并成一屏 */
function VideoFail({ mode, showToast }: { mode: 'newver' | 'batch'; showToast: (m: string) => void }) {
  const base = sampleShots()
  const [retrying, setRetrying] = useState(false)
  /** 第 ⑥ 种：重试成功后 v1 → v2 */
  const [vCount, setVCount] = useState(1)

  const shots: Shot[] =
    mode === 'newver'
      ? [withVersions(base[0], vCount, vCount - 1), withVersions(base[1], 1), withVersions(base[2], 1)]
      : [
          withVersions(base[0], 1),
          { ...base[1], video: { state: 'none', versions: [] } },
          { ...base[2], video: { state: 'none', versions: [] } },
        ]

  const project = makeProject({ shots })
  const failedIds = mode === 'newver' ? [] : [base[1].id, base[2].id]
  const newVerFailed = mode === 'newver' && vCount === 1

  const retry = () => {
    setRetrying(true)
    setTimeout(() => {
      setRetrying(false)
      setVCount(2)
      showToast(`已生成 v2，扣费 ✦${fmt(COST.videoEach)}`)
    }, 1200)
  }

  return (
    <Stage project={project} step={5}>
      <PageHeader
        title="视频成片"
        desc="3 个镜头。同一镜头的每次重新生成都会保留为一个新版本。"
        right={
          <button
            disabled={retrying}
            onClick={newVerFailed ? retry : undefined}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {retrying && <Spinner size={12} />}
            {retrying ? '正在生成…' : '重新生成视频'}
          </button>
        }
      />

      <div className="flex flex-wrap gap-4">
        {shots.map((s) => {
          const failed = failedIds.includes(s.id)
          const ver = preferredVersion(s.video)
          const staleFail = newVerFailed && s.id === base[0].id
          return (
            <div
              key={s.id}
              className={`w-[226px] overflow-hidden rounded-lg border bg-card ${
                failed ? 'border-red-500/30' : 'border-white/5'
              }`}
            >
              <div
                className="group relative flex aspect-[226/221] w-full items-center justify-center overflow-hidden bg-cover bg-center"
                style={{ backgroundImage: `url("${failed ? failedCover : ver?.url}")` }}
              >
                {!failed && (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition group-hover:bg-black/60">
                    <Play size={28} className="ml-0.5" fill="currentColor" />
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[16px] font-medium text-white">镜头 {no2(s.no)}</span>
                    {/* 失败不产生版本号，所以失败卡片这里是空的 */}
                    {ver && (
                      <span className="rounded-full border border-line px-1.5 py-0.5 text-[11px] leading-none text-white/50">
                        {ver.tag}
                      </span>
                    )}
                    {/* 已有视频、本次新版本失败：就地一个小图标，hover 说清楚 */}
                    {staleFail && (
                      <AlertTriangle
                        size={12}
                        className="shrink-0 cursor-help text-red-400"
                        aria-label="上次重新生成失败"
                      />
                    )}
                  </div>
                  <MoreVertical size={18} className="text-white/60" />
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className={`font-medium ${failed ? 'text-red-400' : 'text-[#00d8dc]'}`}>
                    {failed ? '生成失败' : '已完成'}
                  </span>
                  <span className="text-white/40">15 秒</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {mode === 'batch' ? (
        <ActionBar inline left={<BarFail>2 个镜头生成失败</BarFail>}>
          <button
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5"
            onClick={() => showToast('已开始下载 镜头01_v1.mp4（示意）')}
          >
            下载已生成视频
          </button>
          <RetryCTA label="重新生成视频" cost={2 * COST.videoEach} />
        </ActionBar>
      ) : (
        /* 3 个镜头都有可用视频，这一屏本来就是下载态；重新生成走右上角那个既有入口 */
        <ActionBar
          inline
          left={
            newVerFailed ? <BarFail>镜头 01 生成失败，版本保持 v1</BarFail> : '镜头 01 已生成 v2，v1 保留'
          }
        >
          <button
            style={CTA_GRADIENT}
            onClick={() => showToast('已开始批量下载（示意）')}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105"
          >
            批量下载
          </button>
        </ActionBar>
      )}
    </Stage>
  )
}

/* ================= 议题 ================= */
const WHERE_OPTIONS: { key: Where; label: string }[] = [
  { key: 'seg', label: '① 拆解剧本' },
  { key: 'asset', label: '② 提取角色与场景' },
  { key: 'shot', label: '③ 生成镜头' },
  { key: 'img', label: '④ 生成参考图' },
  { key: 'batch', label: '⑤ 生成视频' },
  { key: 'newver', label: '⑥ 已有视频，生成新版本' },
]

/** 失败发生的那一刻弹的 toast —— 费用说明只在这里出现，不常驻页面 */
const FAIL_TOAST: Record<Where, string> = {
  seg: '剧本拆解失败，本次未扣费',
  asset: `提取角色与场景失败，已退回 ✦${fmt(COST.assetExtract)}`,
  shot: `2 个段落的镜头生成失败，已退回 ✦${fmt(2 * COST.shotGenEach)}`,
  img: '1 张参考图生成失败，本次未扣费',
  batch: `2 段视频生成失败，已退回 ✦${fmt(2 * COST.videoEach)}`,
  newver: `镜头 01 本次生成失败，已退回 ✦${fmt(COST.videoEach)}`,
}

export default function S6Failure() {
  const [where, setWhere] = useState<Where>('newver')
  const { showToast, toastNode } = useLocalToast()

  // 切到某个失败场景时，把当时会弹的 toast 复现一次
  useEffect(() => {
    showToast(FAIL_TOAST[where])
  }, [where, showToast])

  return (
    <Issue
      no={6}
      title="生成失败：保留现场，失败不占版本号，但不能消失"
      desc="现状：仓库里根本没有失败这条路径——每次生成都是固定延时后必定成功，没有任何 failed 状态。这一条要把 5 个步骤的失败表现补齐，核心原则是：失败要被看见、不能吞掉用户已有的内容、也不能制造一个空版本。"
      source={
        <>
          <SourceTable
            head={['失败位置', '建议表现与操作']}
            rows={[
              ['拆解剧本', '页面保留失败说明，提供「重新拆解」；保留输入内容'],
              ['提取角色与场景', '保留已有内容，提供「重新提取」'],
              ['生成镜头', '整体失败显示页面提示；部分失败标出对应段落，允许只重试失败部分'],
              ['生成参考图', '对应卡片显示「生成失败」，提供「重试」'],
              ['首次生成视频', '对应镜头保留失败卡片，提供「重试」'],
              ['已有视频，生成新版本失败', '旧视频仍可播放和下载，附带「本次生成失败」的提示'],
            ]}
          />
          <ul className="mt-2.5 flex list-inside list-disc flex-col gap-1.5">
            <li>成功得到可用视频，才增加 v1、v2、v3。失败作为一次生成尝试展示，不制造一个空版本。</li>
            <li>v1 已成功，下一次失败，再重试成功，得到 v2。重试过程中仍能查看、下载原有版本。</li>
            <li>批量生成部分失败时，可以直接下载成功结果，并提供「重试失败的 2 个」。</li>
            <li>
              界面上区分「本次未扣费」与「已退回」，避免用户产生费用疑虑。重试仍应提前说明成功后预计消耗，不能让「重试」看起来像无条件免费。
            </li>
          </ul>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={where} onChange={setWhere} options={WHERE_OPTIONS} />
        <button
          onClick={() => showToast(FAIL_TOAST[where])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-[12px] text-white/60 transition-colors hover:border-white/30 hover:text-white"
        >
          <RotateCcw size={11} className="shrink-0" />
          重放失败 toast
        </button>
      </div>
      {where === 'shot' && (
        <div className="text-[12px] text-white/40">
          部分成功与完全失败合并为一种：都算失败，操作都是「重新生成失败段落」，只按失败的段落计价。
        </div>
      )}
      {where === 'newver' && (
        <div className="text-[12px] text-white/40">
          这一屏可以真的点：右上角「重新生成视频」→ 1.2 秒后成功，版本号从 v1 直接变成 v2，中间不会出现空的 v2。
        </div>
      )}

      {where === 'seg' && <SegFail />}
      {where === 'asset' && <AssetFail />}
      {where === 'shot' && <ShotFail />}
      {where === 'img' && <ImgFail />}
      {(where === 'batch' || where === 'newver') && (
        <VideoFail key={where} mode={where} showToast={showToast} />
      )}

      <Notes
        title="失败往哪儿放"
        items={[
          <>
            <span className="text-white/90">不新增红色横幅。</span>
            失败说明放进页面本来就有的底部操作栏左槽——那里原本就是放「已选择 3/3 个镜头」这类状态文案的位置，
            右边的主按钮顺势变成「重试」。页面结构一行都不多。
          </>,
          <>
            <span className="text-white/90">对象上只标状态，不放操作</span>
            ：参考图/视频失败 → 卡片换成失败占位图 + 一个红色「生成失败」标记，其余一字不动。
            视频卡片的标记直接替换状态行的「已完成」（本来就是状态位）；
            参考图卡片则把标记压在封面左下角，<span className="text-white/90">不去顶掉「角色 / 场景」</span>——
            那是这个对象的类型，不是它的状态，顶掉就少了一条信息。
            <span className="text-white/90">重试统一收在右下角那一个主按钮上</span>——卡片上的「⋯」是它本来就有的菜单，
            不该被临时征用成重试入口；一个页面也不该有两个地方都能触发同一次扣费。
          </>,
          <>
            拆解剧本失败时输入框描边转红，内容一字不动——失败本身已经说明了问题，不需要再写一段话解释。
          </>,
          <>
            <span className="text-white/90">提取角色与场景只有成功 / 失败两态</span>
            ——识别结果是对全文的一次性理解，只认出一半的清单不完整也不可信，不值得在上面接着往下做，失败就整体重来。
          </>,
          <>
            <span className="text-white/90">生成镜头则不区分「部分失败」与「整体失败」</span>
            ：镜头是逐段产出的，已成功的行本身就能用；没跑完一律算失败，主按钮都是「重新生成失败段落」，
            只按失败的段落计价，成功的行不会被重做——也和右上角那个「重新生成镜头」区分开，后者要先选段落。
            用户不用先判断自己属于哪一类。
          </>,
          <>
            <span className="text-white/90">镜头设计是一张表，失败要在表里占住位置</span>
            ——某段失败意味着那一行根本没被生成出来，直接跳号会让人以为段落丢了。
            所以补一条占位行：镜头列写「段落 02」而不是「镜头 02」（它还不是镜头），字段列没内容可填，
            合并成一格放段落原文，勾选框和操作列都置灰（没有镜头可选、也没有镜头可编辑删除）。
            成功行一个像素都不动。
          </>,
        ]}
      />

      <Notes
        title="版本号规则"
        items={[
          <>
            <span className="text-white/90">版本号只在成功时推进。</span>
            首次生成失败 → 没有 v1，卡片上那个版本号小标是空的；v1 已成功、v2 失败 → 仍然只有 v1，
            重试成功后那一版才叫 v2。绝不出现一个点进去没有内容的空版本。
          </>,
          <>
            已有视频、本次新版本失败时，卡片仍是完整的 v1 卡片，状态行照写「已完成」——它确实已完成，
            只在版本号旁边多一个红色小三角（hover 说明本次生成失败），失败的细节交给底部说明。
            <span className="text-white/90">旧视频照常播放、下载</span>。
          </>,
          <>
            重试期间不进入全局 loading，不禁用播放和下载——新一次生成的成败，不该影响已经拿到手的结果。
            所以 3 个镜头都已有视频时，底部主按钮照旧是「批量下载」，失败不改变这一屏的主任务；
            重新生成走右上角那个本来就有的入口，不在底部再开一个。
          </>,
        ]}
      />

      <Notes
        title="费用怎么说"
        items={[
          <>
            <span className="text-white/90">「本次未扣费 / 已退回 ✦N」走 toast</span>
            ，在失败发生的那一刻弹一次就够了——这是一次性的确认信息，不该常驻在页面上占位置。
            上面每切换一个场景都会复现当时的 toast，也可以点「重放失败 toast」再看。
          </>,
          <>
            两种措辞严格区分：还没开始计费就失败 →「本次未扣费」；已扣费后失败 →「已退回 ✦N」。含糊其辞最容易引发工单。
          </>,
          <>
            <span className="text-white/90">底部的重试按钮永远带着价格</span>，不能让重试看起来像无条件免费。
            部分失败时只按失败项计价（「✦4,726 重新生成视频」＝ 2 段的钱），已成功的不重复扣费。
          </>,
        ]}
      />

      <Notes
        title="落地需要的数据结构改动"
        items={[
          <>
            <code className="text-white/80">GenStatus</code> 增加 <code className="text-white/80">'failed'</code>；
            <code className="text-white/80">ImgState</code> 同理，供第 ①②③④ 项使用。
          </>,
          <>
            <code className="text-white/80">ShotVideo</code> 增加{' '}
            <code className="text-white/80">attempts: {'{ at, reason, charged }[]'}</code>
            ——失败尝试记在这里，<span className="text-white/90">不进 versions 数组</span>，
            版本号仍由 <code className="text-white/80">versions.length</code> 决定，天然满足「失败不占版本号」。
          </>,
          <>
            <code className="text-white/80">workflowStore</code> 的 5 个 finish* 函数需要能返回失败：
            当前全是无条件 <code className="text-white/80">await delay() → 成功</code>，
            要改成可失败并按项记录，同时把扣费从「无条件扣」改成「成功才扣 / 失败已扣则退回」。
          </>,
        ]}
      />
      {toastNode}
    </Issue>
  )
}
