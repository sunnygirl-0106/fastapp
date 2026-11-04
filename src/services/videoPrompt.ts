import type { Project, Shot, VideoReferenceImage } from '@/types'
import { formatTimeline, timelineLines } from './parse'

export function videoReferenceImages(shot: Shot, project: Project): VideoReferenceImage[] {
  const refs = [...new Set(shot.assetIds ?? [])].flatMap((id) => {
    const a = project.assets.find((asset) => asset.id === id)
    return a?.imageUrl ? [{ assetId: a.id, name: a.name, kind: a.kind, imageUrl: a.imageUrl }] : []
  })
  return refs.map((ref, i) => ({ ...ref, label: `@图片${i + 1}` }))
}

export function buildVideoPrompt(shot: Shot, project: Project, dur: number): string {
  const refs = videoReferenceImages(shot, project)
  const fields: [string, string | undefined][] = [
    ['参考图', refs.map((a) => `${a.label} 为${a.kind === 'char' ? '角色' : '场景'}「${a.name}」`).join('，')],
    ['画面描述', shot.shot],
    ['画面节奏', formatTimeline(timelineLines(shot.timeline)).replace(/\n/g, ' ')],
    ['主要动作', shot.action], ['场景位置', shot.anchor], ['动作说明', shot.motion],
    ['走位说明', shot.blocking], ['画面主角', shot.subject], ['连贯要求', shot.continuity],
    ['保持不变', shot.forbid], ['背景范围', shot.background], ['风格', project.config.shotStyle],
  ]
  return [
    `本段总时长 ${dur} 秒。按下方画面节奏的顺序依次完成，节奏均匀分布在整段时长内，不跳过、不重复、不提前结束。`,
    ...fields.flatMap(([label, value]) => value?.trim() ? [`${label}：${value.trim()}`] : []),
    '人物一致性：画面中出现的人物，长相、发型、服装必须严格与对应的人物参考图一致，不得换脸、改发型、改服装或改变年龄感；空间结构以场景参考图为准。',
    '移动约束：人物的身体朝向、脚步方向必须和前进的目的地一致，禁止倒着走、逆向滑步；除非剧情要求，不要为了露脸让人物转向镜头。',
    '无字幕：画面中不得出现任何字幕、对白字卡、说明文字、水印和角标；对白只通过声音和口型表现。',
    '音频：生成有声视频。对白按画面节奏中的原句、在对应的拍点由对应的人物说出，口型与说话时机一致；同时生成与场景和动作相符的环境声和动作音效。',
  ].join('\n')
}
