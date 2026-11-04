import doc from '../../../测试提示词效果/全自动工作流提示词.md?raw'
import type { Project, Segment, Shot } from '@/types'
import { encodeShot } from './parse'
import { cleanScript } from './validation'

// Parse at use time: malformed editable documents must reach the workflow's error toast.
export class PromptBook {
  systems: Record<number, string> = {}
  users: Record<number, string> = {}
  templates: Record<string, string> = {}
  constructor(source = doc) {
    const section = (start: RegExp, end: RegExp) => {
      const match = start.exec(source)
      if (!match) throw new Error(`提示词文档缺少章节：${start.source}`)
      const tail = source.slice(match.index + match[0].length)
      const stop = end.exec(tail)
      return stop ? tail.slice(0, stop.index) : tail
    }
    const blocks = (text: string) => [...text.matchAll(/^```[^\n]*\n([\s\S]*?)^```\s*$/gm)].map(m => m[1].replace(/\n$/, ''))
    try {
      ;['SEGMENT', 'ASSET', 'SHOT'].forEach((name, i) => {
        const matches = [...source.matchAll(new RegExp('_' + name + '_JSONL_SYSTEM_PROMPT\\s*=\\s*"""([\\s\\S]*?)"""', 'g'))]
        if (matches.length !== 1) throw new Error(`提示词文档必须有一个 ${name} 系统提示词`)
        this.systems[i + 1] = matches[0][1]
        const user = blocks(section(new RegExp('^## ' + '一二三'[i] + '、.*$', 'm'), /^## /m))[0]
        if (!user) throw new Error(`提示词文档第 ${i + 1} 节缺少用户消息代码块`)
        this.users[i + 1] = user
      })
      for (const letter of 'ABC') {
        const found = blocks(section(new RegExp('^### ' + letter + '\\. .*$', 'm'), /^### |^## |^---/m))
        if (found.length !== 1) throw new Error(`拼接模板 ${letter} 必须有一个代码块`)
        this.templates[letter] = found[0]
      }
    } catch (error) { console.error(String(error)); throw error }
  }
}
export const getPromptBook = () => new PromptBook()
// These compatibility exports are read from the document, never copied literals.
export const _SEGMENT_JSONL_SYSTEM_PROMPT = doc.match(/_SEGMENT_JSONL_SYSTEM_PROMPT\s*=\s*"""([\s\S]*?)"""/)?.[1] ?? ''
export const _ASSET_JSONL_SYSTEM_PROMPT = doc.match(/_ASSET_JSONL_SYSTEM_PROMPT\s*=\s*"""([\s\S]*?)"""/)?.[1] ?? ''
export const _SHOT_JSONL_SYSTEM_PROMPT = doc.match(/_SHOT_JSONL_SYSTEM_PROMPT\s*=\s*"""([\s\S]*?)"""/)?.[1] ?? ''

export function buildSegmentUserMessage(project: Project): string {
  return getPromptBook().users[1].replace('{auto | manual}', project.config.durMode ?? 'auto')
    .replace('{manual 时为目标成片时长，整数秒；auto 时为空}', project.config.durMode === 'manual' ? String(project.config.targetDur ?? 60) : '')
    .replace('{剧本全文}', () => cleanScript(project.script))
}
export function buildAssetUserMessage(segments: Segment[], preface = '', style = ''): string {
  return getPromptBook().users[2].split('\n').flatMap(line => {
    if (line.includes('{段落 1 原文}')) return segments.map(s => line.replace('[1]', `[${s.no}]`).replace('{段落 1 原文}', () => s.text))
    if (line.includes('{段落 2 原文}') || line.trim() === '……') return []
    return [line.replace('{剧本设定}', () => preface.trim()).replace('{用户填写的内容，可以为空}', () => style.trim())]
  }).join('\n')
}
export function buildShotUserMessage(project: Project, ordinals: number[], existing: Shot[] = []): string {
  const adjacent = project.shots.filter(s => {
    const no = project.segments.find(seg => seg.id === s.segId)?.no
    return no !== undefined && !ordinals.includes(no) && ordinals.some(n => Math.abs(n - no) === 1)
  })
  let current: Shot[] = []
  return getPromptBook().users[3].split('\n').flatMap(line => {
    if (line.startsWith('相邻段落的已有镜头') || line.startsWith('已有镜头')) {
      current = line.startsWith('相邻') ? adjacent : existing
      return current.length ? [line] : []
    }
    if (line.includes('{各字段当前内容}')) return current.map(s => {
      const no = project.segments.find(seg => seg.id === s.segId)!.no
      const { type: _type, ...data } = encodeShot(s, no)
      return line.replace(/^\[\d+\]/, `[${no}]`).replace('{各字段当前内容}', () => JSON.stringify(data))
    })
    if (line.includes('{标题}')) return project.segments.map(s => line.replace('[1]', `[${s.no}]`).replace('{标题}', () => s.title).replace('{时长}', String(s.dur)).replace('{原文}', () => s.text))
    if (line.includes('{asset_id}')) return project.assets.map(a => {
      const values: Record<string, string> = { asset_id: a.id, '角色 / 场景': a.kind === 'char' ? '角色' : '场景', name: a.name, alias: a.alias ?? '', description: a.desc }
      return line.replace(/\{([^{}]+)\}/g, (_, k) => values[k])
    })
    if (line.trim() === '……') return []
    return [line.replace('{例如 2,3}', ordinals.join(',')).replace('{用户填写的内容，可以为空}', () => project.config.shotStyle ?? '')]
  }).join('\n')
}
