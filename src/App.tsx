import { useStore } from '@/store/workflowStore'
import ProjectList from '@/pages/ProjectList'
import Workflow from '@/pages/Workflow'
import Toast from '@/components/Toast'

export default function App() {
  const screen = useStore((s) => s.screen)
  return (
    <div className="min-h-screen bg-ink text-white/90">
      {screen === 'projects' ? <ProjectList /> : <Workflow />}
      <Toast />
    </div>
  )
}
