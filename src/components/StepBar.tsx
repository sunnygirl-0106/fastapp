import type { Project } from '@/types'
import { useStore } from '@/store/workflowStore'

const STEPS = ['剧本', '分段', '资产', '分镜', '视频']

export function stepUnlocked(p: Project): boolean[] {
  const scriptDone = p.script.trim().length > 0
  return [
    true, // 1 剧本
    scriptDone, // 2 分段
    p.segStatus === 'done', // 3 资产
    p.assetStatus === 'done', // 4 分镜
    p.shotStatus === 'done', // 5 视频
  ]
}

export default function StepBar({ project }: { project: Project }) {
  const step = useStore((s) => s.step)
  const goStep = useStore((s) => s.goStep)
  const unlocked = stepUnlocked(project)

  return (
    <div className="flex items-center justify-center gap-1 py-3">
      {STEPS.map((name, i) => {
        const n = i + 1
        const isCurrent = step === n
        const locked = !unlocked[i]
        return (
          <div key={n} className="flex items-center">
            <button
              disabled={locked}
              onClick={() => !locked && goStep(n)}
              title={locked ? '完成上一步后解锁' : ''}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isCurrent ? 'bg-panel2 text-brand' : locked ? 'text-faint' : 'text-white/80 hover:text-white'
              }`}
            >
              <span className={isCurrent ? 'text-brand' : ''}>{n}</span>
              <span>{name}</span>
              {locked && <span className="text-[11px]">🔒</span>}
            </button>
            {n < STEPS.length && <span className="px-1 text-faint">→</span>}
          </div>
        )
      })}
    </div>
  )
}
