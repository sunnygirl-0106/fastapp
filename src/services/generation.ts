// mock 生成/计费服务 —— 唯一替换点：日后把 delay() 换成真实 API 请求即可

export const COST = {
  segGen: 50, // 拆解故事           → ✦50
  assetExtract: 250, // 提取角色与场景     → ✦250
  assetImgEach: 55, // 单张参考图         → 3 张 = ✦165
  shotGenEach: 50, // 每段镜头           → 3 段 = ✦150
  videoEach: 2363, // 每段视频           → 3 段 = ✦7,089
} as const

// 模型名集中管理，所有确认弹窗统一引用
export const MODELS = {
  text: '灵犀 3.1 Pro',
  image: 'Phan Image 2',
  video: 'Seedance 2.0',
} as const

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// 生成参考图/视频用的"缩略图"（mock 用 data-uri SVG，纯前端可离线）
export function mockImage(label: string, seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  const h2 = (h + 40) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h} 45% 30%)"/>
      <stop offset="1" stop-color="hsl(${h2} 40% 15%)"/>
    </linearGradient></defs>
    <rect width="480" height="300" fill="url(#g)"/>
    <text x="50%" y="50%" fill="rgba(255,255,255,.55)" font-family="sans-serif"
      font-size="20" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

let seq = 0
export function uid(prefix = 'id'): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}`
}
