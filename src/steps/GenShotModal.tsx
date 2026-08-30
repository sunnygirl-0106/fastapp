import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Project } from '@/types'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import { Diamond, ModelSelect, Overlay, fmt } from '@/components/ui'

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
}: {
  project: Project
  onClose: () => void
  onConfirm: (segNos: number[]) => void
}) {
  const segs = project.segments
  const [style, setStyle] = useState('')
  const [model, setModel] = useState<string>(MODELS.text)
  const [sel, setSel] = useState<number[]>(segs.map((s) => s.no))
  const toggle = (no: number) => setSel((s) => (s.includes(no) ? s.filter((x) => x !== no) : [...s, no]))
  const cost = sel.length * COST.shotGenEach
  const allSel = sel.length === segs.length
  const someSel = sel.length > 0 && !allSel

  const cols = 'grid grid-cols-[52px_64px_1fr_84px]'

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[88vh] w-[800px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
        {/* 头部 */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">生成分镜</div>
          <button className="text-white/50 transition-colors hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>

        {/* 主体 */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          {/* 文本模型 */}
          <div className="space-y-2">
            <div className="text-sm text-white/60">文本模型</div>
            <ModelSelect value={model} options={MODEL_OPTIONS.text} onChange={setModel} variant="field-dark" width="100%" />
          </div>

          {/* 风格参考（可选） */}
          <div className="space-y-2">
            <div className="text-sm text-white/60">风格参考（可选）</div>
            <textarea
              rows={3}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="风格、光影、色调、材质、美术笔触、画面氛围等相关描述"
              className="w-full resize-none rounded-lg border border-transparent bg-black/40 p-3 text-sm leading-relaxed text-white/90 outline-none placeholder:text-white/40 focus:border-brand/40"
            />
          </div>

          {/* 选择要生成分镜的段 */}
          <div className="space-y-2">
            <div className="text-sm text-white/60">选择要生成分镜的段（{segs.length}）</div>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-[#111213]">
              {/* 表头 */}
              <div className={`${cols} items-center border-b border-white/10 bg-white/[0.03] text-[13px] text-white/90`}>
                <div className="flex h-12 items-center pl-4">
                  <HeadCheckbox
                    checked={allSel}
                    indeterminate={someSel}
                    onChange={() => setSel(allSel ? [] : segs.map((s) => s.no))}
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
                          className="h-[18px] w-[18px] rounded accent-brand"
                        />
                      </div>
                      <div className="px-3 text-[13px] font-medium tabular-nums text-white/90">
                        {String(s.no).padStart(2, '0')}
                      </div>
                      <div className="min-w-0 px-3 py-3">
                        <div className="truncate text-[13px] text-white/90">{s.title}</div>
                        <div className="truncate text-[12px] text-white/50">{s.text}</div>
                      </div>
                      <div className="px-3 text-[13px] text-white/70">{s.dur}</div>
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
              onClick={() => onConfirm(sel)}
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
