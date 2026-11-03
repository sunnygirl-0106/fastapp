import { useState } from 'react'
import { Monitor, MoreVertical, Play, X } from 'lucide-react'
import type { Shot } from '@/types'
import { SHOT_FIELDS, SHOT_GROUPS } from '@/types'
import { Overlay } from '@/components/ui'
import { no2, preferredVersion } from '@/utils/project'
import { sampleShots } from '@/data/mock'
import { withVersions } from './data'
import { ShotInfoModal } from './parts'
import { Issue, Notes, Segmented, Tag } from './kit'

const labelOf = (k: keyof Shot) => SHOT_FIELDS.find((f) => f.key === k)?.label ?? String(k)

/** 改前：原样复刻 Step5Video.tsx:173-202 —— 标题只有镜号，没有版本任何信息 */
function OldInfoModal({ shot, onClose }: { shot: Shot; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[80vh] w-[800px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#1c1e20] shadow-[0_16px_64px_rgba(0,0,0,0.4)] backdrop-blur-[10px]">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <div className="text-base font-medium text-white">镜头信息 {no2(shot.no)}</div>
          <button className="text-white/50 transition-colors hover:text-white" onClick={onClose} aria-label="关闭">
            <X size={14} />
          </button>
        </div>
        <div className="table-scroll flex flex-col gap-6 overflow-y-auto px-6 py-6">
          {SHOT_GROUPS.map((g) => (
            <div key={g.title} className="flex flex-col gap-4">
              <div className="text-[16px] font-medium leading-[18px] text-white/90">{g.title}</div>
              {g.fields.map((k) => (
                <div key={k} className="flex flex-col gap-2">
                  <div className="text-[12px] leading-[18px] text-white/40">{labelOf(k)}</div>
                  <div className="whitespace-pre-line text-[14px] leading-5 text-white/80">
                    {String(shot[k] ?? '') || '—'}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  )
}

export default function S4ShotInfo() {
  const shot = withVersions(sampleShots()[0], 3, 1) // v1/v2/v3，采用 v2
  const adopted = preferredVersion(shot.video)!.tag
  const [mode, setMode] = useState<'before' | 'after'>('after')
  const [viewing, setViewing] = useState(adopted)
  const [open, setOpen] = useState(false)

  const after = mode === 'after'
  const shown = shot.video.versions.find((v) => v.tag === viewing)!

  return (
    <Issue
      no={4}
      title="查看镜头信息没有版本选择"
      desc="现状：⋯ 菜单的「查看镜头信息」弹窗标题只有「镜头信息 03」，内容是镜头字段的当前值——但一个镜头有 v1/v2/v3，每一版用的描述与参数可能都不一样，弹窗里看不出这是哪一版。"
      source={
        <ul className="flex list-inside list-disc flex-col gap-1.5">
          <li>标题明确为「镜头 01 · v1 生成信息」。</li>
          <li>内容展示生成 v1 时使用的镜头描述与参数。</li>
          <li>默认跟随当前查看的视频版本，不必进入信息弹窗后再选一次。</li>
          <li>如果弹窗里也支持切换版本</li>
        </ul>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { key: 'before', label: '改前 · 现状' },
            { key: 'after', label: '改后 · 建议' },
          ]}
        />
        <span className="text-[12px] text-white/40">
          先切换「当前正在查看的版本」，再点「查看镜头信息」——看弹窗标题与内容是否跟着走
        </span>
      </div>

      {/* 「当前正在查看的版本」是调用方给的上下文：卡片打开时＝采用版本，播放器打开时＝正在播的那一版 */}
      {after && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-[#111213] px-4 py-3">
          <span className="text-[13px] text-white/60">当前正在查看的视频版本</span>
          <Segmented
            value={viewing}
            onChange={setViewing}
            options={shot.video.versions.map((v) => ({
              key: v.tag,
              label: v.tag === adopted ? `${v.tag}（采用）` : v.tag,
            }))}
          />
          <span className="text-[12px] text-white/35">
            实际由调用方传入：从卡片 ⋯ 打开＝采用版本，从播放器打开＝正在播放的那一版
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <div className="w-[226px] overflow-hidden rounded-lg border border-white/5 bg-card">
          <div
            className="group relative flex aspect-[226/221] w-full items-center justify-center overflow-hidden bg-cover bg-center"
            style={{ backgroundImage: `url("${after ? shown.url : preferredVersion(shot.video)?.url}")` }}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
              <Play size={28} className="ml-0.5" fill="currentColor" />
            </span>
          </div>
          <div className="flex flex-col gap-2 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[16px] font-medium text-white">镜头 {no2(shot.no)}</span>
                <span className="rounded-full border border-line px-1.5 py-0.5 text-[11px] leading-none text-white/50">
                  {after ? viewing : adopted}
                </span>
              </div>
              <MoreVertical size={18} className="text-white/60" />
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-[#00d8dc]">已完成</span>
              <span className="text-white/40">15 秒</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-panel2 px-3.5 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-line"
            onClick={() => setOpen(true)}
          >
            <Monitor size={16} className="shrink-0" />
            查看镜头信息
          </button>
          <div className="max-w-md text-[13px] leading-relaxed text-white/50">
            {after ? (
              <>
                当前查看的是 <span className="text-brand">{viewing}</span>，弹窗标题会是「镜头 {no2(shot.no)} ·{' '}
                <span className="text-brand">{viewing}</span> 生成信息」，
                内容是生成那一版时用的描述与参数；弹窗里还能再切版本。
              </>
            ) : (
              <>
                无论在看哪一版，弹窗标题永远是「镜头信息 {no2(shot.no)}」，
                内容是镜头字段的当前值——分不清这是 v1 还是 v3 生成时用的设定。
              </>
            )}
          </div>
          {after && (
            <div className="flex flex-wrap gap-2">
              <Tag kind="after">标题带版本号</Tag>
              <Tag kind="after">新增「生成参数」组</Tag>
              <Tag kind="after">弹窗内可切版本</Tag>
            </div>
          )}
        </div>
      </div>

      {open &&
        (after ? (
          <ShotInfoModal
            shot={shot}
            initialTag={viewing}
            adopted={adopted}
            onClose={() => setOpen(false)}
          />
        ) : (
          <OldInfoModal shot={shot} onClose={() => setOpen(false)} />
        ))}

      <Notes
        items={[
          <>
            标题改为 <span className="text-white/90">镜头 01 · v2 生成信息</span>
            ，打开时默认取调用方当前展示的版本（从卡片 ⋯ 打开＝该镜头的采用版本，从播放器打开＝正在播的那一版），
            <span className="text-white/90">不需要用户进来再选一次</span>。
          </>,
          <>
            标题右侧放与播放器同一套版本条（采用版本带 <span className="text-brand">BadgeCheck</span> icon），
            满足原文最后一条「如果弹窗里也支持切换版本」。卡片本身不加版本条。
          </>,
          <>
            内容区在原有三组（画面与节奏 / 人物与空间 / 更多设定）之前新增
            <span className="text-white/90">「生成参数」</span>
            组：视频模型、分辨率、画面比例、配音、生成时间、本次消耗。排版沿用确认弹窗的{' '}
            <code className="text-white/80">bg-black/40 p-3</code> 行式面板。
          </>,
          <>
            落地需要给 <code className="text-white/80">VideoVersion</code> 补上参数快照字段（模型/分辨率/比例/配音/消耗）。
            <code className="text-white/80">createdAt</code> 已经存在但从未渲染，这次一并用上。
            切版本时「画面描述」也要换成该版本生成时的快照，否则改过镜头后旧版本的信息会对不上。
          </>,
        ]}
      />
    </Issue>
  )
}
