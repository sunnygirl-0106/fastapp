import { Fragment, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Asset, VideoReferenceImage } from '@/types'
import { mentionParts } from '@/utils/mentions'

type Reference = Pick<Asset, 'name' | 'kind' | 'imageUrl'>
function Mention({ text, reference }: { text: string; reference?: Reference }) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  return <span tabIndex={0}
    className={reference ? `inline whitespace-nowrap rounded px-1 font-medium ${reference.kind === 'char' ? 'bg-brand/15 text-brand-light' : 'bg-violet-400/15 text-violet-200'}` : 'text-red-300 underline decoration-dashed underline-offset-4'}
    title={reference ? undefined : '找不到这个角色或场景'}
    onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setAnchor({ top: r.bottom + 5, left: r.left }) }}
    onMouseLeave={() => setAnchor(null)}
    onFocus={e => { const r = e.currentTarget.getBoundingClientRect(); setAnchor({ top: r.bottom + 5, left: r.left }) }} onBlur={() => setAnchor(null)}>
    <span className="opacity-60">@</span>{text.slice(1)}
    {anchor && createPortal(<span role="tooltip" className="pointer-events-none fixed z-[100] block w-40 rounded-lg border border-white/15 bg-[#202224] p-2 text-xs text-white shadow-xl" style={{ top: Math.min(anchor.top, window.innerHeight - 205), left: Math.max(8, Math.min(anchor.left, window.innerWidth - 168)) }}>
      {reference ? <>{reference.imageUrl ? <img src={reference.imageUrl} alt={reference.name} className="mb-2 h-32 w-full rounded bg-black/30 object-contain" /> : <span className="mb-2 block py-5 text-center text-white/50">还没有参考图</span>}<span className="block">{reference.kind === 'char' ? '角色' : '场景'} · {reference.name}</span></> : '找不到这个角色或场景'}
    </span>, document.body)}
  </span>
}
export default function MentionText({ text, assets, references = [], renderPlain }: { text: string; assets: Asset[]; references?: VideoReferenceImage[]; renderPlain?: (text: string) => ReactNode }) {
  const byName = new Map<string, Reference>(assets.map(a => [a.name, a]))
  references.forEach(ref => byName.set(ref.label.replace(/^@/, ''), ref))
  return <>{mentionParts(text, [...byName.keys()]).map(part => part.mention ? <Mention key={part.start} text={part.text} reference={part.name ? byName.get(part.name) : undefined} /> : <Fragment key={part.start}>{renderPlain ? renderPlain(part.text) : part.text}</Fragment>)}</>
}
