import { create } from 'zustand'
import type { Asset, Project, Shot } from '@/types'
import { COST, delay, mockImage, uid } from '@/services/generation'
import { DEFAULT_BALANCE, sampleAssets, sampleSegments, sampleShots, SAMPLE_SCRIPT } from '@/data/mock'

const LS_KEY = 'phanthy.projects.v1'

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
  generateSegments: () => Promise<void>
  addSegment: (title: string, text: string) => void
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
  startSegments: () => Promise<void> // Step1 → Step2
  startAssets: () => Promise<void> // Step2 → Step3
  startShots: (segNos: number[]) => Promise<void> // Step3 → Step4
  startVideos: (shotIds: string[]) => Promise<void> // Step4 → Step5
}

/* ---------- 下游失效标记（模块内私有） ---------- */
function markStaleFromSegments(p: Project) {
  if (p.assets.length) p.assetStale = true
  if (p.shots.length) p.shotStale = true
  p.shots.forEach((s) => {
    if (s.video.state === 'done') s.video.stale = true
  })
}

function markStaleFromAssets(p: Project) {
  if (p.shots.length) p.shotStale = true
  p.shots.forEach((s) => {
    if (s.video.state === 'done') s.video.stale = true
  })
}

function load(): Project[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Project[]
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
    config: { ratio: '9:16 竖屏', style: '写实', mode: '全自动 AI 生成' },
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
  const patchProject = (fn: (p: Project) => void) => {
    set((s) => {
      const projects = s.projects.map((p) => {
        if (p.id !== s.currentId) return p
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
  const finishSegments = async () => {
    await delay(1600)
    patchProject((p) => {
      p.balance -= COST.segGen
      p.segments = sampleSegments()
      p.segStatus = 'done'
      markStaleFromSegments(p)
    })
    get().showToast('已生成 3 个剧本段落')
  }

  const finishAssets = async () => {
    await delay(1600)
    patchProject((p) => {
      p.balance -= COST.assetExtract
      // 保留已生成的参考图（若同名资产已存在图片）
      const prev = new Map(p.assets.map((a) => [a.name, a]))
      p.assets = sampleAssets().map((a) => {
        const old = prev.get(a.name)
        return old && old.imgState === 'done' ? { ...a, imgState: 'done', imageUrl: old.imageUrl } : a
      })
      p.assetStatus = 'done'
      p.assetStale = false
      markStaleFromAssets(p)
    })
    get().showToast('已提取 2 个角色、1 个场景')
  }

  const finishShots = async (segNos: number[]) => {
    await delay(1600)
    patchProject((p) => {
      p.balance -= COST.shotGenEach * segNos.length
      const all = sampleShots()
      p.shots = all.filter((s) => segNos.includes(s.no)).map((s, i) => ({ ...s, no: i + 1 }))
      p.shotStatus = 'done'
      p.shotStale = false
    })
    get().showToast(`已生成 ${segNos.length} 个镜头`)
  }

  const finishVideos = async (shotIds: string[]) => {
    for (let i = 0; i < shotIds.length; i++) {
      await delay(1200)
      const id = shotIds[i]
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (s) {
          s.video.state = 'done'
          s.video.stale = false
          s.video.versions = [{ tag: 'v1', preferred: true, url: mockImage(`镜头#${s.no}`, s.id) }]
          p.balance -= COST.videoEach
        }
      })
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
        config: { ratio: '9:16 竖屏', style: '写实', mode: '全自动 AI 生成' },
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

    setScript: (text) => patchProject((p) => { p.script = text }),

    generateSegments: async () => {
      patchProject((p) => { p.segStatus = 'generating' })
      get().showToast('正在拆解剧本…')
      await finishSegments()
    },

    addSegment: (title, text) => {
      patchProject((p) => {
        const no = p.segments.length + 1
        p.segments.push({ id: uid('seg'), no, title: title.trim(), dur: '15s', text: text.trim() })
        markStaleFromSegments(p)
      })
      get().showToast('已新增剧本段落')
    },

    updateSegmentTitle: (id, title) => {
      patchProject((p) => {
        const s = p.segments.find((x) => x.id === id)
        if (!s) return
        const next = title.trim() || s.title
        if (next === s.title) return // 没变就不置脏
        s.title = next
        markStaleFromSegments(p)
      })
    },

    deleteSegment: (id) => {
      patchProject((p) => {
        p.segments = p.segments.filter((x) => x.id !== id)
        p.segments.forEach((s, i) => (s.no = i + 1))
        markStaleFromSegments(p)
      })
      get().showToast('已删除剧本段落')
    },

    extractAssets: async () => {
      patchProject((p) => { p.assetStatus = 'generating' })
      get().showToast('正在提取角色与场景…')
      await finishAssets()
    },

    generateAssetImages: async (ids) => {
      patchProject((p) => {
        p.assets.forEach((a) => { if (ids.includes(a.id)) a.imgState = 'generating' })
      })
      // 逐张完成
      for (let i = 0; i < ids.length; i++) {
        await delay(900)
        const id = ids[i]
        patchProject((p) => {
          const a = p.assets.find((x) => x.id === id)
          if (a) { a.imgState = 'done'; a.imageUrl = mockImage(a.name, a.id + i); p.balance -= COST.assetImgEach }
        })
      }
      get().showToast(ids.length > 1 ? '参考图已全部生成' : '参考图已生成')
    },

    clearAssetImage: (id) => {
      patchProject((p) => {
        const a = p.assets.find((x) => x.id === id)
        if (a) { a.imgState = 'none'; a.imageUrl = undefined }
      })
      get().showToast('已清除参考图')
    },

    updateAsset: (id, patch) => {
      let hasImage = false
      patchProject((p) => {
        const a = p.assets.find((x) => x.id === id)
        if (!a) return
        hasImage = a.imgState === 'done'
        Object.assign(a, patch)
      })
      get().showToast(hasImage ? '设定已保存，当前参考图不会自动更新' : '设定已保存')
    },

    deleteAsset: (id) => {
      patchProject((p) => { p.assets = p.assets.filter((x) => x.id !== id) })
      get().showToast('已删除')
    },

    generateShots: async (segNos) => {
      patchProject((p) => { p.shotStatus = 'generating' })
      get().showToast('正在生成镜头设计…')
      await finishShots(segNos)
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
        if (s.video.state === 'done') s.video.stale = true
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
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (s) s.done = false
      })
      get().showToast('正在重新生成该镜头…')
      await delay(1400)
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (s) {
          s.done = true
          p.balance -= COST.shotGenEach
          if (s.video.state === 'done') s.video.stale = true
        }
      })
      get().showToast('该镜头已重新生成')
    },

    generateVideos: async (shotIds) => {
      patchProject((p) => {
        p.shots.forEach((s) => { if (shotIds.includes(s.id)) s.video.state = 'generating' })
      })
      get().showToast('正在生成视频…')
      await finishVideos(shotIds)
    },

    /* ---------- 确认即推进：先置 generating，再切页，最后跑生成 ---------- */
    startSegments: async () => {
      patchProject((p) => { p.segStatus = 'generating' })
      set({ step: 2 })
      await finishSegments()
    },

    startAssets: async () => {
      patchProject((p) => { p.assetStatus = 'generating' })
      set({ step: 3 })
      await finishAssets()
    },

    startShots: async (segNos) => {
      patchProject((p) => { p.shotStatus = 'generating' })
      set({ step: 4 })
      await finishShots(segNos)
    },

    startVideos: async (shotIds) => {
      patchProject((p) => {
        p.shots.forEach((s) => { if (shotIds.includes(s.id)) s.video.state = 'generating' })
      })
      set({ step: 5 })
      await finishVideos(shotIds)
    },
  }
})

// 便捷选择器
export const useCurrent = () => useStore((s) => s.projects.find((p) => p.id === s.currentId) || null)
