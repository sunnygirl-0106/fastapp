import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import MentionText from '@/components/MentionText'
import VideoVersionSelect from '@/components/VideoVersionSelect'
import { Overlay, fmt } from '@/components/ui'
import type { Project, Shot, VideoVersion } from '@/types'
import { no2 } from '@/utils/project'

function generatedAt(timestamp?: number) {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '生成时间未记录'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '生成时间未记录'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export default function ShotVideoInfoModal({ project, shot, version, onVersionChange, onClose }: {
  project: Project
  shot: Shot
  version?: VideoVersion
  onVersionChange: (tag: string) => void
  onClose: () => void
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const copyRequest = useRef(0)
  useEffect(() => {
    setCopyState('idle')
    return () => { clearTimeout(timer.current); copyRequest.current++ }
  }, [version?.tag])

  async function copyPrompt() {
    if (!version?.videoPrompt) return
    const request = ++copyRequest.current
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(version.videoPrompt)
      if (request !== copyRequest.current) return
      setCopyState('copied')
    } catch {
      if (request !== copyRequest.current) return
      setCopyState('failed')
    }
    timer.current = setTimeout(() => setCopyState('idle'), 2000)
  }

  const params = [
    ['模型', version?.model ?? '未记录'],
    ['分辨率', version?.resolution ?? '未记录'],
    ['画幅', version?.ratio ?? '未记录'],
    ['时长', version ? `${version.dur}s` : '未记录'],
    ['配音', version?.audio === undefined ? '未记录' : version.audio ? '生成配音' : '不生成配音'],
  ]

  return <Overlay onClose={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="shot-video-info-title"
      className="flex h-[min(860px,calc(100dvh-96px))] max-h-[calc(100dvh-32px)] w-[960px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl bg-[#1c1d20] text-[#e4e4e7] shadow-2xl">
      <header className="flex shrink-0 items-start gap-3 px-5 py-5 sm:items-center sm:px-7">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-y-2">
          <h2 id="shot-video-info-title" className="whitespace-nowrap text-[17px] font-semibold">镜头信息 {no2(shot.no)}</h2>
          <div className="flex items-center whitespace-nowrap text-[15px] font-normal">
            {shot.video.versions.length > 1
              ? <VideoVersionSelect versions={shot.video.versions} value={version?.tag} onChange={onVersionChange} />
              : version && <><span className="mx-3 text-[#4a4b50]">/</span><span className="text-[#a1a1a6]">第 {version.tag.replace(/^v/, '')} 版</span></>}
          </div>
          <span aria-hidden="true" className="mx-4 hidden h-3 w-px bg-[#3a3a3e] sm:block" />
          <span className="w-full whitespace-nowrap text-[13px] font-normal tabular-nums text-[#6f6f75] sm:w-auto">{generatedAt(version?.createdAt)}</span>
        </div>
        <button type="button" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8a8b90] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-brand" onClick={onClose} aria-label="关闭镜头信息">
          <X size={20} />
        </button>
      </header>

      <div className="table-scroll flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto overflow-x-hidden px-5 pb-9 pt-1 sm:px-7">
        <div className="flex flex-wrap items-center gap-2">
          {params.map(([label, value]) => <span key={label} className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#303034] bg-[#232326] px-2.5 py-2 text-[13px] leading-none">
            <span className="text-[#85858b]">{label}</span><span>{value}</span>
          </span>)}
          <span className="flex items-center gap-[7px] whitespace-nowrap rounded-md border border-[#7fd3cf]/[0.22] bg-[#7fd3cf]/[0.08] px-2.5 py-2 text-[13px] leading-none">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rotate-45 rounded-[1.5px] bg-[#7fd3cf]" />
            <span className="text-[#85858b]">本次消耗</span>
            <span className="font-semibold tabular-nums text-[#a6e3e0]">{version?.cost === undefined ? '未记录' : fmt(version.cost)}</span>
            {version?.cost !== undefined && <span className="-ml-[3px] text-[#7fd3cf]">星钻</span>}
          </span>
        </div>

        <section className="flex flex-col gap-3 rounded-[10px] border border-[#2a2a2e] bg-[#17171a] px-5 pb-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-normal text-[#85858b]">视频提示词</h3>
            <button type="button" onClick={copyPrompt} disabled={!version?.videoPrompt} aria-live="polite"
              className="shrink-0 whitespace-nowrap rounded-md border border-[#303034] bg-[#232326] px-2.5 py-1 text-[12px] text-[#c9c9cd] transition-colors hover:bg-[#2a2a2e] hover:text-white focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40">
              {copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败，请重试' : '复制'}
            </button>
          </div>
          <div className="whitespace-pre-wrap break-words text-[14px] leading-[1.9] text-[#d4d4d8]">
            <MentionText text={version?.videoPrompt ?? '此历史版本未保存视频提示词'} assets={project.assets} references={version?.referenceImages} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-[15px] font-semibold">生成时的参考图</h3>
          {version?.referenceImages === undefined
            ? <p className="text-[13px] text-[#8a8b90]">此历史版本未保存参考图列表</p>
            : version.referenceImages.length === 0
              ? <p className="text-[13px] text-[#8a8b90]">未使用参考图</p>
              : <div className="flex flex-wrap gap-[14px]">{version.referenceImages.map(ref => <figure key={ref.assetId} className="flex w-[160px] max-w-full flex-col gap-2">
                <img src={ref.imageUrl} alt={`${ref.label} ${ref.name}`} className="aspect-square w-full rounded-lg bg-[#232428] object-cover" />
                <figcaption className="text-[13px] leading-relaxed text-[#8a8b90]">{ref.label} · {ref.kind === 'char' ? '角色' : '场景'}「{ref.name}」</figcaption>
              </figure>)}</div>}
        </section>
      </div>
    </div>
  </Overlay>
}
