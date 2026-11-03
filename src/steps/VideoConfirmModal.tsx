import type { Shot } from '@/types'
import { VIDEO_DUR_SPEC, supportsDuration } from '@/data/duration'
import { no2 } from '@/utils/project'
import NoticeBar from '@/components/NoticeBar'
import { useEffect, useState } from 'react'
import { MODELS, MODEL_OPTIONS, videoCost } from '@/services/generation'
import { FakeSelect, GenerateConfirmModal, Label, ModelSelect } from '@/components/ui'

export default function VideoConfirmModal({
  shots,
  balance,
  onClose,
  onConfirm,
}: {
  shots: Shot[]
  balance: number
  onClose: () => void
  onConfirm: () => void
}) {
  const [model, setModel] = useState<string>(MODELS.video)

  const count = shots.length
  const outdated = shots.filter((s) => s.outdated?.length)
  const disabledOptions: Record<string, string> = {}
  MODEL_OPTIONS.video.forEach((option) => {
    const unsupported = shots.filter((s) => !supportsDuration(option, s.dur))
    if (!unsupported.length) return
    const spec = VIDEO_DUR_SPEC[option]
    disabledOptions[option] = 'options' in spec ? `${option} 仅支持 5 秒或 10 秒`
      : unsupported.length === 1 ? `镜头 ${no2(unsupported[0].no)}（${unsupported[0].dur} 秒）超出 ${option} 的 ${spec.max} 秒上限`
      : `镜头 ${unsupported.slice(0, 2).map((s) => no2(s.no)).join('、')} 等 ${unsupported.length} 个镜头超出 ${option} 的 ${spec.max} 秒上限`
  })
  const selectedModel = disabledOptions[model] ? MODELS.video : model
  useEffect(() => { if (disabledOptions[model]) setModel(MODELS.video) }, [model, shots])
  const shotList = outdated.slice(0, 3).map((s) => `镜头 ${no2(s.no)}`).join('、') + (outdated.length > 3 ? ` 等 ${outdated.length} 个` : '')
  return (
    <GenerateConfirmModal
      title="确认生成视频"
      what={`将为选中的 ${count} 个镜头生成视频。`}
      count={`${count} 段视频 · 共 ${shots.reduce((n, s) => n + s.dur, 0)} 秒`}
      modelLabel="视频模型"
      model={
        <ModelSelect disabledOptions={disabledOptions} value={selectedModel} options={MODEL_OPTIONS.video} onChange={setModel} variant="field" width={220} />
      }
      cost={shots.reduce((n, s) => n + videoCost(s.dur), 0)}
      balance={balance}
      confirmText={`确认并生成 ${count} 段视频`}
      width={520}
      onClose={onClose}
      onConfirm={onConfirm}
      extra={
        <>
        {outdated.length > 0 && <NoticeBar>其中 {outdated.length} 个镜头描述待更新（{shotList}），仍会按旧描述生成。</NoticeBar>}
        <div className="grid grid-cols-3 gap-4 text-[13px]">
          <div>
            <Label>分辨率</Label>
            <FakeSelect value="720p" />
          </div>
          <div>
            <Label>画面比例</Label>
            <FakeSelect value="9:16" />
          </div>
          <div>
            <Label>配音</Label>
            <label className="flex items-center gap-2 pt-2">
              <input type="checkbox" defaultChecked className="accent-brand" />
              <span>生成配音</span>
            </label>
          </div>
        </div>
        </>
      }
    />
  )
}
