import { useStore } from '@/store/workflowStore'

export default function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-fadeUp">
      <div className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm shadow-2xl">{toast}</div>
    </div>
  )
}
