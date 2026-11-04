import type { Asset } from '@/types'

const CHARACTER_SUFFIX = '角色三视图参考图，纯白背景，横向布局。左侧为全身转面视图（正面、侧面、背面），右侧为头部多角度特写和服装细节特写。所有视图中的面部、发型、身体比例和服装保持一致，均为同一人物。中性摄影棚灯光，写实人脸与真实皮肤纹理。无其他人物，无文字，无水印，无背景场景。'

// 文档模板 A / B：用户参考图描述优先，空白时回退到设定描述。
export function buildAssetImagePrompt(a: Asset): string {
  const description = a.prompt.trim() ? a.prompt : a.desc
  if (a.kind === 'char') return [description, CHARACTER_SUFFIX].filter(Boolean).join('\n')
  return [
    '无人物空场景参考图。只生成环境空间、建筑结构、陈设、灯光和氛围，禁止出现人物、人影、背影、手脚、镜中人和窗外人影。',
    `场景名：${a.name}。`,
    description,
    '同一部剧统一摄影体系：统一年代质感、颗粒与清晰度、对比关系和色温倾向，不要每张场景图换一种滤镜。',
  ].filter(Boolean).join('\n')
}
