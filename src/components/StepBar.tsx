import { Check, ChevronRight } from 'lucide-react'
import type { Project } from '@/types'
import { useStore } from '@/store/workflowStore'

const STEPS = ['剧本', '拆解', '角色与场景', '镜头', '成片']

// 解锁规则：已开始（对应状态不为 none）即可进入
export function stepUnlocked(p: Project): boolean[] {
  return [
    true, // 1 故事
    p.segStatus !== 'none', // 2 拆解：一旦开始拆解就可进入
    p.assetStatus !== 'none', // 3 角色与场景
    p.shotStatus !== 'none', // 4 镜头
    p.shots.some((s) => s.video.state !== 'none'), // 5 成片：至少一条视频进入生成态
  ]
}

export function stepDone(p: Project): boolean[] {
  const vids = p.shots.map((s) => s.video.state)
  return [
    p.script.trim().length > 0,
    p.segStatus === 'done',
    p.assetStatus === 'done',
    p.shotStatus === 'done',
    p.shots.length > 0 && vids.every((v) => v === 'done'),
  ]
}

export default function StepBar({ project }: { project: Project }) {
  const step = useStore((s) => s.step)
  const goStep = useStore((s) => s.goStep)
  const unlocked = stepUnlocked(project)
  const done = stepDone(project)

  return (
    <div className="flex items-center justify-center gap-1 py-3">
      {STEPS.map((name, i) => {
        const n = i + 1
        const isCurrent = step === n
        const isDone = done[i] && !isCurrent
        const locked = !unlocked[i]
        return (
          <div key={n} className="flex items-center">
            <button
              disabled={locked}
              onClick={() => !locked && goStep(n)}
              title={locked ? '完成上一步后解锁' : ''}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isCurrent
                  ? 'text-white font-medium'
                  : locked
                    ? 'text-faint cursor-not-allowed'
                    : 'text-white/80 hover:text-white'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  isDone ? 'bg-brand/15 text-brand' : isCurrent ? 'bg-brand text-black' : 'text-faint'
                }`}
              >
                {isDone ? <Check size={12} /> : n}
              </span>
              <span>{name}</span>
            </button>
            {n < STEPS.length && (
              <ChevronRight size={14} className={`mx-0.5 ${done[i] ? 'text-brand/50' : 'text-faint'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
