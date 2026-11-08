import { normalizeBeats, writeBeat } from '@/utils/timeline'
import type { Asset, Project, Shot, VideoReferenceImage } from '@/types'
import { timelineLines } from './parse'
import { getPromptBook } from './prompts'
import { SHOT_TEXT_FIELDS } from './validation'
export const fmtSeconds = (value: number) => String(Number(value.toFixed(6)))
export function timeAxis(beats: string[], dur: number): [number, number, string][] {
  return normalizeBeats(beats, dur).map(b => [b.start, b.end, b.text])
}
export function paceHint(dur: number, beats: string[]) {
  const per = dur / Math.max(beats.length, 1)
  return per >= 6 ? '节奏舒缓，动作之间保留停顿和情绪留白，不要用多余的动作填满时间，' : per <= 2.5 ? '节奏紧凑，动作干脆连贯，不做多余停顿，' : '节奏自然流畅，'
}
export function replaceMentions(text: string, mapping: Record<string, string>) {
  const names = Object.keys(mapping).sort((a, b) => b.length - a.length)
  if (!names.length) return text
  return text.replace(new RegExp('@(' + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g'), (_, name) => mapping[name])
}
export function videoReferenceImages(shot: Shot, project: Project): VideoReferenceImage[] {
  return [...new Set(shot.assetIds ?? [])].flatMap(id => {
    const a = project.assets.find(asset => asset.id === id)
    return a?.imageUrl ? [{ assetId: a.id, name: a.name, kind: a.kind, imageUrl: a.imageUrl }] : []
  }).map((ref, i) => ({ ...ref, label: `@图片${i + 1}` }))
}
export function buildReferenceImagePrompt(asset: Asset, project?: Project): string {
  const desc = asset.prompt.trim().replace(/[。，,.；;]+$/, '')
  const style = project?.style?.trim() || '写实电影风格'
  return getPromptBook().templates[asset.kind === 'char' ? 'A' : 'B']
    .split('{prompt}').join(desc).split('{name}').join(asset.name)
    .split('\n').filter(line => style || !line.includes('{风格参考}')).map(line => line.split('{风格参考}').join(style)).join('\n')
}
export function buildVideoPrompt(shot: Shot, project: Project, dur: number): string {
  const refs = videoReferenceImages(shot, project)
  const mapping = Object.fromEntries(project.assets.map(a => [a.name, refs.find(r => r.assetId === a.id)?.label ?? a.name]))
  const replace = (text: string) => replaceMentions(text, mapping).replace(/@(?!图片\d+)/g, '')
  const beats = timelineLines(shot.timeline).map(replace)
  let axis = normalizeBeats(beats, dur).map(b => writeBeat({ ...b, text: b.text.replace(/[。；;]+$/, '') })).join('；')
  if (axis && !/[。！？”」]$/.test(axis)) axis += '。'
  const values: Record<string, string | number> = { ...Object.fromEntries(SHOT_TEXT_FIELDS.map(k => [k, replace(shot[k].trim())])), dur, '画幅': project.config.ratio, '时间轴': axis, '节奏提示': paceHint(dur, beats) }
  return getPromptBook().templates.C.split('\n').flatMap(line => {
    if (line.startsWith('风格：')) return [line.replace(/\{风格参考[^{}]*\}/g, () => project.style?.trim().replace(/。+$/, '') || '写实电影风格')]
    if (line.startsWith('参考图：')) {
      const samples = line.match(/@图片\d+[^，…\n]*\{name\}[^，…\n]*/g)
      if (samples?.length !== 2) throw new Error('模板 C 的参考图行需要角色、场景两个示例')
      return refs.length ? ['参考图：' + refs.map(r => samples[r.kind === 'char' ? 0 : 1].replace(/@图片\d+/, r.label).replace('{name}', () => r.name)).join('，') + '。'] : []
    }
    const keys = [...line.matchAll(/\{([^{}]+)\}/g)].map(m => m[1])
    if (keys.some(k => values[k] === undefined || values[k] === '')) return []
    return [line.replace(/\{([^{}]+)\}/g, (_, k) => String(values[k]))]
  }).join('\n')
}
