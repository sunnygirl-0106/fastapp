import { MODELS, COST } from '@/services/generation'
import { FakeSelect, GenerateConfirmModal, Label } from '@/components/ui'

export default function VideoConfirmModal({
  count,
  balance,
  onClose,
  onConfirm,
}: {
  count: number
  balance: number
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <GenerateConfirmModal
      title="确认生成视频"
      what={`将为选中的 ${count} 个镜头生成视频。`}
      count={`${count} 段视频`}
      modelLabel="视频模型"
      model={MODELS.video}
      cost={count * COST.videoEach}
      balance={balance}
      confirmText={`确认并生成 ${count} 段视频`}
      width={520}
      onClose={onClose}
      onConfirm={onConfirm}
      extra={
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
      }
    />
  )
}
