import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { Project } from '@/types'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import { Diamond, ModelSelect, Overlay, fmt } from '@/components/ui'
import DurationStepper from '@/components/DurationStepper'

// 浅青渐变主按钮（与首页 / 弹窗 CTA 一致）
const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

// 表头「全选」复选框（支持半选 indeterminate）
function HeadCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-[18px] w-[18px] rounded accent-brand"
    />
  )
}

// Step3（进入镜头设计）与 Step4（重新生成镜头）共用
export default function GenShotModal({
  project,
  onClose,
  onConfirm,
  initialSelection,
}: {
  initialSelection?: number[]
  project: Project
  onClose: () => void
  onConfirm: (segNos: number[], durations: Record<string, number>) => void
}) {
  const segs = project.segments
  const [model, setModel] = useState<string>(MODELS.text)
  const [draft, setDraft] = useState(() => {
    const pending = segs.filter((seg) => { const shot = project.shots.find((s) => s.segId === seg.id); return !shot || shot.outdated?.some(r => r.kind !== 'video') })
    const sel = initialSelection ?? pending.map((s) => s.no)
    const durations = new Map(segs.map((seg) => [seg.id, seg.dur!]))
    return { sel, durations }
  })
  const { sel, durations } = draft
  const setSelection = (sel: number[]) => setDraft((prev) => ({ ...prev, sel }))
  const toggle = (no: number) => setSelection(sel.includes(no) ? sel.filter((x) => x !== no) : [...sel, no])
  const total = segs.reduce((sum, seg) => sum + (sel.includes(seg.no) ? durations.get(seg.id)! : seg.dur!), 0)
  const cost = sel.length * COST.shotGenEach
  const allSel = sel.length === segs.length
  const someSel = sel.length > 0 && !allSel

  const cols = 'grid grid-cols-[52px_64px_minmax(0,1fr)_128px]'

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[88vh] w-[800px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
        {/* 头部 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">生成镜头设计</div>
          <button className="text-white/50 transition-colors hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        {/* 主体 */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          <div className="space-y-1 text-sm">
            <div className="text-white">成片时长：{project.config.durMode === 'manual' ? `目标 ${project.config.targetDur} 秒 · 当前合计 ${total} 秒` : `自动，按内容确定 · 预计合计 ${total} 秒`}</div>
            {sel.length > 0 && <p className="text-xs text-faint">可在下方逐段调整（4–30 秒），生成后也可以随时修改。</p>}
          </div>
          {/* 文本模型 */}
          <div className="space-y-2">
            <div className="text-sm text-white/60">文本模型</div>
            <ModelSelect value={model} options={MODEL_OPTIONS.text} onChange={setModel} variant="field-dark" width="100%" />
          </div>

          {project.config.shotStyle && <p className="text-sm text-white/60">风格参考：{project.config.shotStyle}（在拆解剧本时设定）</p>}

          {/* 选择要生成镜头的段落 */}
          <div className="space-y-2">
            <div className="text-sm text-white/60">选择要生成镜头的段落（{segs.length}）</div>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111213]">
              {/* 表头 */}
              <div className={`${cols} items-center border-b border-white/10 bg-white/[0.03] text-[13px] text-white/90`}>
                <div className="flex h-12 items-center pl-4">
                  <HeadCheckbox
                    checked={allSel}
                    indeterminate={someSel}
                    onChange={() => setSelection(allSel ? [] : segs.map((s) => s.no))}
                  />
                </div>
                <div className="px-3">段号</div>
                <div className="px-3">标题 / 剧本内容</div>
                <div className="px-3">时长</div>
              </div>
              {/* 表体（可滚动） */}
              <div className="max-h-[288px] overflow-y-auto">
                {segs.map((s) => {
                  const on = sel.includes(s.no)
                  const shot = project.shots.find((shot) => shot.segId === s.id)
                  return (
                    <label
                      key={s.id}
                      className={`${cols} cursor-pointer items-center border-b border-white/10 transition-colors last:border-0 hover:bg-white/[0.02]`}
                    >
                      <div className="flex h-[60px] items-center pl-4">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(s.no)}
                          aria-label={`选择段落 ${String(s.no).padStart(2, '0')}`}
                          className="h-[18px] w-[18px] rounded accent-brand"
                        />
                      </div>
                      <div className="px-3 text-[13px] font-medium tabular-nums text-white/90">
                        {String(s.no).padStart(2, '0')}
                      </div>
                      <div className="min-w-0 px-3 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[13px] text-white/90">{s.title}</span>
                          {!!shot?.outdated?.length && <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300"><AlertTriangle size={11} />待更新</span>}
                        </div>
                        <div className="truncate text-[12px] text-white/50">{s.text}</div>
                      </div>
                      <div className="flex cursor-default items-center self-stretch px-3 text-[13px] text-white/40"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                        {on ? <DurationStepper value={durations.get(s.id)!} variant="inline" size="sm" debounceMs={0}
                          title={`段落 ${String(s.no).padStart(2, '0')} 时长`}
                          onChange={(dur) => setDraft((prev) => ({ ...prev, durations: new Map(prev.durations).set(s.id, dur) }))}
                        /> : `${s.dur} 秒`}
                      </div>
                    </label>
                  )
                })}
                {segs.length === 0 && (
                  <div className="px-4 py-10 text-center text-[13px] text-white/40">暂无剧本段落</div>
                )}
              </div>
            </div>
          </div>

          {/* 消耗 + 余额 */}
          <div className="flex items-center gap-5 text-sm">
            <span className="inline-flex items-center gap-1 text-brand">
              <Diamond />
              {fmt(cost)}星钻
            </span>
            <span className="text-white">余额：{fmt(project.balance)} 星钻</span>
          </div>


        </div>

        {/* 底部 */}
        <div className="flex h-16 shrink-0 items-center justify-between px-5 pb-5">
          <div className="text-sm text-white/60">
            已选 {sel.length}/{segs.length} 段
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-10 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5"
            >
              取消
            </button>
            <button
              onClick={() => onConfirm(sel, Object.fromEntries(segs.filter((seg) => sel.includes(seg.no)).map((seg) => [seg.id, durations.get(seg.id)!])))}
              disabled={!sel.length}
              style={CTA_GRADIENT}
              className="h-10 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              生成全部（{sel.length}）
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}
