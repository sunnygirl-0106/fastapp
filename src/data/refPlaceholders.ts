const sizes: Record<string, [number, number]> = {
  '16:9': [1600, 900], '9:16': [900, 1600], '1:1': [1200, 1200],
  '4:3': [1200, 900], '3:4': [900, 1200],
}
const escapeXml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))

// Native dimensions also determine the lightbox's natural aspect ratio.
export function refPlaceholder(kind: 'char' | 'scene', ratio: string, name: string): string {
  if (!sizes[ratio]) ratio = '16:9'
  const [width, height] = sizes[ratio]
  const label = (x: number, y: number, text: string, anchor = 'middle', size = 30) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="#b4bdc8" font-size="${size}">${escapeXml(text)}</text>`
  const person = (x: number, y: number, scale: number, side = false) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="#76838d">
    <ellipse cy="-150" rx="${side ? 27 : 36}" ry="42" />
    <path d="M-27-100 Q-58-99-63-65 L-78 55 Q-78 72-62 72 L-40-28 L-37 72 L-43 218 L-9 218 L0 80 L9 218 L43 218 L37 72 L40-28 L62 72 Q78 72 78 55 L63-65 Q58-99 27-100Z" transform="scale(${side ? 0.6 : 1} 1)" />
  </g>`
  const room = (x: number, y: number, w: number, h: number, view = 0) => {
    const left = view === 1 ? 0.18 : view === 2 ? 0.4 : 0.28
    return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 600 330">
      <rect width="600" height="330" rx="12" fill="#252d32" />
      <g fill="none" stroke="#697b80" stroke-width="4">
        <rect x="${left * 600}" y="55" width="220" height="175" />
        <path d="M0 0 L${left * 600} 55 M600 0 L${left * 600 + 220} 55 M0 330 L${left * 600} 230 M600 330 L${left * 600 + 220} 230" />
        <rect x="${left * 600 + (view === 3 ? 140 : 25)}" y="120" width="55" height="110" />
        <rect x="${left * 600 + (view === 3 ? 25 : 120)}" y="90" width="65" height="60" />
        <path d="M50 290 H550 M${left * 600 + 80} 230 L180 330 M${left * 600 + 160} 230 L420 330" />
      </g></svg>`
  }
  let drawing = ''
  if (kind === 'char' && ratio === '16:9') {
    drawing = `<path d="M640 115V780" stroke="#3e4953" stroke-width="3" />
      <circle cx="320" cy="345" r="118" fill="#84929b" />
      <path d="M100 680 Q100 500 320 500 Q540 500 540 680Z" fill="#63727e" />`
    ;[800, 1100, 1400].forEach((x, i) => { drawing += person(x, 400, 1.25, i === 1) + label(x, 755, ['正面', '侧面', '背面'][i]) })
  } else if (kind === 'char') {
    drawing = person(width / 2, height * 0.48, Math.min(width / 330, (height - 240) / 440))
  } else if (ratio === '16:9') {
    ;['1 正面', '2 左前 45°', '3 右前 45°', '4 反向'].forEach((text, i) => {
      const x = 65 + (i % 2) * 760, y = 115 + Math.floor(i / 2) * 355
      drawing += room(x, y, 710, 295, i) + label(x + 355, y + 325, text)
    })
  } else {
    drawing = room(60, height * 0.2, width - 120, height * 0.6)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#1b222a" />
    <g font-family="system-ui, sans-serif">${drawing}${label(42, 65, name, 'start', 36)}${label(width - 42, height - 35, ratio, 'end', 32)}</g>
  </svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
