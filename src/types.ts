// 全流程数据模型 —— 字段以截图为准

export type ImgState = 'none' | 'generating' | 'done'
export type GenStatus = 'none' | 'generating' | 'done'
export type Importance = 'major' | 'minor'

export interface ProjectConfig {
  ratio: string // 9:16 竖屏
  style: string // 写实
  mode: string // 全自动 AI 生成
  durMode: 'auto' | 'manual'
  targetDur?: number
  shotStyle?: string
}

export interface Segment {
  id: string
  no: number
  title: string
  dur?: number // 段落时长（秒），拆解完成后必有值；镜头按它设计
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
  prompt: string // 图像提示词（发给 AI）
  imgState: ImgState
  imageUrl?: string // mock：一段 css 渐变或占位标识
  // 场景专用（见「编辑描述(花园菜地)」截图）
  belongSegs?: number[]
  roles?: string[]
}

export interface VideoReferenceImage {
  assetId: string
  name: string
  kind: Asset['kind']
  imageUrl: string
  label: string // @图片1
}

export interface VideoVersion {
  model?: string // 生成时的视频模型；历史版本可能没有
  resolution?: string // 生成参数快照；历史版本不回填当前设置
  ratio?: string
  audio?: boolean
  cost?: number // 生成时的花费
  videoPrompt?: string // 生成时的提示词快照；历史版本可能没有
  referenceImages?: VideoReferenceImage[] // 生成时的参考图快照
  tag: string // v1
  preferred: boolean // 当前版本
  url?: string
  dur: number // 生成时的镜头时长
  createdAt: number // 生成时间：成片页按此倒序，最新生成的排最前
}

export interface ShotVideo {
  // Read-only proposal fixtures may carry legacy metadata; runtime migration removes it.
  [legacyField: string]: unknown
  state: GenStatus
  versions: VideoVersion[]
}

// A: segText / asset affect shot design; B: video affects only the finished video.
export type OutdatedKind = 'segText' | 'asset' | 'video'
export interface OutdatedReason {
  kind: OutdatedKind
  key?: string
  text: string
}

export interface Shot {
  assetIds?: string[] // 加载旧数据时补齐；兼容只读方案页样本
  segId: string
  dur: number
  outdated?: OutdatedReason[]
  id: string
  no: number
  shot: string // 画面描述
  timeline: string // 时间安排（按顺序编号，每行一拍）
  action: string // 主要动作
  anchor: string // 场景位置
  motion: string // 动作说明
  blocking: string // 走位说明
  continuity: string // 连贯要求
  subject: string // 画面主角
  forbid: string // 保持不变
  background: string // 背景范围
  done?: boolean // 分镜是否已完成
  video: ShotVideo
}

export interface Project {
  lastVideoModel?: string // 本项目上次确认的视频模型
  id: string
  name: string
  no: number
  createdAt: number
  updatedAt: number
  // 只为未迁移的只读方案页样本保留旧结构；工作流加载时统一迁移。
  config: ProjectConfig | { segDur: number; ratio: string; style: string; mode: string; durMode?: never; targetDur?: never; shotStyle?: never }
  /** @deprecated No longer used; cleared on migration. */
  assetsHint?: boolean
  balance: number // 星钻余额（全局共享，这里挂项目上便于扣减演示）
  script: string
  scriptPreface?: string
  segStatus: GenStatus
  assetStatus: GenStatus
  shotStatus: GenStatus
  segments: Segment[]
  assets: Asset[]
  shots: Shot[]
}

// 分镜字段的中文标签与分组（编辑抽屉/快照复用）
export const SHOT_FIELDS: { key: keyof Shot; label: string }[] = [
  { key: 'shot', label: '画面描述' },
  { key: 'timeline', label: '时间安排' },
  { key: 'action', label: '主要动作' },
  { key: 'anchor', label: '场景位置' },
  { key: 'motion', label: '动作说明' },
  { key: 'blocking', label: '走位说明' },
  { key: 'continuity', label: '连贯要求' },
  { key: 'subject', label: '画面主角' },
  { key: 'forbid', label: '保持不变' },
  { key: 'background', label: '背景范围' },
]

export const SHOT_GROUPS: { title: string; fields: (keyof Shot)[] }[] = [
  { title: '画面与节奏', fields: ['shot', 'timeline', 'action'] },
  { title: '人物与空间', fields: ['subject', 'anchor', 'motion', 'blocking'] },
  { title: '更多设定', fields: ['continuity', 'forbid', 'background'] },
]
