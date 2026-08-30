import { Fragment, type CSSProperties } from 'react'
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

type NodeState = 'done' | 'active' | 'todo'

// 三态样式：主色统一为全局品牌青 #02C5C8（中性灰保持不变）
const GEM: Record<NodeState, CSSProperties> = {
  done: { background: 'rgba(2,197,200,0.16)', border: '1.5px solid rgba(2,197,200,0.42)' },
  active: {
    background: 'linear-gradient(140deg, #5fe3e5, #02c5c8)',
    border: '1.5px solid #87fdff',
    boxShadow: '0 0 10px rgba(2,197,200,0.45)',
  },
  todo: { background: '#0d1211', border: '1.5px solid #242e2b' },
}
const GLYPH_COLOR: Record<NodeState, string> = { done: '#5fe3e5', active: '#032e2f', todo: '#5f6b66' }
const LABEL: Record<NodeState, CSSProperties> = {
  done: { color: '#9fb3ab', fontWeight: 500 },
  active: { color: '#ffffff', fontWeight: 700 },
  todo: { color: '#57625d', fontWeight: 500 },
}
const KICKER_COLOR: Record<NodeState, string> = { done: '#4c5b55', active: 'rgba(2,197,200,0.9)', todo: '#38423e' }
// 连接线填充：done=已完成青（细而淡的静止线）；active=当前流动渐隐（配合扫光）；todo=无
const FILL: Record<NodeState, string | undefined> = {
  done: 'linear-gradient(90deg, rgba(2,197,200,0.4), rgba(95,227,229,0.32))',
  active: 'linear-gradient(90deg, rgba(2,197,200,0.7), rgba(2,197,200,0.04))',
  todo: undefined,
}

export default function StepBar({ project }: { project: Project }) {
  const step = useStore((s) => s.step)
  const goStep = useStore((s) => s.goStep)
  const unlocked = stepUnlocked(project)
  const done = stepDone(project)

  const stateOf = (i: number): NodeState => (step === i + 1 ? 'active' : done[i] ? 'done' : 'todo')

  return (
    <div className="flex justify-center px-11 pb-2 pt-6">
      <div className="flex w-full max-w-[820px] items-start">
        {STEPS.map((name, i) => {
          const n = i + 1
          const st = stateOf(i)
          const locked = !unlocked[i]
          return (
            <Fragment key={n}>
              <button
                disabled={locked}
                onClick={() => !locked && goStep(n)}
                title={locked ? '完成上一步后解锁' : ''}
                className={`flex w-[100px] shrink-0 flex-col items-center gap-[13px] bg-transparent ${
                  locked ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {/* 菱形节点 */}
                <div className="relative flex h-10 w-10 items-center justify-center">
                  {st === 'active' && <span className="om-ripple" />}
                  <span
                    className="flex h-[26px] w-[26px] rotate-45 items-center justify-center rounded-lg"
                    style={GEM[st]}
                  >
                    <span
                      className="-rotate-45 text-[13px] font-extrabold tabular-nums leading-none"
                      style={{ color: GLYPH_COLOR[st] }}
                    >
                      {st === 'done' ? '✓' : n}
                    </span>
                  </span>
                </div>

                {/* 标签 + STEP 编号 */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="whitespace-nowrap text-[15px] leading-none transition-colors"
                    style={LABEL[st]}
                  >
                    {name}
                  </div>
                  <div
                    className="whitespace-nowrap text-[10px] font-bold leading-none tracking-[0.15em]"
                    style={{ color: KICKER_COLOR[st] }}
                  >
                    STEP {String(n).padStart(2, '0')}
                  </div>
                </div>
              </button>

              {/* 连接线（属于左侧节点，随其状态着色/流动） */}
              {i < STEPS.length - 1 && (
                <div
                  className="relative mt-[19px] h-[2px] flex-1 overflow-hidden rounded-[2px]"
                  style={{ background: st === 'done' ? 'transparent' : '#161f1c' }}
                >
                  {FILL[st] && (
                    <div
                      className={st === 'done' ? 'absolute inset-x-0 top-1/2 h-px -translate-y-1/2' : 'absolute inset-0'}
                      style={{ background: FILL[st] }}
                    />
                  )}
                  {st === 'active' && (
                    <div
                      className="absolute inset-y-0 w-[44%]"
                      style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
                        animation: 'omSweep 2.6s linear infinite',
                      }}
                    />
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
