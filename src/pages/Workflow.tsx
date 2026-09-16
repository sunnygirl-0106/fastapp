import { useCurrent, useStore } from '@/store/workflowStore'
import { WorkflowTopBar } from '@/components/TopBar'
import StepBar, { stepLocked } from '@/components/StepBar'
import Step1Script from '@/steps/Step1Script'
import Step2Segments from '@/steps/Step2Segments'
import Step3Assets from '@/steps/Step3Assets'
import Step4Shots from '@/steps/Step4Shots'
import Step5Video from '@/steps/Step5Video'

export default function Workflow() {
  const project = useCurrent()
  const step = useStore((s) => s.step)
  const back = useStore((s) => s.back)

  if (!project) return null

  // 1/2/3 步一旦下游开始生成即只读（规则见 StepBar.stepLocked）
  const locked = stepLocked(project)

  return (
    <div className="flex min-h-screen flex-col pb-20">
      {/* pb 给各步骤底部 ActionBar 留位 */}
      <WorkflowTopBar name={project.name} balance={project.balance} onBack={back} />
      <StepBar project={project} />

      <main className="mx-auto w-full max-w-[1680px] flex-1 px-6 py-4 lg:px-10 2xl:px-14">
        {step === 1 && <Step1Script project={project} locked={locked[0]} />}
        {step === 2 && <Step2Segments project={project} locked={locked[1]} />}
        {step === 3 && <Step3Assets project={project} locked={locked[2]} />}
        {step === 4 && <Step4Shots project={project} />}
        {step === 5 && <Step5Video project={project} />}
      </main>
    </div>
  )
}
