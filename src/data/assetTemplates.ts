import type { Asset } from '@/types'

// 直接使用用户填写的参考图描述，不额外追加固定版式。
export function buildAssetImagePrompt(a: Asset): string {
  return a.prompt
}
