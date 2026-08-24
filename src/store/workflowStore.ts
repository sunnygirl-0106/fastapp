import { create } from 'zustand'
import type { Asset, Project, Segment, Shot } from '@/types'
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
  deleteProject: (id: string) => void

  // step1 剧本
  setScript: (text: string) => void

  // step2 分段
  generateSegments: () => Promise<void>
  addSegment: (title: string, text: string) => void
  updateSegmentTitle: (id: string, title: string) => void
  deleteSegment: (id: string) => void

  // step3 资产
  extractAssets: () => Promise<void>
  generateAssetImages: (ids: string[]) => Promise<void>
  clearAssetImage: (id: string) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  deleteAsset: (id: string) => void

  // step4 分镜
  generateShots: (segNos: number[]) => Promise<void>
  updateShot: (id: string, patch: Partial<Shot>) => void
  deleteShot: (id: string) => void
  regenerateShot: (id: string) => Promise<void>

  // step5 视频
  generateVideos: (shotIds: string[]) => Promise<void>
}

function load(): Project[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Project[]
  } catch {
    /* ignore */
  }
  // 首次：内置《最后的外卖》示例项目（已完成到分镜，视频未生成）
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
  const current = () => get().projects.find((p) => p.id === get().currentId)

  let toastT: ReturnType<typeof setTimeout> | null = null

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
      const p: Project = {
        id: uid('proj'),
        name: name.trim() || `未命名项目 ${new Date().toISOString().slice(5, 10)}`,
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

    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id)
      persist(projects)
      set({ projects })
    },

    setScript: (text) => patchProject((p) => { p.script = text }),

    generateSegments: async () => {
      patchProject((p) => { p.segStatus = 'generating' })
      get().showToast('正在生成剧情分段…')
      await delay(1600)
      patchProject((p) => {
        p.balance -= COST.segGen
        p.segments = sampleSegments()
        p.segStatus = 'done'
      })
      get().showToast('已生成 3 个剧情分段')
    },

    addSegment: (title, text) => {
      patchProject((p) => {
        const no = p.segments.length + 1
        p.segments.push({ id: uid('seg'), no, title: title.trim(), dur: '15s', text: text.trim() })
      })
      get().showToast('已新增分段')
    },

    updateSegmentTitle: (id, title) => {
      patchProject((p) => {
        const s = p.segments.find((x) => x.id === id)
        if (s) s.title = title.trim() || s.title
      })
    },

    deleteSegment: (id) => {
      patchProject((p) => {
        p.segments = p.segments.filter((x) => x.id !== id)
        p.segments.forEach((s, i) => (s.no = i + 1))
      })
      get().showToast('已删除分段')
    },

    extractAssets: async () => {
      patchProject((p) => { p.assetStatus = 'generating' })
      get().showToast('正在抽出角色与场景…')
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
      })
      get().showToast('已提取 2 个角色、1 个场景')
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
      patchProject((p) => {
        const a = p.assets.find((x) => x.id === id)
        if (a) Object.assign(a, patch)
      })
      get().showToast('已保存')
    },

    deleteAsset: (id) => {
      patchProject((p) => { p.assets = p.assets.filter((x) => x.id !== id) })
      get().showToast('已删除')
    },

    generateShots: async (segNos) => {
      patchProject((p) => { p.shotStatus = 'generating' })
      get().showToast('正在根据剧情分段生成分镜…')
      await delay(1600)
      patchProject((p) => {
        p.balance -= COST.shotGenEach * segNos.length
        const all = sampleShots()
        p.shots = all.filter((s) => segNos.includes(s.no)).map((s, i) => ({ ...s, no: i + 1 }))
        p.shotStatus = 'done'
      })
      get().showToast(`已生成 ${segNos.length} 条分镜`)
    },

    updateShot: (id, patch) => {
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (s) Object.assign(s, patch)
      })
    },

    deleteShot: (id) => {
      patchProject((p) => {
        p.shots = p.shots.filter((x) => x.id !== id)
        p.shots.forEach((s, i) => (s.no = i + 1))
      })
      get().showToast('已删除分镜')
    },

    regenerateShot: async (id) => {
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (s) s.done = false
      })
      get().showToast('正在重出该分镜…')
      await delay(1400)
      patchProject((p) => {
        const s = p.shots.find((x) => x.id === id)
        if (s) { s.done = true; p.balance -= COST.shotGenEach }
      })
      get().showToast('该分镜已重新生成')
    },

    generateVideos: async (shotIds) => {
      patchProject((p) => {
        p.shots.forEach((s) => { if (shotIds.includes(s.id)) s.video.state = 'generating' })
      })
      get().showToast('正在生成分镜视频…')
      for (let i = 0; i < shotIds.length; i++) {
        await delay(1200)
        const id = shotIds[i]
        patchProject((p) => {
          const s = p.shots.find((x) => x.id === id)
          if (s) {
            s.video.state = 'done'
            s.video.versions = [{ tag: 'v1', preferred: true, url: mockImage(`分镜#${s.no}`, s.id) }]
            p.balance -= COST.videoEach
          }
        })
      }
      get().showToast('视频已全部生成')
    },
  }
})

// 便捷选择器
export const useCurrent = () => useStore((s) => s.projects.find((p) => p.id === s.currentId) || null)
