import { useState } from 'react'
import type { Asset } from '@/types'
import { CHAR_LAYOUT, CHAR_LAYOUT_SUMMARY, SCENE_LAYOUT, SCENE_LAYOUT_SUMMARY } from '@/data/assetTemplates'
export default function AssetLayout({ kind }: { kind: Asset['kind'] }) {
  const [open, setOpen] = useState(false)
  const char = kind === 'char'
  return <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-[13px]">
    <div className="flex items-start gap-2">
      <div className="flex-1 text-white/70">出图版式 <span className="rounded bg-white/10 px-1 text-xs text-faint" title={`所有${char ? '角色' : '场景'}参考图使用同一版式，保证后续视频中的形象一致`}>固定</span> <span>{char ? CHAR_LAYOUT_SUMMARY : SCENE_LAYOUT_SUMMARY}</span></div>
      <button className="shrink-0 text-white/60 hover:text-white" onClick={() => setOpen(!open)}>{open ? '收起' : '展开'}</button>
    </div>
    {open && <p className="mt-2 text-xs leading-relaxed text-white/60">{char ? CHAR_LAYOUT : SCENE_LAYOUT}</p>}
  </div>
}
