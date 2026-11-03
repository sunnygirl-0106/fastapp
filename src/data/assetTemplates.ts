import type { Asset } from '@/types'
export const CHAR_LAYOUT_SUMMARY = '角色四视图：正面半身特写 / 全身正面 / 全身左侧 / 全身背面 · 纯白背景'
export const CHAR_LAYOUT = '角色四视图设定图，横向构图，纯白色背景，中性摄影棚平光，柔和前侧光，轮廓清晰。版式从左到右依次为：正面半身特写、全身正面、全身左侧面、全身背面，四个视图等高并排，全身视图从头顶到鞋底完整入画、不裁切，上下留白。四个视图中的面部、发型、体型、服装与配饰完全一致，比例统一。人物双手自然下垂、空手、自然站姿，无表演动作。不得出现任何道具、背景物体、其他人物、文字、标签、水印或 UI 元素。'
export const SCENE_LAYOUT_SUMMARY = '无人物空景主图：单张主机位全景 · 不出现任何人物'
export const SCENE_LAYOUT = '无人物空场景参考图，单张完整画面，取该场景最常用的主机位，视平线高度，全景构图，空间结构、出入口与主要陈设位置完整可读。只表现环境、建筑结构、家具道具、光线与氛围，保留人物离场后的使用痕迹。禁止出现任何人物、人影、背影、剪影、手脚、镜中人、窗外人影或门口人影。'
export function buildAssetImagePrompt(a: Asset): string {
  return (a.kind === 'char' ? CHAR_LAYOUT : SCENE_LAYOUT) + '\n\n' + a.prompt
}
export const assetPromptPlaceholder = (kind: Asset['kind']) => kind === 'char'
  ? '只写外观：年龄、脸型五官、发型发色、体型、服装款式与材质、标志性特征。版式不用写。'
  : '只写空间：空间结构、主要陈设及位置、光线与时间、材质与使用痕迹。不用写"无人物"。'
