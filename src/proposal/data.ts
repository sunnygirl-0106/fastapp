import type { Asset, Project, Shot, VideoVersion } from '@/types'
import { DEFAULT_BALANCE, SAMPLE_SCRIPT, sampleAssets, sampleSegments, sampleShots } from '@/data/mock'
import { mockImage } from '@/services/generation'

/* ================================================================
   方案页样本数据。全部由 src/data/mock.ts 派生，纯内存，
   不接 zustand store，也不写 localStorage，不影响真实工作流。
   ================================================================ */

/* ---------- 方案页新增的概念（落地时需要进 src/types.ts） ---------- */

/** 一次生成尝试。失败的尝试要被看见，但不占版本号。 */
export interface GenAttempt {
  at: number
  reason: string
  /** 本次是否已经扣费：false → 「本次未扣费」；true → 「已退回」 */
  charged: boolean
}

/** 生成某个版本时使用的参数，用于「镜头 01 · v1 生成信息」 */
export interface VersionMeta {
  model: string
  res: string
  ratio: string
  voice: boolean
  cost: number
  /** 生成该版本时的镜头「画面描述」快照 */
  shotSnapshot: string
}

const HOUR = 3600_000
const BASE = new Date(2026, 8, 16, 14, 30).getTime() // 固定时间，避免每次渲染跳动

export function makeProject(patch: Partial<Project> = {}): Project {
  return {
    id: 'p_demo',
    name: '最后的外卖',
    no: 1,
    createdAt: BASE,
    updatedAt: BASE,
    config: { segDur: 15, ratio: '9:16 竖屏', style: '写实', mode: '全自动 AI 生成' },
    balance: DEFAULT_BALANCE,
    script: SAMPLE_SCRIPT,
    segStatus: 'done',
    assetStatus: 'done',
    shotStatus: 'done',
    segments: sampleSegments(),
    assets: sampleAssets(),
    shots: sampleShots(),
    ...patch,
  }
}

/** 把镜头标记为「已生成 n 个视频版本」 */
export function withVersions(s: Shot, n: number, preferredIdx = n - 1): Shot {
  const versions: VideoVersion[] = Array.from({ length: n }, (_, i) => ({
    tag: `v${i + 1}`,
    preferred: i === preferredIdx,
    url: mockImage(`镜头#${s.no}`, s.id, i),
    dur: 15,
    createdAt: BASE + (i + 1) * HOUR,
  }))
  return { ...s, video: { state: 'done', versions, stale: false } }
}

/** 版本参数快照：v1 用 720p，v2 之后升到 1080p，体现「每版参数可能不同」 */
export function versionMeta(v: VideoVersion, shot: Shot): VersionMeta {
  const idx = Number(v.tag.replace('v', '')) || 1
  return {
    model: idx >= 2 ? 'Seedance 2.0' : 'Seedance 1.5',
    res: idx >= 2 ? '1080p' : '720p',
    ratio: '9:16',
    voice: true,
    cost: 2363,
    shotSnapshot:
      idx >= 2
        ? shot.shot
        : shot.shot.replace('缓慢推向', '快速推向').replace('快速跟摇', '缓慢跟摇'),
  }
}

/* ---------- S1：项目列表各状态样本 ----------
   按工作流顺序列全 projectStatus() 现有的 10 个状态，
   再插入 修复.docx 要求新增的 2 个「部分生成」。 */

export interface StatusSample {
  stage: string
  name: string
  /** 现状 projectStatus() 的输出 */
  before: string
  /** 修复.docx 要求的展示 */
  after: string
  /** 改后是否属于「进行中」（卡片亮琥珀呼吸点） */
  running: boolean
  /** 改前是否属于「进行中」；不传＝与 running 一致 */
  runningBefore?: boolean
  done: boolean
  cover?: string
  isNew?: boolean
  /** 现状为什么不对（仅新增状态需要说明） */
  why?: string
}

export const STATUS_SAMPLES: StatusSample[] = [
  { stage: '剧本', name: '路过你的全世界', before: '待添加剧本', after: '待添加剧本', running: false, done: false },
  { stage: '剧本', name: '深夜便利店', before: '待拆解剧本', after: '待拆解剧本', running: false, done: false },
  { stage: '拆解', name: '雨天的信', before: '正在拆解剧本', after: '正在拆解剧本', running: true, done: false },
  {
    stage: '拆解',
    name: '星际穿越',
    before: '待提取角色与场景',
    after: '待提取角色与场景',
    running: false,
    done: false,
  },
  {
    stage: '角色与场景',
    name: '荒野来客',
    before: '正在提取角色与场景',
    after: '正在提取角色与场景',
    running: true,
    done: false,
  },
  {
    stage: '角色与场景',
    name: '雾港旧事',
    before: '待生成镜头',
    after: '正在生成参考图',
    // 改前 isRunning() 不查 imgState → 生成中卡片完全静止，连呼吸点都不亮
    running: true,
    runningBefore: false,
    done: false,
    cover: mockImage('c', 'cover-h'),
    isNew: true,
    why: '参考图正在生成，卡片却毫无动静——连「进行中」的呼吸点都不亮',
  },
  {
    stage: '角色与场景',
    name: '长夏未晚',
    before: '待生成镜头',
    after: '参考图部分生成 · 2/3',
    running: false,
    done: false,
    cover: mockImage('c', 'cover-i'),
    isNew: true,
    why: '3 个角色场景里只补了 2 张参考图，看不出还差一张',
  },
  {
    stage: '角色与场景',
    name: '小马宝莉',
    before: '待生成镜头',
    after: '待生成镜头',
    running: false,
    done: false,
    cover: mockImage('c', 'cover-a'),
  },
  {
    stage: '镜头',
    name: '山海之间',
    before: '正在生成镜头',
    after: '正在生成镜头',
    running: true,
    done: false,
    cover: mockImage('c', 'cover-g'),
  },
  {
    stage: '镜头',
    name: '这个杀手不太冷',
    before: '待生成视频',
    after: '镜头部分生成 · 3/10',
    running: false,
    done: false,
    cover: mockImage('c', 'cover-b'),
    isNew: true,
    why: '10 段里只生成了 3 段镜头，现状却已经在催「去生成视频」',
  },
  {
    stage: '镜头',
    name: '最后的外卖',
    before: '待生成视频',
    after: '待生成视频',
    running: false,
    done: false,
    cover: mockImage('c', 'cover-c'),
  },
  {
    stage: '视频',
    name: '夏日终曲',
    before: '待生成视频',
    after: '视频部分生成 · 3/10',
    running: false,
    done: false,
    cover: mockImage('c', 'cover-d'),
    isNew: true,
    why: '已经有 3 段视频了，现状仍显示「待生成视频」，看不出做过一半',
  },
  {
    stage: '视频',
    name: '午夜航班',
    before: '正在生成视频',
    after: '正在生成视频',
    running: true,
    done: false,
    cover: mockImage('c', 'cover-e'),
  },
  {
    stage: '完成',
    name: '城市边缘',
    before: '已完成',
    after: '已完成',
    running: false,
    done: true,
    cover: mockImage('c', 'cover-f'),
  },
]

/* ---------- S5：参数默认值（修复.docx 表格） ---------- */

export const VIDEO_DEFAULTS = {
  model: 'Seedance 2.0',
  res: '720p',
  ratio: '9:16',
  voice: true,
} as const

export const IMAGE_DEFAULTS = {
  model: 'Phan Image 2',
  ratio: '1:1',
  res: '1K',
} as const

export const RES_OPTIONS = ['480p', '720p', '1080p']
export const RATIO_OPTIONS = ['9:16', '16:9', '1:1', '4:3', '3:4']
export const IMG_RATIO_OPTIONS = ['1:1', '9:16', '16:9', '4:3', '3:4']
