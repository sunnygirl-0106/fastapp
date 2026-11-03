import { useState } from 'react'
import { BadgeCheck, ChevronLeft, ChevronRight, Download, Monitor, MoreVertical, Play } from 'lucide-react'
import type { Shot } from '@/types'
import { ActionBar, PageHeader, Popover } from '@/components/ui'
import { no2, preferredVersion } from '@/utils/project'
import { sampleShots } from '@/data/mock'
import { makeProject, withVersions } from './data'
import { PlayerV2, ShotInfoModal } from './parts'
import { Issue, Notes, Segmented, SourceTable, Stage, useLocalToast } from './kit'

const CTA_GRADIENT = { backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }

/** 镜头 01 有 3 个版本（采用 v2），02 有 2 个（采用 v2），03 只有 1 个 */
function seedShots(): Shot[] {
  const [a, b, c] = sampleShots()
  return [withVersions(a, 3, 1), withVersions(b, 2, 1), withVersions(c, 1, 0)]
}

type MenuState = { s: Shot; top: number; left: number }

export default function S3VideoVersion() {
  const [mode, setMode] = useState<'before' | 'after'>('after')
  const [shots, setShots] = useState<Shot[]>(seedShots)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 菜单的二级页：选择要下载的版本 */
  const [pickVer, setPickVer] = useState(false)
  const [play, setPlay] = useState<Shot | null>(null)
  const [info, setInfo] = useState<Shot | null>(null)
  const { showToast, toastNode } = useLocalToast()

  const after = mode === 'after'
  const project = makeProject({ shots })
  const clipCount = shots.reduce((n, s) => n + s.video.versions.length, 0)

  const adoptedOf = (s: Shot) => preferredVersion(s.video)?.tag ?? 'v1'

  const adopt = (id: string, tag: string) =>
    setShots((xs) =>
      xs.map((s) =>
        s.id === id
          ? {
              ...s,
              video: {
                ...s.video,
                versions: s.video.versions.map((v) => ({ ...v, preferred: v.tag === tag })),
              },
            }
          : s,
      ),
    )

  const closeMenu = () => {
    setMenu(null)
    setPickVer(false)
  }

  return (
    <Issue
      no={3}
      title="下载视频没有版本选择"
      desc="现状：⋯ 菜单里的「下载视频」点了直接下载，不说下的是哪一版；一个镜头有 v1/v2/v3 时，用户没有任何办法挑。改动只发生在 ⋯ 菜单和播放器里，卡片本身不动。"
      source={
        <>
          <SourceTable
            head={['位置', '建议行为']}
            rows={[
              ['卡片、播放器点击 v1 / v2 / v3', '切换预览'],
              ['当前预览版本旁的「采用此版本」', '将它设为该镜头的采用版本'],
              ['播放器下载', '下载正在播放的版本'],
              ['卡片更多菜单下载', <>下载卡片当前展示的版本，文案写「下载 v2」</>],
              ['批量下载', '每个镜头下载其采用版本'],
            ]}
          />
          <div className="mt-2.5">采用版本常驻一个「已采用」标识 icon</div>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            closeMenu()
          }}
          options={[
            { key: 'before', label: '改前 · 现状' },
            { key: 'after', label: '改后 · 建议' },
          ]}
        />
        <span className="text-[12px] text-white/40">
          {after
            ? '点卡片右上角 ⋯ →「下载视频」进入版本列表；点封面进播放器切换版本、设为采用版本'
            : '⋯ 菜单只有一个无版本信息的「下载视频」，点了直接下载'}
        </span>
      </div>

      <Stage project={project} step={5}>
        <PageHeader
          title="视频成片"
          desc={`${shots.length} 个镜头，共 ${clipCount} 段视频。同一镜头的每次重新生成都会保留为一个新版本。`}
          right={
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5">
              重新生成视频
            </button>
          }
        />

        {/* 卡片与现状完全一致：封面 + 镜号 + 当前版本小标 + ⋯ + 状态行 */}
        <div className="flex flex-wrap gap-4">
          {shots.map((s) => {
            const ver = preferredVersion(s.video)
            return (
              <div key={s.id} className="w-[226px] overflow-hidden rounded-lg border border-white/5 bg-card">
                <div
                  onClick={() => setPlay(s)}
                  className="group relative flex aspect-[226/221] w-full cursor-pointer items-center justify-center overflow-hidden bg-cover bg-center"
                  style={{ backgroundImage: `url("${ver?.url}")` }}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition group-hover:bg-black/60">
                    <Play size={28} className="ml-0.5" fill="currentColor" />
                  </span>
                </div>

                <div className="flex flex-col gap-2 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[16px] font-medium text-white">镜头 {no2(s.no)}</span>
                      {ver && (
                        <span className="rounded-full border border-line px-1.5 py-0.5 text-[11px] leading-none text-white/50">
                          {ver.tag}
                        </span>
                      )}
                    </div>
                    <button
                      className="text-white/60 transition-colors hover:text-white"
                      title="更多"
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setPickVer(false)
                        setMenu({ s, top: r.bottom + 6, left: r.right + 6 })
                      }}
                    >
                      <MoreVertical size={18} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-[#00d8dc]">已完成</span>
                    <span className="text-white/40">15 秒</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <ActionBar
          inline
          left={
            after
              ? `${shots.length} 个镜头 · 共 ${clipCount} 段视频 · 批量下载取各镜头的采用版本`
              : `${shots.length} 个镜头 · 共 ${clipCount} 段视频`
          }
        >
          <button
            style={CTA_GRADIENT}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105"
            onClick={() =>
              showToast(
                after
                  ? `已开始批量下载 ${shots.length} 个采用版本（镜头01_${adoptedOf(shots[0])}.mp4 …）`
                  : '已开始批量下载（示意）',
              )
            }
          >
            批量下载
          </button>
        </ActionBar>
      </Stage>

      {/* ⋯ 菜单。改后多一级「选择版本」，只有多版本时才进二级 */}
      {menu && (
        <Popover anchor={menu} width={after ? 176 : 150} variant="glass" onClose={closeMenu}>
          {after && pickVer ? (
            <>
              <button
                className="flex items-center gap-1.5 text-[13px] text-white/45 transition-colors hover:text-white/80"
                onClick={() => setPickVer(false)}
              >
                <ChevronLeft size={14} className="shrink-0" />
                选择版本
              </button>
              <div className="flex flex-col gap-3">
                {menu.s.video.versions.map((v) => {
                  const isAdopted = v.tag === adoptedOf(menu.s)
                  return (
                    <button
                      key={v.tag}
                      className="flex items-center justify-between gap-3 text-[14px] text-white/90 transition-colors hover:text-white"
                      onClick={() => {
                        showToast(`已开始下载 镜头${no2(menu.s.no)}_${v.tag}.mp4（示意）`)
                        closeMenu()
                      }}
                    >
                      <span>下载 {v.tag}</span>
                      {isAdopted && (
                        <BadgeCheck size={14} className="shrink-0 text-brand" aria-label="采用版本" />
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <button
                className="flex items-center gap-2 text-[14px] text-white/90 transition-colors hover:text-white"
                onClick={() => {
                  const vers = menu.s.video.versions
                  if (after && vers.length > 1) {
                    setPickVer(true) // 多版本才需要选
                    return
                  }
                  showToast(
                    after
                      ? `已开始下载 镜头${no2(menu.s.no)}_${vers[0]?.tag}.mp4（示意）`
                      : '已开始下载（示意）',
                  )
                  closeMenu()
                }}
              >
                <Download size={16} className="shrink-0" />
                下载视频
                {after && menu.s.video.versions.length > 1 && (
                  <ChevronRight size={14} className="ml-auto shrink-0 text-white/40" />
                )}
              </button>
              <button
                className="flex items-center gap-2 text-[14px] text-white/90 transition-colors hover:text-white"
                onClick={() => {
                  setInfo(menu.s)
                  closeMenu()
                }}
              >
                <Monitor size={16} className="shrink-0" />
                查看镜头信息
              </button>
            </>
          )}
        </Popover>
      )}

      {play && (
        <PlayerV2
          shot={play}
          initialTag={adoptedOf(play)}
          adopted={adoptedOf(play)}
          onAdopt={(tag) => {
            adopt(play.id, tag)
            setShots((xs) => {
              const next = xs.map((s) =>
                s.id === play.id
                  ? {
                      ...s,
                      video: {
                        ...s.video,
                        versions: s.video.versions.map((v) => ({ ...v, preferred: v.tag === tag })),
                      },
                    }
                  : s,
              )
              setPlay(next.find((s) => s.id === play.id) ?? null)
              return next
            })
          }}
          onClose={() => setPlay(null)}
          onToast={showToast}
        />
      )}

      {info && (
        <ShotInfoModal
          shot={info}
          initialTag={adoptedOf(info)}
          adopted={adoptedOf(info)}
          showVersionSwitch={after}
          onClose={() => setInfo(null)}
        />
      )}

      <Notes
        items={[
          <>
            <span className="text-white/90">卡片一个字都不加。</span>
            版本号仍是原来那个灰色小标，展示当前采用版本；切换版本、选版本下载全部收进 ⋯ 菜单和播放器里。
          </>,
          <>
            ⋯ 菜单的「下载视频」右侧出现 <code className="text-white/80">›</code>，点进去是版本列表「下载 v1 / v2 / v3」，
            采用版本旁带一个 <span className="text-brand">✓</span>。
            <span className="text-white/90">只有一个版本时不进二级</span>
            ——单版本的镜头（如镜头 03）点了直接下载，不多一步。
          </>,
          <>
            切换查看版本仍然在播放器里（这是现状已有的能力），播放器下载的就是正在播的那一版，
            「采用此版本」也放在那儿——与原文「当前预览版本旁」一致。
          </>,
          <>
            数据层不用新增字段：<code className="text-white/80">VideoVersion.preferred</code> 已经存在，
            只是把它从「自动等于最新一版」改成「用户可指定」。批量下载按它取版本，文件名{' '}
            <code className="text-white/80">镜头01_v2.mp4</code>。
          </>,
        ]}
      />
      {toastNode}
    </Issue>
  )
}
