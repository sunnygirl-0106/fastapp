import { useEffect, useRef, useState } from 'react'
import type { Project } from '@/types'
import { clampTargetDuration } from '@/data/duration'
import { COST, MODELS, MODEL_OPTIONS } from '@/services/generation'
import { GenerateConfirmModal, ModelSelect } from '@/components/ui'

export default function SegmentConfirmModal({ project, mode, onClose, onConfirm }: {
  project: Project
  mode: 'first' | 'redo'
  onClose: () => void
  onConfirm: (mode: 'auto' | 'manual', target: number) => void
}) {
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
      title={mode === 'redo' ? '确认重新拆解剧本' : '确认拆解剧本'}
      what={mode === 'redo' ? `AI 将根据剧本重新生成段落，当前 ${project.segments.length} 个段落（包括你的手动修改）会被覆盖。` : 'AI 将根据当前内容生成剧本段落。'}
      model={<ModelSelect value={model} options={MODEL_OPTIONS.text} onChange={setModel} variant="field" width={220} />}
      extra={<div className="space-y-3 text-[13px]">
        <div className="text-white/70">成片时长</div>
        <label className="flex items-center gap-2"><input type="radio" name="durMode" checked={durMode === 'auto'} onChange={() => setDurMode('auto')} className="accent-brand" />自动确定<span className="text-xs text-faint">按剧本内容确定</span></label>
        <div className="flex items-center gap-2"><label className="flex items-center gap-2"><input type="radio" name="durMode" checked={durMode === 'manual'} onChange={() => setDurMode('manual')} className="accent-brand" />指定</label>
          <input autoFocus={durMode === 'manual'} ref={targetRef} aria-label="目标成片时长" type="number" min={4} max={600} step={1} disabled={durMode !== 'manual'} value={targetDur} onChange={(e) => setTargetDur(e.target.value)} onBlur={normalizeTarget} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); normalizeTarget() } }} className={`h-8 w-[72px] rounded-lg bg-black/40 text-center text-sm outline-none focus:ring-1 focus:ring-brand disabled:opacity-40 ${flash ? 'text-red-400' : ''}`} />秒
        </div>
        <p className="text-xs text-faint">本步把剧本拆成段落，并按原文长短给每段预分配时长，之后可随时调整。</p>
      </div>}
      cost={COST.segGen}
      balance={project.balance}
      notice={mode === 'first' ? <>开始后「剧本」将锁定，仅供查看、不可再编辑</> : undefined}
      confirmText={mode === 'redo' ? '确认并重新拆解' : '确认并开始拆解'}
      onClose={onClose}
      onConfirm={() => onConfirm(durMode, normalizeTarget())}
    />
  )
}
