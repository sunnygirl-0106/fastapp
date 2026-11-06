import { Radio } from '@/components/ui'
import { useEffect, useRef, useState } from 'react'
import type { Project } from '@/types'
import { clampTargetDuration } from '@/data/duration'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import { GenerateConfirmModal, ModelSelect } from '@/components/ui'

export default function SegmentConfirmModal({ project, mode, onClose, onConfirm }: {
  project: Project
  mode: 'first' | 'redo'
  onClose: () => void
  onConfirm: (mode: 'auto' | 'manual', target: number, style: string) => void
}) {
  const [style, setStyle] = useState(project.config.shotStyle ?? '')
  const [durMode, setDurMode] = useState<'auto' | 'manual'>(project.config.durMode ?? 'auto')
  const [targetDur, setTargetDur] = useState(String(project.config.targetDur ?? 60))
  const [flash, setFlash] = useState(false)
  const targetRef = useRef<HTMLInputElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => { if (durMode === 'manual') targetRef.current?.focus() }, [durMode])
  useEffect(() => () => clearTimeout(flashTimer.current), [])
  const normalizeTarget = () => {
    const value = clampTargetDuration(targetDur.trim() ? Number(targetDur) : NaN)
    if (!targetDur.trim() || value !== Number(targetDur)) {
      setFlash(true); clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(false), 600)
    }
    setTargetDur(String(value))
    return value
  }
  const [model, setModel] = useState<string>(MODELS.text)
  return (
    <GenerateConfirmModal
      width={600}
      title={mode === 'redo' ? '确认重新拆解剧本' : '确认拆解剧本'}
      what={mode === 'redo' ? `AI 将根据剧本重新生成段落，当前 ${project.segments.length} 个段落（包括你的手动修改）会被覆盖。` : 'AI 将根据当前内容生成剧本段落。'}
      model={<ModelSelect value={model} options={MODEL_OPTIONS.text} onChange={setModel} variant="field" width={220} />}
      extra={<div className="space-y-5 pt-1 text-[0.8125rem]">
        <fieldset className="min-w-0 rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <legend className="px-2 text-sm font-medium text-white/90">成片时长</legend>
          <div className="space-y-2">
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${durMode === 'auto' ? 'border-[#c2f2ff]/30 bg-[#c2f2ff]/[0.06]' : 'border-transparent hover:bg-white/[0.03]'}`}>
              <Radio name="durMode" checked={durMode === 'auto'} onChange={() => setDurMode('auto')} />
              <span className="flex flex-1 items-center justify-between gap-3">
                <span className="font-medium text-white/90">自动确定</span>
                <span className="text-xs text-white/45">根据剧本内容分配</span>
              </span>
            </label>
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 transition-colors ${durMode === 'manual' ? 'border-[#c2f2ff]/30 bg-[#c2f2ff]/[0.06]' : 'border-transparent hover:bg-white/[0.03]'}`}>
              <label className="flex cursor-pointer items-center gap-3 font-medium text-white/90"><Radio name="durMode" checked={durMode === 'manual'} onChange={() => setDurMode('manual')} />指定时长</label>
              <div className="flex items-center gap-2 text-xs text-white/45">
                <input autoFocus={durMode === 'manual'} ref={targetRef} aria-label="目标成片时长" type="number" min={4} max={600} step={1} disabled={durMode !== 'manual'} value={targetDur} onChange={(e) => setTargetDur(e.target.value)} onBlur={normalizeTarget} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); normalizeTarget() } }} className={`h-8 w-[4.5rem] rounded-lg border border-white/10 bg-black/30 text-center text-sm tabular-nums outline-none focus:ring-1 focus:ring-[#c2f2ff]/60 disabled:opacity-40 ${flash ? 'text-red-400' : 'text-white/90'}`} />秒
              </div>
            </div>
          </div>
        </fieldset>
        <label className="block space-y-2.5"><span className="font-medium text-white/90">风格参考 <span className="font-normal text-white/40">（可选）</span></span><textarea aria-label="风格参考" rows={3} value={style} onChange={e => setStyle(e.target.value)} placeholder="风格、光影、色调、材质、美术笔触、画面氛围等相关描述" className="w-full resize-none rounded-lg border border-white/10 bg-black/30 p-3 leading-5 outline-none placeholder:text-white/30 focus:ring-1 focus:ring-[#c2f2ff]/60" /></label>
      </div>}
      cost={COST.segGen}
      balance={project.balance}
      notice={mode === 'first' ? <>开始后「剧本」将锁定，仅供查看、不可再编辑</> : undefined}
      confirmText={mode === 'redo' ? '确认并重新拆解' : '确认并开始拆解'}
      onClose={onClose}
      onConfirm={() => onConfirm(durMode, normalizeTarget(), style)}
    />
  )
}
