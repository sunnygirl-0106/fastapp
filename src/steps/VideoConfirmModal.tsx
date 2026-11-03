import type { Shot } from '@/types'
import { VIDEO_DUR_SPEC, supportsDuration } from '@/data/duration'
import { no2 } from '@/utils/project'
import NoticeBar from '@/components/NoticeBar'
import { useState } from 'react'
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
  const unsupported = shots.filter((s) => !supportsDuration(model, s.dur))
  const spec = VIDEO_DUR_SPEC[model]
  const supported = spec && ('options' in spec ? spec.options.map((n) => `${n} 秒`).join('或 ') : `${spec.min}–${spec.max} 秒`)
  const shotList = outdated.slice(0, 3).map((s) => `镜头 ${no2(s.no)}`).join('、') + (outdated.length > 3 ? ` 等 ${outdated.length} 个` : '')
  return (
    <GenerateConfirmModal
      title="确认生成视频"
      what={`将为选中的 ${count} 个镜头生成视频。`}
      count={`${count} 段视频 · 共 ${shots.reduce((n, s) => n + s.dur, 0)} 秒`}
      modelLabel="视频模型"
      model={
        <ModelSelect value={model} options={MODEL_OPTIONS.video} onChange={setModel} variant="field" width={220} />
      }
      cost={shots.reduce((n, s) => n + videoCost(s.dur), 0)}
      disabled={unsupported.length > 0}
      balance={balance}
      confirmText={`确认并生成 ${count} 段视频`}
      width={520}
      onClose={onClose}
      onConfirm={onConfirm}
      extra={
        <>
        {unsupported.length > 0 && <div className="mb-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{model} 仅支持 {supported}，{unsupported.map((s) => `镜头 ${no2(s.no)}（${s.dur} 秒）`).join('、')}不支持。请修改镜头时长并重新生成镜头，或换用其他模型。</div>}
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
