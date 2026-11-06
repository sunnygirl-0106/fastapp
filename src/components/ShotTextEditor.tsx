import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { Asset } from '@/types'
import { beatText, normalizeBeats, timelineLines, writeBeats, splitBeat, removeBeat, editBeat, beatPrefix, writeBeat, editableBeatText, type Beat } from '@/utils/timeline'
import { mentionParts } from '@/utils/mentions'
import { getUiScale } from '@/utils/layout'

// DOM offsets always refer to the stored plain text, including the full @name.
export function editorSelection(el: HTMLElement): [number, number] | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null
  const prefix = range.cloneRange()
  prefix.selectNodeContents(el); prefix.setEnd(range.startContainer, range.startOffset)
  return [prefix.toString().length, prefix.toString().length + range.toString().length]
}
export function placeEditorCaret(el: HTMLElement, offset: number) {
  const range = document.createRange()
  let remaining = offset
  for (const child of Array.from(el.childNodes)) {
    const length = child.textContent?.length ?? 0
    if (remaining <= length) {
      if (child.nodeType === 3) range.setStart(child, remaining)
      else if ((child as HTMLElement).getAttribute('contenteditable') !== 'false' && child.firstChild) range.setStart(child.firstChild, remaining)
      else if (remaining === 0) range.setStartBefore(child)
      else range.setStartAfter(child)
      range.collapse(true)
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
      return
    }
    remaining -= length
  }
  range.selectNodeContents(el); range.collapse(false)
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
}

function MentionInput({ value, assets, assetIds, label, placeholder, autoFocus, onChange, onSplit, onMerge, onPasteLines, onEscape, onBlur, register }: {
  value: string; assets: Asset[]; assetIds: string[]; label: string; placeholder?: string; autoFocus?: boolean
  onChange: (value: string) => void
  onSplit?: (start: number, end: number) => void
  onMerge?: () => void
  onPasteLines?: (lines: string[], start: number, end: number) => void
  onEscape?: () => void
  onBlur?: () => void
  register?: (el: HTMLDivElement | null) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const composing = useRef(false)
  const current = useRef(value)
  const [query, setQuery] = useState<{ start: number; end: number; text: string; top: number; left: number } | null>(null)
  useEffect(() => {
    if (!query) return
    const moved = () => {
      const bounds = ref.current && editorSelection(ref.current)
      if (!bounds || bounds[0] !== query.end || bounds[1] !== query.end) setQuery(null)
    }
    document.addEventListener('selectionchange', moved)
    return () => document.removeEventListener('selectionchange', moved)
  }, [query])
  const [selected, setSelected] = useState(0)
  const [hover, setHover] = useState<{ asset: Asset; top: number; left: number } | null>(null)
  const candidates = assets.filter(a => !query?.text || `${a.name}\n${a.alias ?? ''}`.toLowerCase().includes(query.text.toLowerCase()))
    .sort((a, b) => Number(assetIds.includes(b.id)) - Number(assetIds.includes(a.id)) || Number(a.kind === 'scene') - Number(b.kind === 'scene'))
  const paint = (text: string, caret?: number) => {
    const el = ref.current
    if (!el) return
    el.dataset.empty = String(!text)
    el.replaceChildren()
    for (const part of mentionParts(text, assets.map(a => a.name))) {
      if (!part.mention) el.append(document.createTextNode(part.text))
      else {
        const span = document.createElement('span')
        span.textContent = part.text
        const asset = assets.find(a => a.name === part.name)
        if (asset) {
          span.setAttribute('contenteditable', 'false'); span.dataset.assetId = asset.id
          span.className = `inline whitespace-nowrap rounded px-1 font-medium ${asset.kind === 'char' ? 'bg-brand/15 text-brand-light' : 'bg-violet-400/15 text-violet-200'}`
        } else {
          span.className = 'text-red-300 underline decoration-dashed underline-offset-4'
          span.title = '找不到这个角色或场景'
        }
        el.append(span)
      }
    }
    // A text node after a noneditable chip gives browsers a stable caret boundary.
    el.append(document.createTextNode(''))
    if (caret !== undefined) placeEditorCaret(el, caret)
  }
  useLayoutEffect(() => {
    if (composing.current) return
    const el = ref.current!
    if (current.current !== value || el.textContent !== value || !el.childNodes.length) {
      const cursor = document.activeElement === el ? editorSelection(el)?.[0] : undefined
      current.current = value; paint(value, cursor)
    } else paint(value, document.activeElement === el ? editorSelection(el)?.[0] : undefined)
  }, [value, assets])
  useLayoutEffect(() => {
    if (autoFocus && ref.current) { ref.current.focus(); placeEditorCaret(ref.current, value.length) }
  }, [])
  const updateQuery = (text: string, caret: number) => {
    const match = /[@＠]([^@＠\s]*)$/.exec(text.slice(0, caret))
    if (!match) { setQuery(null); return }
    const el = ref.current!, range = window.getSelection()?.getRangeAt(0)
    const rect = range?.getBoundingClientRect?.() ?? el.getBoundingClientRect()
    setSelected(0)
    setQuery({ start: caret - match[0].length, end: caret, text: match[1], top: rect.bottom + 6, left: rect.left })
  }
  const commit = (text: string, caret: number, suggest = false) => {
    text = text.replace(/＠/g, '@')
    current.current = text; paint(text, caret); onChange(text)
    if (suggest) updateQuery(text, caret); else setQuery(null)
  }
  const replace = (text: string, suggest = false) => {
    const [start, end] = editorSelection(ref.current!) ?? [current.current.length, current.current.length]
    commit(current.current.slice(0, start) + text + current.current.slice(end), start + text.length, suggest)
  }
  const choose = (asset: Asset) => {
    if (!query) return
    ref.current!.focus()
    commit(current.current.slice(0, query.start) + '@' + asset.name + current.current.slice(query.end), query.start + asset.name.length + 1)
  }
  const removeChip = (backwards: boolean) => {
    const bounds = editorSelection(ref.current!)
    if (!bounds || bounds[0] !== bounds[1]) return false
    const caret = bounds[0]
    const part = mentionParts(current.current, assets.map(a => a.name)).find(p => p.name && (backwards ? p.start + p.text.length === caret : p.start === caret))
    if (!part) return false
    commit(current.current.slice(0, part.start) + current.current.slice(part.start + part.text.length), part.start)
    return true
  }
  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) { e.stopPropagation(); return }
    if (query) {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation()
        if (e.key === 'Escape') setQuery(null)
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setSelected(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + Math.max(candidates.length, 1)) % Math.max(candidates.length, 1))
        else if (candidates[selected]) choose(candidates[selected])
        return
      }
    }
    if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') setQuery(null)
    if (e.key === 'Escape') { e.stopPropagation(); onEscape?.(); return }
    const [start, end] = editorSelection(ref.current!) ?? [0, 0]
    if (e.key === 'Enter') {
      e.preventDefault()
      if (onSplit) onSplit(start, end); else replace('\n')
    } else if (e.key === 'Backspace' && start === 0 && end === 0 && onMerge) {
      e.preventDefault(); onMerge(); setQuery(null)
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && removeChip(e.key === 'Backspace')) e.preventDefault()
  }
  return <>
    <div ref={el => { ref.current = el; register?.(el) }} contentEditable suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true"
      aria-placeholder={placeholder} data-placeholder={placeholder}
      className="relative min-h-[1.65em] w-full min-w-0 whitespace-pre-wrap break-words outline-none data-[empty=true]:before:pointer-events-none data-[empty=true]:before:absolute data-[empty=true]:before:text-white/30 data-[empty=true]:before:content-[attr(data-placeholder)]"
      onKeyDown={keyDown}
      onMouseUp={() => setQuery(null)}
      onBlur={() => { setQuery(null); setHover(null); onBlur?.() }}
      onCompositionStart={() => { composing.current = true; ref.current!.dataset.empty = 'false'; setQuery(null) }}
      onCompositionEnd={() => { composing.current = false; const el = ref.current!; const text = el.textContent ?? ''; commit(text, editorSelection(el)?.[0] ?? text.length, true) }}
      onInput={() => {
        if (composing.current) return
        const el = ref.current!, text = el.textContent ?? ''
        commit(text, editorSelection(el)?.[0] ?? text.length, true)
      }}
      onPaste={e => {
        if (composing.current) return
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
        if (onPasteLines && text.includes('\n')) { const [start, end] = editorSelection(ref.current!) ?? [0, 0]; onPasteLines(text.split('\n').map(beatText), start, end); setQuery(null) }
        else replace(onPasteLines ? beatText(text) : text, true)
      }}
      onMouseOver={e => {
        const target = e.target as HTMLElement, asset = assets.find(a => a.id === target.dataset.assetId)
        if (asset) { const r = target.getBoundingClientRect(); setHover({ asset, top: r.bottom + 5, left: r.left }) }
      }} onMouseOut={() => setHover(null)}
    />
    {query && createPortal(<div role="listbox" aria-label="角色和场景" className="floating-surface fixed z-[120] max-h-64 w-64 overflow-auto rounded-xl border p-1.5" style={{ top: Math.max(8, Math.min(query.top, window.innerHeight - 270 * getUiScale())), left: Math.max(8, Math.min(query.left, window.innerWidth - 264 * getUiScale())) }} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}>
      {candidates.length ? candidates.map((a, i) => <button key={a.id} type="button" role="option" aria-selected={i === selected}
        ref={el => { if (i === selected) el?.scrollIntoView?.({ block: 'nearest' }) }}
        className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-white/90 ${i === selected ? 'bg-white/10' : 'hover:bg-white/5'}`}
        onClick={e => { e.stopPropagation(); choose(a) }}>
        {a.imageUrl ? <img src={a.imageUrl} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-white/5 text-white/30">◇</span>}
        <span className="min-w-0 flex-1 truncate">{a.name}</span><span className="text-xs text-white/40">{a.kind === 'char' ? '角色' : '场景'}</span>
      </button>) : <div className="px-3 py-4 text-xs text-white/50">没有匹配的角色或场景</div>}
    </div>, document.body)}
    {hover && createPortal(<div role="tooltip" className="pointer-events-none fixed z-[130] w-40 rounded-lg border border-white/15 bg-[#202224] p-2 text-xs text-white" style={{ top: Math.min(hover.top, window.innerHeight - 205 * getUiScale()), left: Math.min(hover.left, window.innerWidth - 168 * getUiScale()) }}>
      {hover.asset.imageUrl ? <img src={hover.asset.imageUrl} alt={hover.asset.name} className="mb-2 h-32 w-full rounded object-cover" /> : <div className="py-5 text-center text-white/50">还没有参考图</div>}{hover.asset.kind === 'char' ? '角色' : '场景'} · {hover.asset.name}
    </div>, document.body)}
  </>
}

export default function ShotTextEditor({ value, timeline = false, duration = 15, assets, assetIds, label, onChange, onEscape, autoFocus = false }: {
  value: string; timeline?: boolean; duration?: number; assets: Asset[]; assetIds: string[]; label: string
  onChange: (value: string) => void; onEscape?: () => void; autoFocus?: boolean
}) {
  // Empty editing rows stay local, including a newly added beat.
  const initial = () => timeline ? normalizeBeats(timelineLines(value).length ? timelineLines(value) : [''], duration) : [{ start: 0, end: duration, text: value }]
  const [beats, setBeats] = useState(initial)
  const last = useRef(value)
  const [draft, setDraft] = useState<{ row: number; value: string } | null>(null)
  const pending = useRef<{ row: number; value: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const focus = useRef<{ row: number; offset: number } | null>(null)
  const clearDraft = () => {
    clearTimeout(timer.current)
    pending.current = null; setDraft(null)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useLayoutEffect(() => {
    if (value !== last.current) { clearDraft(); setBeats(initial()); last.current = value }
  }, [value, timeline, duration])
  useLayoutEffect(() => {
    if (!focus.current) return
    const { row, offset } = focus.current, el = refs.current[row]
    // Clear first: focus can synchronously blur the previous row.
    focus.current = null
    if (el) { el.focus(); placeEditorCaret(el, offset) }
  }, [beats])
  const publish = (next: Beat[]) => {
    last.current = timeline ? writeBeats(next) : next[0].text
    onChange(last.current)
  }
  const change = (next: Beat[], row?: number, offset = 0) => {
    clearDraft()
    if (row !== undefined) focus.current = { row, offset }
    setBeats(next); publish(next)
  }
  const settled = () => pending.current ? editBeat(beats, pending.current.row, pending.current.value) : beats
  const finish = () => {
    if (!pending.current) return
    const next = settled()
    clearDraft(); setBeats(next)
    // The normalized value was already handed to the parent's autosave queue.
  }
  return <div className="space-y-2" data-shot-editor={timeline ? 'timeline' : 'text'}>
    {beats.map((beat, i) => {
      const value = timeline ? (draft?.row === i ? draft.value : writeBeat(beat)) : beat.text
      const bodyOffset = (offset: number) => Math.max(0, offset - (value.length - editableBeatText(value).length))
      return <div key={i} className="group flex items-start gap-1.5">
      <MentionInput value={value} assets={assets} assetIds={assetIds} label={timeline ? `${label} 第 ${i + 1} 拍` : label} autoFocus={autoFocus && i === 0} register={el => { refs.current[i] = el }} onEscape={onEscape}
        placeholder={timeline ? '写这一拍发生了什么' : undefined}
        onBlur={timeline ? finish : undefined}
        onChange={v => {
          if (!timeline) { change([{ ...beat, text: v }]); return }
          const edit = { row: i, value: v }
          pending.current = edit; setDraft(edit)
          // Autosave/unmount always receives valid timing, never a partial number.
          // Keep raw text visible until blur or just before the 700ms autosave.
          publish(editBeat(beats, i, v))
          clearTimeout(timer.current)
          timer.current = setTimeout(finish, 650)
        }}
        onSplit={timeline ? (start, end) => {
          const source = settled(), text = source[i].text
          const next = splitBeat(source, i, [text.slice(0, bodyOffset(start)), text.slice(bodyOffset(end))])
          change(next, i + 1, beatPrefix(next[i + 1]).length)
        } : undefined}
        onMerge={timeline ? () => {
          if (i > 0) {
            const source = settled(), next = removeBeat(source, i, true)
            change(next, i - 1, beatPrefix(next[i - 1]).length + source[i - 1].text.length)
          }
        } : undefined}
        onPasteLines={timeline ? (pasted, start, end) => {
          const source = settled(), text = source[i].text
          const inserted = pasted.map(beatText); inserted[0] = text.slice(0, bodyOffset(start)) + inserted[0]
          const offset = inserted[inserted.length - 1].length
          inserted[inserted.length - 1] += text.slice(bodyOffset(end))
          const next = splitBeat(source, i, inserted), row = i + inserted.length - 1
          change(next, row, beatPrefix(next[row]).length + offset)
        } : undefined}
      />
      {timeline && beats.length > 1 && <button type="button" aria-label={`删除第 ${i + 1} 拍`} className="shrink-0 text-white/30 opacity-0 hover:text-white focus:opacity-100 group-hover:opacity-100" onClick={() => change(removeBeat(settled(), i), Math.max(0, i - 1))}><X size="0.75rem" /></button>}
    </div>})}
  </div>
}
