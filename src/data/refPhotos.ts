import landscape from '@/assets/references/character-landscape-16x9.jpg'
import portrait from '@/assets/references/character-portrait-9x16.jpg'
import square from '@/assets/references/scene-square-1x1.jpg'

// Downloaded, fixed-size photo files; rendering never depends on a remote service.
export const refPhotos = { landscape, portrait, square }
export function demoReferencePhoto(kind: 'char' | 'scene', characterIndex = 0): string {
  return kind === 'scene' ? square : characterIndex % 2 ? portrait : landscape
}
// Upgrade only our old bundled mock covers, preserving uploads and generated SVGs.
export const isLegacyReferencePhoto = (url?: string) => !!url && /^(?:\/src\/assets\/placeholders\/frame-[1-6]\.jpg|\/(?:fastapp\/)?assets\/frame-[1-6]-[\w-]+\.jpg)(?:\?.*)?$/.test(url)
