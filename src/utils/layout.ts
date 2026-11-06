// Geometry APIs return viewport pixels; persisted design sizes use a 16px baseline.
export function getUiScale(): number {
  if (typeof window === 'undefined') return 1
  return (parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16) / 16
}
