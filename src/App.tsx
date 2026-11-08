import { useStore } from '@/store/workflowStore'
import ProjectList from '@/pages/ProjectList'
import Workflow from '@/pages/Workflow'
import Toast from '@/components/Toast'
import { useEffect } from 'react'
import { hasActiveGeneration } from '@/services/generationRecovery'

export default function App() {
  const screen = useStore((s) => s.screen)
  const generating = useStore((s) => s.projects.some(hasActiveGeneration))
  useEffect(() => {
    if (!generating) return
    const preventAccidentalReload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventAccidentalReload)
    return () => window.removeEventListener('beforeunload', preventAccidentalReload)
  }, [generating])
  return (
    <div className="min-h-screen bg-ink text-white/90">
      {screen === 'projects' ? <ProjectList /> : <Workflow />}
      <Toast />
    </div>
  )
}
