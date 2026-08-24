import { Overlay } from './ui'

export default function Lightbox({ title, url, onClose }: { title: string; url?: string; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="rounded-xl border border-line bg-panel p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-sm text-muted">{title} · 参考图</div>
          <button className="text-muted hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>
        <div
          className="h-[560px] w-[420px] rounded-lg bg-cover bg-center"
          style={{
            backgroundImage: url ? `url("${url}")` : undefined,
            background: url ? undefined : 'linear-gradient(135deg,#2a2a2e,#141416)',
          }}
        />
      </div>
    </Overlay>
  )
}
