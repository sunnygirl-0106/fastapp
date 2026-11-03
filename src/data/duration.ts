export const DUR_MIN = 4
export const DUR_DEFAULT = 15
export const VIDEO_DUR_SPEC: Record<string, { min: number; max: number } | { options: number[] }> = {
  'Seedance 2.5': { min: 4, max: 30 },
  'Seedance 2.0': { min: 4, max: 15 },
  'Seedance 1.5': { min: 4, max: 12 },
  'Kling 2.1': { options: [5, 10] },
}
export const DUR_MAX = Math.max(...Object.values(VIDEO_DUR_SPEC).flatMap((spec) => 'max' in spec ? [spec.max] : []))
export const clampTargetDuration = (n: number) => Math.min(600, Math.max(4, Math.round(Number.isFinite(n) ? n : 60)))
export const clampDuration = (n: number) => Math.min(DUR_MAX, Math.max(DUR_MIN, Math.round(Number.isFinite(n) ? n : DUR_DEFAULT)))
export function supportsDuration(model: string, dur: number) {
  const spec = VIDEO_DUR_SPEC[model]
  return !!spec && ('options' in spec ? spec.options.includes(dur) : dur >= spec.min && dur <= spec.max)
}
