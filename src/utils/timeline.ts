import { clampDuration } from '@/data/duration'

// Shared by model parsing, migration, editing and video snapshots. No model calls.
export const BEAT_NUMBER = /^\s*(?:[①-⑳]|\d+\s*(?:[.．](?!\d)|[、)）])|[（(]\d+[)）])\s*/
const TIME_PREFIX = /^\s*(\d+(?:\.\d+)?)\s*(?:秒\s*)?[-–—~～到至]\s*(\d+(?:\.\d+)?)\s*秒\s*[：:]?/
export type Beat = { start: number; end: number; text: string }
export const timelineLines = (value: string) => value.split('\n').map(l => l.replace(BEAT_NUMBER, '').trim()).filter(Boolean)
function parseBeat(line: string, preserveText: boolean): Beat | null {
  const clean = line.replace(BEAT_NUMBER, ''), match = TIME_PREFIX.exec(clean)
  const text = match ? clean.slice(match[0].length) : ''
  return match ? { start: Number(match[1]), end: Number(match[2]), text: preserveText ? text : text.trim() } : null
}
export const readBeat = (line: string): Beat | null => parseBeat(line, false)
export const beatText = (line: string) => readBeat(line)?.text ?? line.replace(BEAT_NUMBER, '').trim()
export const writeBeat = (beat: Beat) => `${beat.start}-${beat.end}秒：${beat.text}`
export const writeBeats = (beats: Beat[]) => beats.map(writeBeat).join('\n')
export const beatPrefix = (beat: Beat) => writeBeat({ ...beat, text: '' })
// Recover a damaged numeric/range prefix, but don't eat ordinary prose such as
// “停顿几秒：然后转身” when the user has deleted the time completely.
export const editableBeatText = (value: string) => parseBeat(value, true)?.text ?? value.replace(/^\s*(?:\d[^：:\n]*|[^：:\n]*[-–—~～到至][^：:\n]*)秒\s*[：:]/, '')

// A row edit owns its changed boundaries; never redistribute the whole timeline.
// Invalid timing is rejected as a unit, while body/mention edits are retained.
export function editBeat(beats: Beat[], index: number, value: string): Beat[] {
  const parsed = readBeat(value)
  const text = editableBeatText(value)
  const fallback = beats.map((b, i) => ({ ...b, text: i === index ? text : b.text }))
  if (!parsed || !Number.isFinite(parsed.start) || !Number.isFinite(parsed.end)) return fallback
  const next = fallback.map(b => ({ ...b })), beat = next[index]
  beat.start = index === 0 ? 0 : Math.round(parsed.start)
  beat.end = index === next.length - 1 ? clampDuration(parsed.end) : Math.round(parsed.end)
  if (index > 0) next[index - 1].end = beat.start
  if (index < next.length - 1) next[index + 1].start = beat.end
  // Existing very dense legacy rows are retained; an edit cannot create a new
  // subsecond row or change an already dense boundary into another invalid one.
  if (next.some((b, i) => b.end - b.start < 1 && (i === index || b.start !== beats[i].start || b.end !== beats[i].end))) return fallback
  return next
}
// Impossible dense timelines retain every row with zero-length slots; all bounds
// remain integers, monotonic, and end at dur. Normal timelines keep >= 1 second.
function boundedBeats(texts: string[], candidates: number[], dur: number): Beat[] {
  const min = texts.length <= dur ? 1 : 0, bounds = [0]
  texts.slice(0, -1).forEach((_, i) => bounds.push(Math.min(dur - min * (texts.length - i - 1), Math.max(bounds[i] + min, Math.round(candidates[i])))))
  bounds.push(dur)
  return texts.map((text, i) => ({ start: bounds[i], end: bounds[i + 1], text }))
}
export function normalizeBeats(lines: string[], duration: number, oldDuration?: number): Beat[] {
  if (!lines.length) return []
  const dur = Math.max(1, Math.round(duration)), parsed = lines.map(readBeat), texts = lines.map(beatText)
  if (parsed.every((b): b is Beat => b !== null) && (oldDuration ?? parsed[parsed.length - 1]!.end) > 0) {
    const scale = dur / (oldDuration ?? parsed[parsed.length - 1]!.end)
    return boundedBeats(texts, parsed.slice(0, -1).map(b => b.end * scale), dur)
  }
  const weights = texts.map(text => {
    const quotes = [...text.matchAll(/“([^”]*)”|"([^"\n]*)"|「([^」]*)」|『([^』]*)』/g)]
    return quotes.length ? quotes.reduce((n, m) => n + [...(m[1] ?? m[2] ?? m[3] ?? m[4]).replace(/\s/g, '')].length, 0) / 4 + 1 : 2
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let sum = 0
  return boundedBeats(texts, weights.map(w => (sum += w) * dur / total), dur)
}
export const normalizeTimeline = (value: string, dur: number, oldDur?: number) => writeBeats(normalizeBeats(timelineLines(value), dur, oldDur))
export function changeBeatEnd(beats: Beat[], index: number, end: number): Beat[] {
  const next = beats.map(b => ({ ...b })), beat = next[index]
  if (!beat || !Number.isFinite(end)) return next
  const last = index === next.length - 1
  const gap = last || next[index + 1].end - beat.start >= 2 ? 1 : 0
  const low = last ? Math.max(4, beat.start + 1) : beat.start + gap
  const high = last ? 30 : next[index + 1].end - gap
  beat.end = Math.max(Math.min(low, high), Math.min(high, Math.round(end)))
  if (next[index + 1]) next[index + 1].start = beat.end
  return next
}
export function splitBeat(beats: Beat[], index: number, texts: string[]): Beat[] {
  const beat = beats[index], span = beat.end - beat.start
  return [...beats.slice(0, index), ...texts.map((text, i) => ({ text, start: beat.start + Math.round(span * i / texts.length), end: beat.start + Math.round(span * (i + 1) / texts.length) })), ...beats.slice(index + 1)]
}
export function removeBeat(beats: Beat[], index: number, mergeText = false): Beat[] {
  if (beats.length <= 1) return [{ ...beats[0], text: '' }]
  const next = beats.map(b => ({ ...b })), removed = next[index]
  if (index > 0) { next[index - 1].end = removed.end; if (mergeText) next[index - 1].text += removed.text }
  else next[1].start = removed.start
  next.splice(index, 1)
  return next
}

export function saveTimeline(value: string, dur: number): string {
  let beats = normalizeBeats(timelineLines(value), dur)
  if (!beats.some(b => b.text.trim())) return ''
  for (let i = beats.length - 1; i >= 0; i--) if (!beats[i].text.trim()) beats = removeBeat(beats, i)
  return writeBeats(beats)
}
