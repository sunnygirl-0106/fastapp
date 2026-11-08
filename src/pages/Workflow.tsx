import { useCurrent, useStore } from '@/store/workflowStore'
import { WorkflowTopBar } from '@/components/TopBar'
import StepBar, { stepLocked } from '@/components/StepBar'
import Step1Script from '@/steps/Step1Script'
import Step2Segments from '@/steps/Step2Segments'
import Step3Assets from '@/steps/Step3Assets'
import Step4Shots from '@/steps/Step4Shots'
import Step5Video from '@/steps/Step5Video'
import NoticeBar from '@/components/NoticeBar'

export default function Workflow() {
  const project = useCurrent()
  const step = useStore((s) => s.step)
  const back = useStore((s) => s.back)

  if (!project) return null

  // 仅剧本在开始拆解后锁定
  const locked = stepLocked(project)

  return (
    <div className="flex min-h-screen flex-col pb-20">
      {/* pb 给各步骤底部 ActionBar 留位 */}
      <WorkflowTopBar name={project.name} balance={project.balance} onBack={back} />
      <StepBar project={project} />

      <main className="w-full min-w-0 flex-1 px-6 py-4 lg:px-8">
        {!!project.interruptedGeneration?.length && <NoticeBar action="知道了" onAction={() => useStore.getState().dismissGenerationRecovery()}>
          上次{project.interruptedGeneration.join('、')}因页面重载中断，已解除等待状态，已有内容已保留。请检查结果后按需重新生成。
        </NoticeBar>}
        {step === 1 && <Step1Script project={project} locked={locked[0]} />}
        {step === 2 && <Step2Segments project={project} />}
        {step === 3 && <Step3Assets project={project} />}
        {step === 4 && <Step4Shots project={project} />}
        {step === 5 && <Step5Video project={project} />}
      </main>
    </div>
  )
}
