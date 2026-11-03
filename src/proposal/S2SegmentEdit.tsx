import { useLayoutEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Segment } from '@/types'
import { InlineRename, LockedBadge, PageHeader, SaveBadge } from '@/components/ui'
import { useAutoSave } from '@/hooks/useAutoSave'
import { fmtDur, no2 } from '@/utils/project'
import { sampleSegments } from '@/data/mock'
import { makeProject } from './data'
import { Issue, Notes, Segmented, Stage, useLocalToast } from './kit'

type Mode = 'before' | 'editable' | 'locked'

/* ---------- 段落卡片 ----------
   壳体、标题行、收起态正文、展开浮层全部沿用 src/steps/Step2Segments.tsx:246-348，
   改动只有两处：正文在 editable 下变成 textarea；浮层左下角「只读」→「自动保存」+ SaveBadge。 */
function ParagraphCard({
  seg,
  mode,
  dirty,
  onRenameTitle,
  onEditText,
}: {
  seg: Segment
  mode: Mode
  dirty: boolean
  onRenameTitle: (v: string) => void
  onEditText: (v: string) => void
}) {
  const locked = mode === 'locked'
  const canEditText = mode === 'editable'
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const bodyRef = useRef<HTMLParagraphElement>(null)
  const { status, schedule, flush } = useAutoSave((v) => onEditText(v))

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    setOverflow(el.scrollHeight - el.clientHeight > 4)
  }, [seg.text])

  return (
    <div className="rounded-lg border border-white/10 bg-[#111213] p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums text-white/40">{no2(seg.no)}</span>
        {locked ? (
          <span className="text-left text-sm font-medium leading-snug text-white">{seg.title}</span>
        ) : editing ? (
          <InlineRename
            value={seg.title}
            className="text-sm font-medium"
            onCommit={(v) => {
              onRenameTitle(v)
              setEditing(false)
            }}
          />
        ) : (
          <button
            type="button"
            title="点击编辑标题"
            onClick={() => setEditing(true)}
            className="rounded text-left text-sm font-medium leading-snug text-white transition-opacity hover:opacity-70"
          >
            {seg.title}
          </button>
        )}
        <span className="text-sm tabular-nums text-white/40">{fmtDur(seg.dur)}</span>

        {/* 改后新增：正文改过 → 下游镜头/视频标脏，沿用 Step4 的琥珀色提示 */}
        {dirty && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            需重新生成镜头
          </span>
        )}

        <button
          type="button"
          disabled={locked}
          title={locked ? '' : '删除段落'}
          aria-label="删除段落"
          className="ml-auto rounded-md p-1.5 text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/40"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="relative mt-2">
        <button
          type="button"
          title={canEditText ? '点击编辑正文' : '点击查看完整原文'}
          onClick={() => setOpen(true)}
          className="group/body block w-full cursor-pointer text-left"
        >
          <p
            ref={bodyRef}
            className="max-h-[7.5rem] overflow-hidden whitespace-pre-line text-xs leading-relaxed text-white/60 transition-colors group-hover/body:text-white/80"
          >
            {seg.text}
          </p>
          {overflow && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#111213] to-transparent" />
          )}
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => {
                flush()
                setOpen(false)
              }}
            />
            <div className="absolute -inset-x-1 -top-1 z-30 rounded-lg border border-white/15 bg-[#16181a]/95 px-3 py-2.5 shadow-xl shadow-black/50 backdrop-blur">
              {canEditText ? (
                <textarea
                  autoFocus
                  defaultValue={seg.text}
                  onChange={(e) => schedule(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-transparent bg-black/40 px-2.5 py-2 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-brand/40"
                />
              ) : (
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-white/90">{seg.text}</p>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5">
                {canEditText ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-[12px] text-faint">自动保存</span>
                    <SaveBadge status={status} />
                  </span>
                ) : (
                  <span className="text-[12px] text-white/40">只读</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    flush()
                    setOpen(false)
                  }}
                  className="text-[12px] text-white/60 transition-colors hover:text-white"
                >
                  收起
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function S2SegmentEdit() {
  const [mode, setMode] = useState<Mode>('editable')
  const [segs, setSegs] = useState<Segment[]>(sampleSegments)
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const { showToast, toastNode } = useLocalToast()

  // 未提取时后续步骤都还没发生，流程条据此显示为「1 已完成 / 2 进行中 / 3-5 未开始」
  const extracted = mode === 'locked'
  const project = makeProject({
    segments: segs,
    assetStatus: extracted ? 'done' : 'none',
    shotStatus: 'none',
    shots: [],
  })
  const locked = mode === 'locked'

  const editText = (id: string, v: string) => {
    setSegs((xs) => xs.map((s) => (s.id === id ? { ...s, text: v } : s)))
    setDirty((d) => ({ ...d, [id]: true }))
    showToast('已保存，该段落的镜头与视频已标记为需重新生成')
  }

  return (
    <Issue
      no={2}
      title="拆解正文是否可编辑"
      desc="现状：段落标题点一下可改，正文任何时候都改不了——点正文只弹出一个只读浮层。改为未开始提取角色与场景时正文也能改，并把浮层左下角的「只读」换成「自动保存」。"
      source={
        <ul className="flex list-inside list-disc flex-col gap-1.5">
          <li>未开始提取角色与场景时，允许修改段落标题、正文。</li>
          <li>点击正文，左下方【只读】改成【自动保存】</li>
          <li className="text-white/50">
            原有项目代码这里也许跟后面生成视频有所关联，所以没有编辑功能，改成可以编辑后，记得确认一下会同步影响到后面生镜头生视频
          </li>
        </ul>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            setSegs(sampleSegments())
            setDirty({})
          }}
          options={[
            { key: 'before', label: '改前 · 现状' },
            { key: 'editable', label: '改后 · 未提取（可编辑）' },
            { key: 'locked', label: '改后 · 已提取（锁定）' },
          ]}
        />
        <span className="text-[12px] text-white/40">
          {mode === 'before'
            ? '点任意段落正文 → 只读浮层，左下角「只读」'
            : mode === 'editable'
              ? '点任意段落正文 → 可编辑，左下角「自动保存」，输入后 0.7s 自动提交'
              : '已开始提取角色与场景 → 标题与正文都只读，标题旁出现锁标识'}
        </span>
      </div>

      <Stage project={project} step={2}>
        <PageHeader
          title="剧本拆解"
          desc={`共 ${segs.length} 个剧本段落`}
          badge={locked && <LockedBadge />}
          right={
            <div className="flex items-center gap-2">
              <button
                disabled={locked}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:opacity-40"
              >
                重新拆解
              </button>
              <button
                disabled={locked}
                style={{ backgroundImage: 'linear-gradient(180deg, #c2f2ff 0%, #cef4ff 100%)' }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                + 新增剧本段落
              </button>
            </div>
          }
        />
        <div className="space-y-3">
          {segs.map((s) => (
            <ParagraphCard
              key={s.id}
              seg={s}
              mode={mode}
              dirty={!!dirty[s.id]}
              onRenameTitle={(v) => setSegs((xs) => xs.map((x) => (x.id === s.id ? { ...x, title: v } : x)))}
              onEditText={(v) => editText(s.id, v)}
            />
          ))}
        </div>
      </Stage>

      <Notes
        items={[
          <>
            正文编辑条件与现有锁定规则完全一致：<code className="text-white/80">assetStatus === 'none'</code>{' '}
            时可编辑。一旦确认「提取角色与场景」，整步回到只读并出现锁标识——这条现状就是对的，不改。
          </>,
          <>
            浮层底栏结构不动（<code className="text-white/80">border-t border-white/10 pt-2</code>
            ），只把左侧从「只读」换成「自动保存」+ 复用 <code className="text-white/80">SaveBadge</code>，
            与 Step4 行内编辑器的底栏完全一致，用户在两处看到的是同一套反馈。
          </>,
          <>
            自动保存直接复用 <code className="text-white/80">src/hooks/useAutoSave.ts</code>
            （0.7s 防抖，收起时 flush），不再写第二套。
          </>,
        ]}
      />

      <Notes
        title="落地影响：正文改了，后面已生成的东西怎么办"
        items={[
          <>
            仓库里已有成熟机制可直接沿用：<code className="text-white/80">updateShot()</code> 在镜头字段变化时会把该镜头的视频标{' '}
            <code className="text-white/80">video.stale = true</code>，Step4 表格随即显示琥珀色「需重新生成」。
          </>,
          <>
            正文编辑应接同一条链路：<span className="text-white/90">segments[].text 变更 → 该段落已生成的镜头标脏 → 这些镜头的视频标脏</span>
            。上面卡片里那条琥珀「需重新生成镜头」就是这个提示的位置。
          </>,
          <>
            <span className="text-white/90">只标脏，不自动删除、不自动重生成</span>
            ——旧镜头和旧视频仍可查看下载，由用户决定是否重新生成，与第 6 条「保留现场」的原则一致。
          </>,
        ]}
      />
      {toastNode}
    </Issue>
  )
}
