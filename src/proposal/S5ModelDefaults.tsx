import { useState } from 'react'
import { X } from 'lucide-react'
import {
  Diamond,
  FakeSelect,
  Label,
  ModelSelect,
  fmt,
} from '@/components/ui'
import { COST, MODEL_OPTIONS } from '@/services/generation'
import { DEFAULT_BALANCE } from '@/data/mock'
import { IMAGE_DEFAULTS, IMG_RATIO_OPTIONS, RATIO_OPTIONS, RES_OPTIONS, VIDEO_DEFAULTS } from './data'
import { BeforeAfter, Issue, Notes, Segmented, SourceTable } from './kit'

const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

/** 弹窗外壳：与 GenerateConfirmModal / Step3 各弹窗完全同款，但内嵌在页面里便于并排对比 */
function ModalShell({
  title,
  width = 520,
  footer,
  children,
}: {
  title: string
  width?: number
  footer: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]"
      style={{ width, maxWidth: '100%' }}
    >
      <div className="flex h-16 items-center justify-between border-b border-white/5 px-5">
        <div className="text-base font-medium text-white">{title}</div>
        <button className="text-white/50 transition-colors hover:text-white" aria-label="关闭">
          <X size={14} />
        </button>
      </div>
      <div className="px-5 py-6">{children}</div>
      <div className="flex min-h-16 items-center justify-end gap-2 px-5 pb-5">{footer}</div>
    </div>
  )
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex min-h-[32px] items-center justify-between gap-3">
      <span className="shrink-0 text-sm text-white/60">{label}</span>
      <span className="text-right text-sm text-white">{value}</span>
    </div>
  )
}

/** 「推荐」小标：沿用 LockedBadge/Tag 的低饱和描边风格 */
function Rec() {
  return (
    <span className="ml-1.5 rounded border border-brand/35 bg-brand/[0.08] px-1 py-0.5 text-[10px] font-medium leading-none text-brand">
      推荐
    </span>
  )
}

function ResChips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex gap-2">
      {options.map((r) => (
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

/* ---------- ① 确认生成视频 ---------- */
function VideoConfirm({ after }: { after: boolean }) {
  const count = 3
  const [model, setModel] = useState<string>(VIDEO_DEFAULTS.model)
  const [res, setRes] = useState<string>(VIDEO_DEFAULTS.res)
  const [ratio, setRatio] = useState<string>(VIDEO_DEFAULTS.ratio)
  const [voice, setVoice] = useState<boolean>(VIDEO_DEFAULTS.voice)
  const cost = count * COST.videoEach

  return (
    <ModalShell
      title="确认生成视频"
      width={520}
      footer={
        <>
          <button className="h-10 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5">
            取消
          </button>
          <button
            style={CTA_GRADIENT}
            className="h-10 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105"
          >
            确认并生成 {count} 段视频
          </button>
        </>
      }
    >
      <div className="text-sm text-white/60">将为选中的 {count} 个镜头生成视频。</div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-[13px]">
        <div>
          <Label>
            分辨率
            {after && <Rec />}
          </Label>
          {after ? (
            <ModelSelect value={res} options={RES_OPTIONS} onChange={setRes} variant="field" width="100%" />
          ) : (
            <FakeSelect value="720p" />
          )}
        </div>
        <div>
          <Label>
            画面比例
            {after && <Rec />}
          </Label>
          {after ? (
            <ModelSelect value={ratio} options={RATIO_OPTIONS} onChange={setRatio} variant="field" width="100%" />
          ) : (
            <FakeSelect value="9:16" />
          )}
        </div>
        <div>
          <Label>
            配音
            {after && <Rec />}
          </Label>
          <label className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={after ? voice : true}
              onChange={(e) => setVoice(e.target.checked)}
              readOnly={!after}
              className="accent-brand"
            />
            <span>生成配音</span>
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-lg bg-black/40 p-3">
        <Row label="生成数量" value={`${count} 段视频`} />
        <Row
          label={
            <>
              视频模型
              {after && <Rec />}
            </>
          }
          value={
            <ModelSelect value={model} options={MODEL_OPTIONS.video} onChange={setModel} variant="field" width={220} />
          }
        />
        <Row
          label="预计消耗"
          value={
            <span className="inline-flex items-center gap-1 text-white">
              <Diamond />
              {fmt(cost)} 星钻
            </span>
          }
        />
        <Row label="当前余额" value={`${fmt(DEFAULT_BALANCE)} 星钻`} />
      </div>
    </ModalShell>
  )
}

/* ---------- ② 批量补全参考图 ---------- */
function BatchImage({ after }: { after: boolean }) {
  const [model, setModel] = useState<string>(IMAGE_DEFAULTS.model)
  const [ratio, setRatio] = useState<string>(IMAGE_DEFAULTS.ratio)
  const [res, setRes] = useState<string>(IMAGE_DEFAULTS.res)
  const n = 3
  const cost = n * COST.assetImgEach

  return (
    <ModalShell
      title="一键补全参考图"
      width={560}
      footer={
        <>
          <div className="mr-auto text-[14px] text-white/60">
            合计预计消耗 <span className="text-brand">{fmt(cost)}</span> 星钻（{n} 张）
          </div>
          <button
            style={CTA_GRADIENT}
            className="h-10 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105"
          >
            确认生成（{n}）
          </button>
        </>
      }
    >
      <div className="text-sm text-white/60">将为 3 个角色与场景生成参考图，可逐个取消。</div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <ModelSelect value={model} options={MODEL_OPTIONS.image} onChange={setModel} variant="pill" width={148} />
          {after && <Rec />}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white">
            画面比例
            {after && <Rec />}
          </span>
          <ModelSelect value={ratio} options={IMG_RATIO_OPTIONS} onChange={setRatio} variant="pill" width={84} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white">
            分辨率
            {after && <Rec />}
          </span>
          <ResChips value={res} onChange={setRes} options={['1K', '2K', '4K']} />
        </div>
      </div>
      {after && (
        <div className="mt-4 text-[12px] leading-relaxed text-white/40">
          批量统一用推荐设置；需要单独调整时，在单张生成弹窗里微调。
        </div>
      )}
    </ModalShell>
  )
}

/* ---------- ③ 单张参考图 ---------- */
function SingleImage({ after }: { after: boolean }) {
  const [model, setModel] = useState<string>(IMAGE_DEFAULTS.model)
  const [ratio, setRatio] = useState<string>(after ? '9:16' : IMAGE_DEFAULTS.ratio)
  const [res, setRes] = useState<string>(IMAGE_DEFAULTS.res)

  return (
    <ModalShell
      title="AI 生成角色（苏可）"
      width={560}
      footer={
        <>
          <div className="mr-auto text-[14px] text-white/60">
            合计预计消耗 <span className="text-brand">{fmt(COST.assetImgEach)}</span> 星钻（1 张）
          </div>
          <button
            style={CTA_GRADIENT}
            className="h-10 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105"
          >
            确认生成
          </button>
        </>
      }
    >
      <textarea
        rows={4}
        readOnly
        defaultValue="一个24岁的年轻女性，资深宅女，三视图角色参考图。她体态微肉可爱，圆润的鹅蛋脸，素颜，表情慵懒且生动。"
        className="w-full resize-none rounded-lg border border-transparent bg-black/40 p-3 text-[14px] leading-relaxed text-white outline-none"
      />
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <ModelSelect value={model} options={MODEL_OPTIONS.image} onChange={setModel} variant="pill" width={148} />
          {after && <Rec />}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[14px] text-white">画面比例</span>
          <ModelSelect value={ratio} options={IMG_RATIO_OPTIONS} onChange={setRatio} variant="pill" width={84} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[14px] text-white">分辨率</span>
          <ResChips value={res} onChange={setRes} options={['1K', '2K', '4K']} />
        </div>
      </div>
      {after && (
        <div className="mt-4 text-[12px] leading-relaxed text-white/40">
          单张允许微调：角色三视图常用 1:1，全身立绘更适合 9:16——参考图比例服务于该角色/场景的展示需要，不必等于视频比例。
        </div>
      )}
    </ModalShell>
  )
}

export default function S5ModelDefaults() {
  const [which, setWhich] = useState<'video' | 'batch' | 'single'>('video')

  const render = (after: boolean) =>
    which === 'video' ? (
      <VideoConfirm after={after} />
    ) : which === 'batch' ? (
      <BatchImage after={after} />
    ) : (
      <SingleImage after={after} />
    )

  return (
    <Issue
      no={5}
      title="模型参数：提供默认值"
      desc="现状：生成视频弹窗里的「分辨率 720p」「画面比例 9:16」是 FakeSelect——长得像下拉框，点了没反应，改不了；参考图弹窗的参数虽然能改，但没有任何「哪个是推荐值」的提示。改为入口全部保留、全部可用、并全部预填推荐值。"
      source={
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[280px] flex-1">
            <SourceTable
              head={['视频参数', '默认']}
              rows={[
                ['模型', '默认 seedance2.0'],
                ['分辨率', '720p'],
                [
                  '视频比例',
                  <span>
                    <span className="text-white/35 line-through">16：9</span>{' '}
                    <span className="text-brand">9:16</span>
                    <span className="ml-1 text-[12px] text-white/40">（原表笔误，已确认按 9:16）</span>
                  </span>,
                ],
                ['是否生成声音', '是'],
              ]}
            />
          </div>
          <div className="min-w-[280px] flex-1">
            <SourceTable
              head={['图片参数', '默认']}
              rows={[
                ['模型', '默认 phanimage2'],
                ['图片比例', '1：1'],
                ['分辨率', '1k'],
              ]}
            />
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={which}
          onChange={setWhich}
          options={[
            { key: 'video', label: '确认生成视频' },
            { key: 'batch', label: '一键补全参考图（批量）' },
            { key: 'single', label: 'AI 生成角色（单张）' },
          ]}
        />
        <span className="text-[12px] text-white/40">改后的下拉框都是真的，可以点开试试</span>
      </div>

      <BeforeAfter before={render(false)} after={render(true)} />

      <Notes
        items={[
          <>
            <span className="text-white/90">入口全保留，但必须是真的能用的控件</span>：把{' '}
            <code className="text-white/80">VideoConfirmModal</code> 里的两个{' '}
            <code className="text-white/80">FakeSelect</code> 换成已有的{' '}
            <code className="text-white/80">ModelSelect variant="field"</code>，不新造组件。
          </>,
          <>
            默认值集中成一份常量（放在 <code className="text-white/80">src/services/generation.ts</code> 的{' '}
            <code className="text-white/80">MODELS</code> 旁边）：视频 = Seedance 2.0 / 720p / 9:16 / 生成配音；
            图片 = Phan Image 2 / 1:1 / 1K。三个弹窗都从这份常量取初值。视频比例默认跟随项目配置（当前项目是「9:16 竖屏」）。
          </>,
          <>
            <span className="text-white/90">参考图比例不跟随视频比例</span>
            ——角色三视图用 1:1、全身立绘用 9:16，取决于这张参考图要表达什么。批量走统一推荐设置，单张允许微调。
          </>,
          <>
            「推荐」小标只标在预填值上，用户改过之后该标记消失，让人知道自己已经偏离默认——避免「改了但不知道改没改」。
          </>,
        ]}
      />
    </Issue>
  )
}
