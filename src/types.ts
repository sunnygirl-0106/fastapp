// 全流程数据模型 —— 字段以截图为准

export type ImgState = 'none' | 'generating' | 'done'
export type GenStatus = 'none' | 'generating' | 'done'
export type Importance = 'major' | 'minor'

export interface ProjectConfig {
  ratio: string // 9:16 竖屏
  style: string // 写实
  mode: string // 全自动 AI 生成
}

export interface Segment {
  id: string
  no: number
  title: string
  dur: string // '15s'
  text: string // 原文
  scene?: string // 场景（截图里多为占位 —）
  roles?: string // 出场角色
  action?: string // 核心动作
  timeline?: string // 时间线
}

export interface Asset {
  id: string
  kind: 'char' | 'scene'
  name: string
  importance: Importance
  alias?: string
  desc: string // 描述 / 设定（给人看）
  prompt: string // 图像提示词（发给 AI）
  imgState: ImgState
  imageUrl?: string // mock：一段 css 渐变或占位标识
  // 场景专用（见「编辑描述(花园菜地)」截图）
  belongSegs?: number[]
  roles?: string[]
}

export interface VideoVersion {
  tag: string // v1
  preferred: boolean
  url?: string
}

export interface ShotVideo {
  state: GenStatus
  versions: VideoVersion[]
}

export interface Shot {
  id: string
  no: number
  shot: string // 镜头
  timeline: string // 时间线（每行一条）
  action: string // 核心动作
  anchor: string // 空间锚点
  motion: string // 运动规则
  blocking: string // 走位
  continuity: string // 连续性锁
  subject: string // 绝对主体
  forbid: string // 禁止变更
  background: string // 背景边界
  done?: boolean // 分镜是否已完成
  video: ShotVideo
}

export interface Project {
  id: string
  name: string
  no: number
  createdAt: number
  updatedAt: number
  config: ProjectConfig
  balance: number // 星钻余额（全局共享，这里挂项目上便于扣减演示）
  script: string
  segStatus: GenStatus
  assetStatus: GenStatus
  shotStatus: GenStatus
  segments: Segment[]
  assets: Asset[]
  shots: Shot[]
}

// 分镜字段的中文标签与分组（编辑抽屉/快照复用）
export const SHOT_FIELDS: { key: keyof Shot; label: string }[] = [
  { key: 'shot', label: '镜头' },
  { key: 'timeline', label: '时间线' },
  { key: 'action', label: '核心动作' },
  { key: 'anchor', label: '空间锚点' },
  { key: 'motion', label: '运动规则' },
  { key: 'blocking', label: '走位' },
  { key: 'continuity', label: '连续性锁' },
  { key: 'subject', label: '绝对主体' },
  { key: 'forbid', label: '禁止变更' },
  { key: 'background', label: '背景边界' },
]

export const SHOT_GROUPS: { title: string; fields: (keyof Shot)[] }[] = [
  { title: '镜头与节奏', fields: ['shot', 'timeline', 'action'] },
  { title: '空间与运动', fields: ['anchor', 'motion', 'blocking'] },
  { title: '一致性约束', fields: ['continuity', 'subject', 'forbid', 'background'] },
]
