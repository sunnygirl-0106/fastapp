import { create } from 'zustand'
import { SHOT_FIELDS, type Asset, type Project, type Shot, type Segment, type OutdatedReason } from '@/types'
import { COST, delay, mockImage, uid, videoCost } from '@/services/generation'
import { DEFAULT_BALANCE, sampleAssets, sampleSegments, sampleShots, SAMPLE_SCRIPT } from '@/data/mock'

import { buildTimeline, no2, shotsReferencingAsset, shotGenerationBlocked } from '@/utils/project'
import { clampDuration, DUR_DEFAULT } from '@/data/duration'
import { buildAssetImagePrompt } from '@/data/assetTemplates'

const LS_KEY = 'phanthy.projects.v2'

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
  addSegment: (title: string, text: string, dur?: number) => void
  updateSegment: (id: string, patch: Partial<Pick<Segment, 'title' | 'text' | 'dur'>>) => void
  dismissOutdated: (id: string) => void
  renameAsset: (id: string, name: string, sync: boolean) => void
  updateSegmentTitle: (id: string, title: string) => void
  deleteSegment: (id: string) => void

  // step3 角色与场景
  extractAssets: () => Promise<void>
  generateAssetImages: (ids: string[]) => Promise<void>
  clearAssetImage: (id: string) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  deleteAsset: (id: string) => void

  // step4 镜头
  generateShots: (segNos: number[]) => Promise<void>
  updateShot: (id: string, patch: Partial<Shot>) => void
  deleteShot: (id: string) => void
  regenerateShot: (id: string) => Promise<void>

  // step5 视频
  generateVideos: (shotIds: string[]) => Promise<void>

  // 确认即推进：先置 generating、再切页、最后跑生成
  startSegments: (dur?: number) => Promise<void> // Step1 → Step2
  startAssets: () => Promise<void> // Step2 → Step3
  startShots: (segNos: number[]) => Promise<void> // Step3 → Step4
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
    p.config.segDur ??= DUR_DEFAULT
    p.segments.forEach((seg) => {
      if (typeof seg.dur === 'string') seg.dur = parseInt(seg.dur, 10) || DUR_DEFAULT
    })
    p.shots.forEach((s) => {
      s.segId ??= p.segments[s.no - 1]?.id ?? ''
      s.dur ??= p.segments.find((seg) => seg.id === s.segId)?.dur ?? DUR_DEFAULT
      s.video.versions.forEach((v) => { v.dur ??= DUR_DEFAULT })
    })
  })
  return backfillVersionTime(projects)
}

function markOutdated(p: Project, ids: string[], reason: OutdatedReason) {
  p.shots.filter((s) => ids.includes(s.id)).forEach((s) => {
    s.outdated = [...(s.outdated ?? []).filter((r) => r.kind !== reason.kind || (r.kind === 'asset' && r.key !== reason.key)), reason]
  })
}
function markVideoStale(p: Project, ids: string[], reason: string) {
  p.shots.filter((s) => ids.includes(s.id) && s.video.versions.length > 0).forEach((s) => {
    s.video.stale = true
    s.video.staleReason = reason
  })
}
function assetLabel(a: Asset) { return `${a.kind === 'char' ? '角色' : '场景'}「${a.name}」` }
function sortShots(p: Project) {
  p.shots.sort((a, b) => p.segments.findIndex((s) => s.id === a.segId) - p.segments.findIndex((s) => s.id === b.segId))
  p.shots.forEach((s, i) => { s.no = i + 1 })
}
function designShot(p: Project, seg: Segment, old?: Shot): Shot {
  const sample = sampleShots().find((s) => s.segId === seg.id)
  const originalText = sampleSegments().find((s) => s.id === seg.id)?.text
  const base = originalText === seg.text ? sample : old && !old.outdated?.some((r) => r.kind === 'segText') ? old : undefined
  const refs = p.assets.filter((a) => seg.text.includes(a.name) || (a.kind === 'scene' && a.belongSegs?.includes(seg.no)))
  const scene = refs.find((a) => a.kind === 'scene')
  const beats = seg.text.split(/(?<=[。！？])/).filter(Boolean)
  const shot: Shot = {
    id: old?.id ?? uid('shot'), segId: seg.id, no: seg.no, dur: seg.dur,
    shot: base?.shot ?? seg.text,
    timeline: buildTimeline(base?.timeline.split('\n') ?? beats, seg.dur),
    action: base?.action ?? seg.text,
    anchor: base?.anchor ?? scene?.name ?? '当前段落场景',
    motion: base?.motion ?? seg.text,
    blocking: base?.blocking ?? '根据段落动作安排人物位置',
    continuity: base?.continuity ?? '保持人物外观与场景结构一致',
    subject: refs.filter((a) => a.kind === 'char').map((a) => a.name).join('、') || seg.title,
    forbid: base?.forbid ?? '不添加段落以外的人物与事件',
    background: refs.map((a) => `${a.name}：${a.desc}；${a.prompt}`).join('；') || base?.background || '按段落原文呈现场景',
    done: true, outdated: [], video: old?.video ?? { state: 'none', versions: [] },
  }
  return shot
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
    config: { segDur: DUR_DEFAULT, ratio: '9:16 竖屏', style: '写实', mode: '全自动 AI 生成' },
    balance: DEFAULT_BALANCE,
    script: SAMPLE_SCRIPT,
    segStatus: 'done',
    assetStatus: 'done',
    shotStatus: 'done',
    segments: sampleSegments(),
    assets: sampleAssets().map((a) => ({ ...a, imgState: 'done', imageUrl: mockImage(a.name, a.id) })),
    shots: sampleShots(),
  }
  return [seed]
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
    patchProject((p) => {
      p.balance -= COST.segGen
      p.segments = sampleSegments().map((s) => ({ ...s, dur: p.config.segDur }))
      p.segStatus = 'done'
    }, projectId)
    get().showToast('已生成 3 个剧本段落')
  }

  const finishAssets = async (projectId: string | null) => {
    await delay(1600)
    patchProject((p) => {
      p.balance -= COST.assetExtract
      // 保留已生成的参考图（若同名资产已存在图片）
      const prev = new Map(p.assets.map((a) => [`${a.kind}:${a.name}`, a]))
      p.assets = sampleAssets().map((a) => {
        const old = prev.get(`${a.kind}:${a.name}`)
        return old && old.imgState === 'done' ? { ...a, imgState: 'done', imageUrl: old.imageUrl } : a
      })
      p.assetStatus = 'done'
      p.assetsHint = false
      markOutdated(p, p.shots.map((s) => s.id), { kind: 'asset', key: 'reextract', text: '角色与场景已重新提取' })
    }, projectId)
    get().showToast('已提取 2 个角色、1 个场景')
  }

  const finishShots = async (segIds: string[], projectId: string | null) => {
    await delay(1600)
    patchProject((p) => {
      const segs = p.segments.filter((s) => segIds.includes(s.id))
      p.balance -= COST.shotGenEach * segs.length
      segs.forEach((seg) => {
        const old = p.shots.find((s) => s.segId === seg.id)
        const next = designShot(p, seg, old)
        if (old) p.shots[p.shots.indexOf(old)] = next
        else p.shots.push(next)
        markVideoStale(p, [next.id], '镜头已重新生成')
      })
      sortShots(p)
      p.shotStatus = 'done'
    }, projectId)
    get().showToast(`已生成 ${segIds.length} 个镜头`)
  }

  const finishVideos = async (shotIds: string[], projectId: string | null) => {
    const durations = new Map(get().projects.find((p) => p.id === projectId)?.shots.map((s) => [s.id, s.dur]))
    for (let i = 0; i < shotIds.length; i++) {
      await delay(1200)
      const id = shotIds[i]
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (s) {
          s.video.state = 'done'
          s.video.staleReason = undefined
          s.video.stale = false
          // 每次生成都追加一个新版本：已生成的视频是用户付费得来的资产，绝不覆盖
          const n = s.video.versions.length
          s.video.versions.forEach((v) => (v.preferred = false))
          s.video.versions.push({
            tag: `v${n + 1}`,
            preferred: true,
            url: mockImage(`镜头#${s.no}`, s.id, n),
            createdAt: Date.now(),
            dur: durations.get(id) ?? s.dur,
          })
          p.balance -= videoCost(durations.get(id) ?? s.dur)
        }
      }, projectId)
    }
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
        config: { segDur: DUR_DEFAULT, ratio: '9:16 竖屏', style: '写实', mode: '全自动 AI 生成' },
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
        p.segments.push({ id: uid('seg'), no, title: title.trim(), dur: clampDuration(dur ?? p.config.segDur), text: text.trim() })
      })
      get().showToast('已新增剧本段落')
    },
    updateSegmentTitle: (id, title) => get().updateSegment(id, { title }),
    updateSegment: (id, patch) => {
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
          p.assetsHint = true
          if (shot) markOutdated(p, [shot.id], { kind: 'segText', text: '段落原文已修改' })
        }
        seg.dur = dur
        if (durChanged && shot) {
          if (dur === shot.dur) shot.outdated = shot.outdated?.filter((r) => r.kind !== 'segDur')
          else markOutdated(p, [shot.id], { kind: 'segDur', text: `时长已改为 ${dur} 秒，当前描述按 ${shot.dur} 秒编写` })
        }
        if (textChanged || durChanged) message = shot?.outdated?.length ? `已保存，镜头 ${no2(shot.no)} 需要更新` : '已保存'
      })
      if (message) get().showToast(message)
    },
    dismissOutdated: (id) => {
      let message = '已保留当前描述'
      patchProject((p) => {
        const shot = p.shots.find((s) => s.id === id)
        if (!shot) return
        if (shot.outdated?.some((r) => r.kind === 'segDur')) {
          const seg = p.segments.find((s) => s.id === shot.segId)
          if (seg) seg.dur = shot.dur
          message += `，时长恢复为 ${shot.dur} 秒`
        }
        shot.outdated = []
      })
      get().showToast(message)
    },
    renameAsset: (id, name, sync) => {
      patchProject((p) => {
        const a = p.assets.find((a) => a.id === id)
        const next = name.trim()
        if (!a || !next || p.assets.some((x) => x.id !== id && x.kind === a.kind && x.name === next)) return
        const old = a.name
        a.name = next
        if (sync) {
          const replace = (s: string) => s.split(old).join(next)
          p.segments.forEach((seg) => { seg.text = replace(seg.text) })
          p.shots.forEach((shot) => SHOT_FIELDS.forEach(({ key }) => { Object.assign(shot, { [key]: replace(String(shot[key] ?? '')) }) }))
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

    extractAssets: async () => {
      const p = get().projects.find((p) => p.id === get().currentId)
      if (!p || shotGenerationBlocked(p)) return
      const projectId = p.id
      patchProject((p) => { p.assetStatus = 'generating' })
      get().showToast('正在提取角色与场景…')
      await finishAssets(projectId)
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

    updateAsset: (id, patch) => {
      let count = 0
      patchProject((p) => {
        const a = p.assets.find((a) => a.id === id)
        if (!a) return
        const refs = shotsReferencingAsset(p, a).map((s) => s.id)
        const changed = (patch.desc !== undefined && patch.desc !== a.desc) || (patch.prompt !== undefined && patch.prompt !== a.prompt)
        const imageChanged = patch.imageUrl !== undefined && patch.imageUrl !== a.imageUrl
        Object.assign(a, patch)
        if (changed) {
          count = refs.length
          markOutdated(p, refs, { kind: 'asset', key: id, text: `${assetLabel(a)}设定已修改` })
        }
        if (imageChanged) markVideoStale(p, refs, `${assetLabel(a)}参考图已更新`)
      })
      get().showToast(count ? `设定已保存，${count} 个镜头需要更新` : '设定已保存')
    },
    deleteAsset: (id) => {
      patchProject((p) => {
        const a = p.assets.find((a) => a.id === id)
        if (!a) return
        markOutdated(p, shotsReferencingAsset(p, a).map((s) => s.id), { kind: 'asset', key: id, text: `${assetLabel(a)}已删除` })
        p.assets = p.assets.filter((x) => x.id !== id)
      })
      get().showToast('已删除')
    },

    generateShots: async (segNos) => {
      const p = get().projects.find((p) => p.id === get().currentId)
      if (!p || shotGenerationBlocked(p)) return
      const segIds = p.segments.filter((s) => segNos.includes(s.no)).map((s) => s.id)
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
      patchProject((p) => {
        p.shots.forEach((s) => { if (shotIds.includes(s.id)) s.video.state = 'generating' })
      })
      get().showToast('正在生成视频…')
      await finishVideos(shotIds, projectId)
    },

    /* ---------- 确认即推进：先置 generating，再切页，最后跑生成 ---------- */
    startSegments: async (dur) => {
      const projectId = get().currentId
      const p = get().projects.find((p) => p.id === projectId)
      if (!p || p.segStatus !== 'none') return
      patchProject((p) => { p.config.segDur = clampDuration(dur ?? p.config.segDur) })
      patchProject((p) => { p.segStatus = 'generating' })
      set({ step: 2 })
      await finishSegments(projectId)
    },

    startAssets: async () => {
      const projectId = get().currentId
      patchProject((p) => { p.assetStatus = 'generating' })
      set({ step: 3 })
      await finishAssets(projectId)
    },

    startShots: async (segNos) => {
      const p = get().projects.find((p) => p.id === get().currentId)
      if (!p || shotGenerationBlocked(p)) return
      const segIds = p.segments.filter((s) => segNos.includes(s.no)).map((s) => s.id)
      patchProject((p) => { p.shotStatus = 'generating' })
      set({ step: 4 })
      await finishShots(segIds, p.id)
    },

    startVideos: async (shotIds) => {
      const projectId = get().currentId
      patchProject((p) => {
        p.shots.forEach((s) => { if (shotIds.includes(s.id)) s.video.state = 'generating' })
      })
      set({ step: 5 })
      await finishVideos(shotIds, projectId)
    },
  }
})

// 便捷选择器
export const useCurrent = () => useStore((s) => s.projects.find((p) => p.id === s.currentId) || null)
