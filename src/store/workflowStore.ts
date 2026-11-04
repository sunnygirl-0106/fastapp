import { create } from 'zustand'
import { SHOT_FIELDS, type Asset, type Project, type Shot, type Segment, type OutdatedReason } from '@/types'
import { COST, delay, mockImage, uid, videoCost } from '@/services/generation'
import { DEFAULT_BALANCE, sampleAssets, sampleSegments, sampleShots, SAMPLE_SCRIPT } from '@/data/mock'

import { buildBeats, preferredVersion, no2, shotsReferencingAsset, shotGenerationBlocked, allocateSegmentDurations } from '@/utils/project'
import { clampDuration, clampTargetDuration, DUR_DEFAULT } from '@/data/duration'
import { buildAssetImagePrompt } from '@/data/assetTemplates'
import { parseSegments, parseAssets, parseShots, formatTimeline, timelineLines } from '@/services/parse'
import { mockSegments, mockAssets, mockShots } from '@/services/mockText'
import { buildVideoPrompt, videoReferenceImages } from '@/services/videoPrompt'

const LS_KEY = 'phanthy.projects.v2'

// Transient generation changes are isolated per project; sample segment IDs
// repeat across projects. Nothing in these maps is persisted.
const generatingSegIds = new Map<string, Set<string>>()
const generatingAssetIds = new Map<string, Map<string, string[]>>()
const pendingShotReasons = new Map<string, Map<string, OutdatedReason[]>>()
const pendingVideoStale = new Map<string, Map<string, string>>()
function mergeReason(reasons: OutdatedReason[], reason: OutdatedReason) {
  return [...reasons.filter((r) => r.kind !== reason.kind || (r.kind === 'asset' && r.key !== reason.key)), reason]
}
function queueShotReason(p: Project, segIds: string[], reason: OutdatedReason) {
  const pending = pendingShotReasons.get(p.id)
  segIds.forEach((id) => {
    if (generatingSegIds.get(p.id)?.has(id)) pending?.set(id, mergeReason(pending.get(id) ?? [], reason))
  })
}
function beginShots(p: Project, segIds: string[]) {
  const projectId = p.id
  const ordinals = p.segments.filter((seg) => segIds.includes(seg.id)).map((seg) => seg.no)
  const requested = parseShots(mockShots(p, ordinals).text, p, ordinals)
  generatingAssetIds.set(projectId, new Map(requested.map((shot) => [shot.segId, shot.assetIds ?? []])))
  generatingSegIds.set(projectId, new Set(segIds))
  pendingShotReasons.set(projectId, new Map())
}
function queueVideoReason(projectId: string, shotId: string, reason: string) {
  if (!pendingVideoStale.has(projectId)) pendingVideoStale.set(projectId, new Map())
  pendingVideoStale.get(projectId)!.set(shotId, reason)
}
function markAssetOutdated(p: Project, a: Asset, reason: OutdatedReason) {
  const refs = shotsReferencingAsset(p, a)
  markOutdated(p, refs.map((s) => s.id), reason)
  queueShotReason(p, [...(generatingAssetIds.get(p.id) ?? [])].filter(([, ids]) => ids.includes(a.id)).map(([segId]) => segId), reason)
  return refs.length
}

type Screen = 'projects' | 'workflow'

interface State {
  projects: Project[]
  currentId: string | null
  screen: Screen
  step: number // 1..5
  toast: string | null

  // 导航
  openProject: (id: string) => void
  back: () => void
  goStep: (n: number) => void
  showToast: (msg: string) => void

  // 项目
  createProject: (name: string) => void
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void

  // step1 故事
  setScript: (text: string) => void

  // step2 拆解
  addSegment: (title: string, text: string, dur: number) => void
  updateSegment: (id: string, patch: Partial<Pick<Segment, 'title' | 'text' | 'dur'>>, options?: { silent?: boolean }) => void
  dismissOutdated: (id: string) => void
  dismissAllOutdated: () => void
  renameAsset: (id: string, name: string, sync: boolean) => void
  updateSegmentTitle: (id: string, title: string) => void
  deleteSegment: (id: string) => void

  // step3 角色与场景
  addAsset: (kind: Asset['kind'], fields: Pick<Asset, 'name' | 'desc' | 'prompt'>) => void
  generateAssetImages: (ids: string[]) => Promise<void>
  clearAssetImage: (id: string) => void
  updateAsset: (id: string, patch: Partial<Asset>, options?: { silent?: boolean }) => void
  deleteAsset: (id: string) => void

  // step4 镜头
  generateShots: (segNos: number[]) => Promise<void>
  updateShot: (id: string, patch: Partial<Shot>) => void
  deleteShot: (id: string) => void
  regenerateShot: (id: string) => Promise<void>

  // step5 视频
  generateVideos: (shotIds: string[]) => Promise<void>
  dismissVideoStale: (shotId: string) => void

  // 确认即推进：先置 generating、再切页、最后跑生成
  startSegments: (durMode?: 'auto' | 'manual', targetDur?: number) => Promise<void> // Step1 → Step2
  restartSegments: (durMode: 'auto' | 'manual', targetDur?: number) => Promise<void>
  startAssets: () => Promise<void> // Step2 → Step3
  startShots: (segNos: number[], durations?: Record<string, number>, style?: string) => Promise<void> // Step3 → Step4
  startVideos: (shotIds: string[]) => Promise<void> // Step4 → Step5
}

function backfillVersionTime(projects: Project[]): Project[] {
  let t = 0
  projects.forEach((p) =>
    p.shots.forEach((s) =>
      s.video.versions.forEach((v) => {
        if (typeof v.createdAt !== 'number') v.createdAt = (t += 1)
      }),
    ),
  )
  return projects
}

export function migrateProjects(projects: Project[]): Project[] {
  projects.forEach((p) => {
    const { segDur: _legacy, ...config } = p.config as typeof p.config & { segDur?: number }
    p.config = { ...config, durMode: config.durMode ?? 'auto' }
    delete p.assetsHint
    p.segments.forEach((seg) => {
      if (typeof seg.dur === 'string') seg.dur = parseInt(seg.dur, 10) || DUR_DEFAULT
    })
    if (p.segStatus === 'done') {
      const missing = p.segments.filter((seg) => seg.dur === undefined)
      const durations = allocateSegmentDurations(p, missing)
      missing.forEach((seg) => { seg.dur = durations.get(seg.id)! })
    }
    p.shots.forEach((s) => {
      s.timeline = /\d+\s*[–—-]\s*\d+\s*秒/.test(s.timeline) ? buildBeats(s.timeline.split('\n')) : formatTimeline(timelineLines(s.timeline))
      s.segId ??= p.segments[s.no - 1]?.id ?? ''
      if (!Array.isArray(s.assetIds)) {
        const seg = p.segments.find((seg) => seg.id === s.segId)
        s.assetIds = p.assets.filter((a) => SHOT_FIELDS.some(({ key }) => String(s[key] ?? '').includes(a.name)) ||
          !!seg?.text.includes(a.name) || (a.kind === 'scene' && !!seg && !!a.belongSegs?.includes(seg.no))).map((a) => a.id)
      }
      s.dur ??= p.segments.find((seg) => seg.id === s.segId)?.dur ?? DUR_DEFAULT
      s.video.versions.forEach((v) => { v.dur ??= DUR_DEFAULT })
      const seg = p.segments.find((seg) => seg.id === s.segId)
      if (seg) {
        seg.dur ??= s.dur
        s.dur = seg.dur
      }
      // localStorage may still contain removed duration or direct-edit reasons.
      s.outdated = s.outdated?.filter((r) => !['segDur', 'shotEdit'].includes(r.kind))
      syncDurationVideoStale(s)
    })
  })
  return backfillVersionTime(projects)
}

function retainShotDescription(shot: Shot) {
  shot.outdated = []
}

function syncDurationVideoStale(shot: Shot, projectId?: string) {
  if (projectId && shot.video.state === 'generating') queueVideoReason(projectId, shot.id, `时长改为 ${shot.dur} 秒`)
  const version = preferredVersion(shot.video)
  if (version && version.dur !== shot.dur) {
    shot.video.stale = true
    shot.video.staleReason = `时长改为 ${shot.dur} 秒`
  }
}

function markOutdated(p: Project, ids: string[], reason: OutdatedReason) {
  p.shots.filter((s) => ids.includes(s.id)).forEach((s) => {
    s.outdated = mergeReason(s.outdated ?? [], reason)
    queueShotReason(p, [s.segId], reason)
  })
}
function markVideoStale(p: Project, ids: string[], reason: string) {
  p.shots.filter((s) => ids.includes(s.id)).forEach((s) => {
    if (s.video.state === 'generating') queueVideoReason(p.id, s.id, reason)
    if (s.video.versions.length) { s.video.stale = true; s.video.staleReason = reason }
  })
}
function assetLabel(a: Asset) { return `${a.kind === 'char' ? '角色' : '场景'}「${a.name}」` }
function sortShots(p: Project) {
  p.shots.sort((a, b) => p.segments.findIndex((s) => s.id === a.segId) - p.segments.findIndex((s) => s.id === b.segId))
  p.shots.forEach((s, i) => { s.no = i + 1 })
}

function load(): Project[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return migrateProjects(JSON.parse(raw) as Project[])
  } catch {
    /* ignore */
  }
  // 首次：内置「最后的外卖」示例项目（已完成到镜头，视频未生成）
  const seed: Project = {
    id: 'demo_lastfood',
    name: '最后的外卖',
    no: 11,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    config: { durMode: 'auto', ratio: '9:16 竖屏', style: '写实', mode: '全自动 AI 生成' },
    balance: DEFAULT_BALANCE,
    script: SAMPLE_SCRIPT,
    segStatus: 'done',
    assetStatus: 'done',
    shotStatus: 'done',
    segments: sampleSegments(),
    assets: sampleAssets().map((a) => ({ ...a, imgState: 'done', imageUrl: mockImage(a.name, a.id) })),
    shots: sampleShots(),
  }
  return migrateProjects([seed])
}

function persist(projects: Project[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(projects))
  } catch {
    /* ignore */
  }
}

export const useStore = create<State>((set, get) => {
  // 内部：修改当前项目并持久化
  const patchProject = (fn: (p: Project) => void, projectId = get().currentId) => {
    set((s) => {
      const projects = s.projects.map((p) => {
        if (p.id !== projectId) return p
        const copy: Project = JSON.parse(JSON.stringify(p))
        fn(copy)
        copy.updatedAt = Date.now()
        return copy
      })
      persist(projects)
      return { projects }
    })
  }

  let toastT: ReturnType<typeof setTimeout> | null = null

  /* ---------- 生成过程的「后半段」，供 generate* 与 start* 复用 ---------- */
  const finishSegments = async (projectId: string | null) => {
    await delay(1600)
    let count = 0
    patchProject((p) => {
      p.balance -= COST.segGen
      p.segments = parseSegments(mockSegments(p).text, p.config.durMode ?? 'auto', p.config.targetDur)
      count = p.segments.length
      p.segStatus = 'done'
    }, projectId)
    get().showToast(`已生成 ${count} 个剧本段落`)
  }

  const finishAssets = async (projectId: string | null) => {
    await delay(1600)
    patchProject((p) => {
      p.balance -= COST.assetExtract
      // 保留已生成的参考图（若同名资产已存在图片）
      const prev = new Map(p.assets.map((a) => [`${a.kind}:${a.name}`, a]))
      p.assets = parseAssets(mockAssets(p).text).map((a) => {
        const old = prev.get(`${a.kind}:${a.name}`)
        return old && old.imgState === 'done' ? { ...a, imgState: 'done', imageUrl: old.imageUrl } : a
      })
      p.assetStatus = 'done'
    }, projectId)
    get().showToast('已提取 2 个角色、1 个场景')
  }

  const finishShots = async (segIds: string[], projectId: string) => {
    await delay(1600)
    patchProject((p) => {
      const segs = p.segments.filter((s) => segIds.includes(s.id))
      p.balance -= COST.shotGenEach * segs.length
      const ordinals = segs.map((s) => s.no)
      const parsed = parseShots(mockShots(p, ordinals).text, p, ordinals)
      parsed.forEach((next) => {
        const seg = segs.find((s) => s.id === next.segId)!
        const old = p.shots.find((s) => s.segId === seg.id)
        next.outdated = pendingShotReasons.get(p.id)?.get(seg.id) ?? []
        if (old) p.shots[p.shots.indexOf(old)] = next
        else p.shots.push(next)
        markVideoStale(p, [next.id], '镜头已重新生成')
      })
      sortShots(p)
      p.shotStatus = 'done'
    }, projectId)
    generatingAssetIds.delete(projectId)
    generatingSegIds.delete(projectId)
    pendingShotReasons.delete(projectId)
    get().showToast(`已生成 ${segIds.length} 个镜头`)
  }

  const finishVideos = async (shotIds: string[], projectId: string | null) => {
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return
    const inputs = new Map(project.shots.filter((s) => shotIds.includes(s.id)).map((s) => [s.id, {
      dur: s.dur, videoPrompt: buildVideoPrompt(s, project, s.dur), referenceImages: videoReferenceImages(s, project),
    }]))
    for (let i = 0; i < shotIds.length; i++) {
      await delay(1200)
      const id = shotIds[i]
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (s) {
          s.video.state = 'done'
          const reason = pendingVideoStale.get(p.id)?.get(id)
          s.video.staleReason = reason
          s.video.stale = !!reason
          // 每次生成都追加一个新版本：已生成的视频是用户付费得来的资产，绝不覆盖
          const n = s.video.versions.length
          s.video.versions.forEach((v) => (v.preferred = false))
          s.video.versions.push({
            tag: `v${n + 1}`,
            preferred: true,
            url: mockImage(`镜头#${s.no}`, s.id, n),
            createdAt: Date.now(),
            ...inputs.get(id)!,
          })
          p.balance -= videoCost(inputs.get(id)!.dur)
        }
      }, projectId)
      if (projectId) pendingVideoStale.get(projectId)?.delete(id)
    }
    if (projectId && !pendingVideoStale.get(projectId)?.size) pendingVideoStale.delete(projectId)
    get().showToast('视频已全部生成')
  }

  return {
    projects: load(),
    currentId: null,
    screen: 'projects',
    step: 1,
    toast: null,

    openProject: (id) => set({ currentId: id, screen: 'workflow', step: 1 }),
    back: () => set({ screen: 'projects', currentId: null }),
    goStep: (n) => set({ step: n }),
    showToast: (msg) => {
      set({ toast: msg })
      if (toastT) clearTimeout(toastT)
      toastT = setTimeout(() => set({ toast: null }), 2200)
    },

    createProject: (name) => {
      const trimmed = name.trim()
      if (!trimmed) return // 由 UI 层禁用按钮兜底，这里再防一次
      const p: Project = {
        id: uid('proj'),
        name: trimmed,
        no: get().projects.length + 12,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config: { durMode: 'auto', ratio: '9:16 竖屏', style: '写实', mode: '全自动 AI 生成' },
        balance: DEFAULT_BALANCE,
        script: '',
        segStatus: 'none',
        assetStatus: 'none',
        shotStatus: 'none',
        segments: [],
        assets: [],
        shots: [],
      }
      const projects = [p, ...get().projects]
      persist(projects)
      set({ projects, currentId: p.id, screen: 'workflow', step: 1 })
    },

    renameProject: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
      )
      persist(projects)
      set({ projects })
    },

    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id)
      persist(projects)
      set({ projects })
    },

    setScript: (text) => patchProject((p) => { if (p.segStatus === 'none') p.script = text }),

    addSegment: (title, text, dur) => {
      patchProject((p) => {
        const no = p.segments.length + 1
        const seg: Segment = { id: uid('seg'), no, title: title.trim(), text: text.trim() }
        seg.dur = clampDuration(dur)
        p.segments.push(seg)
      })
      get().showToast('已新增剧本段落')
    },
    updateSegmentTitle: (id, title) => get().updateSegment(id, { title }),
    updateSegment: (id, patch, options) => {
      let message = ''
      patchProject((p) => {
        const seg = p.segments.find((s) => s.id === id)
        if (!seg) return
        const shot = p.shots.find((s) => s.segId === id)
        const textChanged = patch.text !== undefined && patch.text !== seg.text
        const dur = patch.dur === undefined ? seg.dur : clampDuration(patch.dur)
        const durChanged = dur !== seg.dur
        if (patch.title?.trim()) seg.title = patch.title.trim()
        if (textChanged) {
          seg.text = patch.text!
          if (!options?.silent) {
            const reason: OutdatedReason = { kind: 'segText', text: '段落原文已修改' }
            if (shot) markOutdated(p, [shot.id], reason)
            queueShotReason(p, [id], reason)
          }
        }
        seg.dur = dur
        if (durChanged && shot) {
          shot.dur = dur!
          syncDurationVideoStale(shot, p.id)
        }
        if (textChanged) message = !options?.silent && shot?.outdated?.length ? `已保存，镜头 ${no2(shot.no)} 需要更新` : '已保存'
      })
      if (message) get().showToast(message)
    },
    dismissOutdated: (id) => {
      patchProject((p) => {
        const shot = p.shots.find((s) => s.id === id)
        if (!shot) return
        retainShotDescription(shot)
      })
      get().showToast('已保留当前描述')
    },
    dismissAllOutdated: () => {
      let count = 0
      patchProject((p) => {
        p.shots.filter((s) => s.outdated?.length).forEach((s) => { retainShotDescription(s); count++ })
      })
      get().showToast(`已保留 ${count} 个镜头的当前描述`)
    },
    renameAsset: (id, name, sync) => {
      patchProject((p) => {
        const a = p.assets.find((a) => a.id === id)
        const next = name.trim()
        if (!a || !next || p.assets.some((x) => x.id !== id && x.kind === a.kind && x.name === next)) return
        const old = a.name
        a.name = next
        if (sync && old !== next) {
          const replace = (s: string) => s.split(old).join(next)
          p.segments.forEach((seg) => { seg.text = replace(seg.text) })
          const changedIds: string[] = []
          p.shots.forEach((shot) => {
            if (SHOT_FIELDS.some(({ key }) => String(shot[key] ?? '').includes(old))) changedIds.push(shot.id)
            SHOT_FIELDS.forEach(({ key }) => { Object.assign(shot, { [key]: replace(String(shot[key] ?? '')) }) })
          })
          markVideoStale(p, changedIds, '镜头描述已修改')
        }
      })
    },

    deleteSegment: (id) => {
      patchProject((p) => {
        const oldNos = new Map(p.segments.map((s) => [s.no, s.id]))
        p.segments = p.segments.filter((x) => x.id !== id)
        p.segments.forEach((s, i) => (s.no = i + 1))
        p.assets.forEach((a) => {
          if (a.belongSegs) a.belongSegs = a.belongSegs.flatMap((no) => {
            const seg = p.segments.find((s) => s.id === oldNos.get(no))
            return seg ? [seg.no] : []
          })
        })
        p.shots = p.shots.filter((s) => s.segId !== id)
        sortShots(p)
      })
      get().showToast('已删除剧本段落')
    },

    addAsset: (kind, fields) => {
      let message = ''
      patchProject((p) => {
        const name = fields.name.trim()
        if (!name || p.assets.some((a) => a.kind === kind && a.name === name)) return
        const a: Asset = { id: uid('asset'), kind, name, desc: fields.desc.trim(), prompt: fields.prompt.trim(), importance: 'minor', imgState: 'none' }
        a.belongSegs = p.segments.filter((seg) => seg.text.includes(name)).map((seg) => seg.no)
        a.prompt ||= `${kind === 'char' ? '角色' : '场景'}「${name}」${a.desc ? `：${a.desc}` : '，清晰呈现外观与画面氛围'}`
        p.assets.push(a)
        const reason: OutdatedReason = { kind: 'asset', key: a.id, text: `${assetLabel(a)}已新增` }
        const segIds = p.segments.filter((seg) => seg.text.includes(name)).map((seg) => seg.id)
        const refs = p.shots.filter((shot) => segIds.includes(shot.segId))
        markOutdated(p, refs.map((shot) => shot.id), reason)
        queueShotReason(p, segIds, reason)
        const count = refs.length
        message = `已新增${kind === 'char' ? '角色' : '场景'}${count ? `，${count} 个镜头需要更新` : ''}`
      })
      if (message) get().showToast(message)
    },

    generateAssetImages: async (ids) => {
      const projectId = get().currentId
      patchProject((p) => {
        p.assets.forEach((a) => { if (ids.includes(a.id)) a.imgState = 'generating' })
      })
      // 逐张完成
      for (let i = 0; i < ids.length; i++) {
        await delay(900)
        const id = ids[i]
        patchProject((p) => {
          const a = p.assets.find((x) => x.id === id)
          if (a) { a.imgState = 'done'; a.imageUrl = mockImage(buildAssetImagePrompt(a), a.id + i); p.balance -= COST.assetImgEach; markVideoStale(p, shotsReferencingAsset(p, a).map((s) => s.id), `${assetLabel(a)}参考图已更新`) }
        }, projectId)
      }
      get().showToast(ids.length > 1 ? '参考图已全部生成' : '参考图已生成')
    },

    clearAssetImage: (id) => {
      patchProject((p) => {
        const a = p.assets.find((x) => x.id === id)
        if (a) { a.imgState = 'none'; a.imageUrl = undefined; markVideoStale(p, shotsReferencingAsset(p, a).map((s) => s.id), `${assetLabel(a)}参考图已更新`) }
      })
      get().showToast('已清除参考图')
    },

    updateAsset: (id, patch, options) => {
      let count = 0
      patchProject((p) => {
        const a = p.assets.find((a) => a.id === id)
        if (!a) return
        const refs = shotsReferencingAsset(p, a).map((s) => s.id)
        const changed = patch.desc !== undefined && patch.desc !== a.desc
        const imageChanged = patch.imageUrl !== undefined && patch.imageUrl !== a.imageUrl
        Object.assign(a, patch)
        if (changed && !options?.silent) {
          count = markAssetOutdated(p, a, { kind: 'asset', key: id, text: `${assetLabel(a)}设定已修改` })
        }
        if (imageChanged) markVideoStale(p, refs, `${assetLabel(a)}参考图已更新`)
      })
      get().showToast(count ? `设定已保存，${count} 个镜头需要更新` : '设定已保存')
    },
    deleteAsset: (id) => {
      patchProject((p) => {
        const a = p.assets.find((a) => a.id === id)
        if (!a) return
        markAssetOutdated(p, a, { kind: 'asset', key: id, text: `${assetLabel(a)}已删除` })
        markVideoStale(p, shotsReferencingAsset(p, a).map((s) => s.id), `${assetLabel(a)}已删除`)
        p.shots.forEach((shot) => { shot.assetIds = shot.assetIds?.filter((assetId) => assetId !== id) ?? [] })
        p.assets = p.assets.filter((x) => x.id !== id)
      })
      get().showToast('已删除')
    },

    generateShots: async (segNos) => {
      const p = get().projects.find((p) => p.id === get().currentId)
      if (!p || shotGenerationBlocked(p)) return
      const segIds = p.segments.filter((s) => segNos.includes(s.no)).map((s) => s.id)
      beginShots(p, segIds)
      patchProject((p) => { p.shotStatus = 'generating' })
      get().showToast('正在生成镜头设计…')
      await finishShots(segIds, p.id)
    },

    updateShot: (id, patch) => {
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (!s) return
        // 只在值真的变化时写入，避免 blur 空提交把视频误标为需重新生成
        const changed = Object.entries(patch).some(
          ([k, v]) => String(s[k as keyof Shot] ?? '') !== String(v ?? ''),
        )
        if (!changed) return
        Object.assign(s, patch)
        // 镜头内容变了，已有视频失效
        if (SHOT_FIELDS.some(({ key }) => key in patch)) markVideoStale(p, [id], '镜头描述已修改')
      })
    },

    deleteShot: (id) => {
      patchProject((p) => {
        p.shots = p.shots.filter((x) => x.id !== id)
        p.shots.forEach((s, i) => (s.no = i + 1))
      })
      get().showToast('已删除镜头')
    },

    regenerateShot: async (id) => {
      const p = get().projects.find((p) => p.id === get().currentId)
      const shot = p?.shots.find((s) => s.id === id)
      const seg = p?.segments.find((s) => s.id === shot?.segId)
      if (!p || !seg || shotGenerationBlocked(p)) return
      await get().generateShots([seg.no])
    },

    generateVideos: async (shotIds) => {
      const projectId = get().currentId
      const project = get().projects.find((p) => p.id === projectId)
      if (!project) return
      shotIds = shotIds.filter((id) => project.shots.some((s) => s.id === id && s.video.state !== 'generating'))
      if (!shotIds.length) return
      patchProject((p) => {
        p.shots.forEach((s) => { if (shotIds.includes(s.id)) { pendingVideoStale.get(p.id)?.delete(s.id); s.video.state = 'generating' } })
      })
      get().showToast('正在生成视频…')
      await finishVideos(shotIds, projectId)
    },

    dismissVideoStale: (shotId) => {
      patchProject((p) => {
        const shot = p.shots.find((s) => s.id === shotId)
        if (shot) { shot.video.stale = false; shot.video.staleReason = undefined }
      })
      get().showToast('已保留当前视频')
    },

    restartSegments: async (durMode, targetDur) => {
      const p = get().projects.find((p) => p.id === get().currentId)
      if (!p || p.segStatus !== 'done' || p.assetStatus !== 'none') return
      patchProject((p) => {
        p.config = { ...p.config, durMode, targetDur: durMode === 'manual' ? clampTargetDuration(targetDur ?? 60) : undefined }
        p.segStatus = 'generating'
      })
      set({ step: 2 })
      await finishSegments(p.id)
    },

    /* ---------- 确认即推进：先置 generating，再切页，最后跑生成 ---------- */
    startSegments: async (durMode = 'auto', targetDur) => {
      const projectId = get().currentId
      const p = get().projects.find((p) => p.id === projectId)
      if (!p || p.segStatus !== 'none') return
      patchProject((p) => { p.config = { ratio: p.config.ratio, style: p.config.style, mode: p.config.mode, durMode, ...(durMode === 'manual' ? { targetDur: clampTargetDuration(targetDur ?? 60) } : {}) } })
      patchProject((p) => { p.segStatus = 'generating' })
      set({ step: 2 })
      await finishSegments(projectId)
    },

    startAssets: async () => {
      const projectId = get().currentId
      const p = get().projects.find((p) => p.id === projectId)
      if (!p || p.segStatus !== 'done' || p.assetStatus !== 'none') return
      patchProject((p) => { p.assetStatus = 'generating' })
      set({ step: 3 })
      await finishAssets(projectId)
    },

    startShots: async (segNos, durations, style) => {
      const p = get().projects.find((p) => p.id === get().currentId)
      if (!p || shotGenerationBlocked(p)) return
      const segIds = p.segments.filter((s) => segNos.includes(s.no)).map((s) => s.id)
      const confirmedDurations = durations && Object.fromEntries(segIds.filter((id) => durations[id] !== undefined).map((id) => [id, clampDuration(durations[id])]))
      beginShots(p, segIds)
      patchProject((p) => {
        if (style !== undefined) p.config.shotStyle = style.trim() || undefined
        p.shotStatus = 'generating'
        p.segments.forEach((seg) => {
          if (confirmedDurations?.[seg.id] !== undefined) seg.dur = confirmedDurations[seg.id]
        })
      })
      set({ step: 4 })
      await finishShots(segIds, p.id)
    },

    startVideos: async (shotIds) => {
      const projectId = get().currentId
      const project = get().projects.find((p) => p.id === projectId)
      if (!project) return
      shotIds = shotIds.filter((id) => project.shots.some((s) => s.id === id && s.video.state !== 'generating'))
      if (!shotIds.length) return
      patchProject((p) => {
        p.shots.forEach((s) => { if (shotIds.includes(s.id)) { pendingVideoStale.get(p.id)?.delete(s.id); s.video.state = 'generating' } })
      })
      set({ step: 5 })
      await finishVideos(shotIds, projectId)
    },
  }
})

// 便捷选择器
export const useCurrent = () => useStore((s) => s.projects.find((p) => p.id === s.currentId) || null)
