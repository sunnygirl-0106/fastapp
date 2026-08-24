import { useEffect } from 'react'
import { useCurrent, useStore } from '@/store/workflowStore'
import { WorkflowTopBar } from '@/components/TopBar'
import StepBar, { stepUnlocked } from '@/components/StepBar'
import Step1Script from '@/steps/Step1Script'
import Step2Segments from '@/steps/Step2Segments'
import Step3Assets from '@/steps/Step3Assets'
import Step4Shots from '@/steps/Step4Shots'
import Step5Video from '@/steps/Step5Video'

const NEXT_LABEL = ['分段', '资产', '分镜', '视频']

export default function Workflow() {
  const project = useCurrent()
  const step = useStore((s) => s.step)
  const goStep = useStore((s) => s.goStep)
  const back = useStore((s) => s.back)

  const unlocked = project ? stepUnlocked(project) : []
  const canNext = step < 5 && unlocked[step] // 下一步是否已解锁

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canNext) goStep(step + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canNext, step, goStep])

  if (!project) return null

  return (
    <div className="flex min-h-screen flex-col pb-16">
      <WorkflowTopBar name={project.name} balance={project.balance} onBack={back} />
      <StepBar project={project} />

      <main className="flex-1 px-8 py-2">
        {step === 1 && <Step1Script project={project} />}
        {step === 2 && <Step2Segments project={project} />}
        {step === 3 && <Step3Assets project={project} />}
        {step === 4 && <Step4Shots project={project} />}
        {step === 5 && <Step5Video project={project} />}
      </main>

      {/* 底部固定：进入下一步 */}
      {step < 5 && (
        <div className="fixed inset-x-0 bottom-0 flex justify-end border-t border-line/60 bg-ink/95 px-8 py-3 backdrop-blur">
          <button
            disabled={!canNext}
            onClick={() => goStep(step + 1)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-brand transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:text-faint"
            title={!canNext ? '完成当前步骤后解锁' : '⌘↵'}
          >
            <span>→</span>
            进入下一步 · {NEXT_LABEL[step - 1]}
          </button>
        </div>
      )}
    </div>
  )
}
