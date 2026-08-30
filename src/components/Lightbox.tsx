import { Download, X } from 'lucide-react'
import { Overlay } from './ui'

export default function Lightbox({ title, url, onClose }: { title: string; url?: string; onClose: () => void }) {
  const download = () => {
    if (!url) return
    const ext = url.startsWith('data:image/svg')
      ? 'svg'
      : url.startsWith('data:image/jpeg')
        ? 'jpg'
        : url.startsWith('data:image/webp')
          ? 'webp'
          : 'png'
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}-参考图.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="rounded-xl border border-line bg-panel p-3 shadow-2xl">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <div className="text-sm text-muted">{title} · 参考图</div>
          <div className="flex items-center gap-1">
            <button
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-muted transition-colors hover:bg-line hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={download}
              disabled={!url}
              title="下载参考图"
            >
              <Download size={15} /> 下载
            </button>
            <button className="p-1 text-muted hover:text-white" onClick={onClose} aria-label="关闭">
              <X size={16} />
            </button>
          </div>
        </div>
        <div
          className="aspect-[3/4] h-[82vh] max-h-[880px] max-w-[90vw] rounded-lg bg-cover bg-center"
          style={{
            backgroundImage: url ? `url("${url}")` : undefined,
            background: url ? undefined : 'linear-gradient(135deg,#2a2a2e,#141416)',
          }}
        />
      </div>
    </Overlay>
  )
}
