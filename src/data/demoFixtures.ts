import data from './demoFixtures.json'
import type { Asset, Segment, Shot } from '@/types'
import { cleanScript, comparable } from '@/services/validation'

interface DemoFixture {
  id: string
  name: string
  script: string
  style: string
  segments: Segment[]
  assets: Asset[]
  shots: (Pick<Shot, 'no' | 'shot' | 'timeline' | 'action' | 'anchor' | 'motion' | 'blocking' | 'subject' | 'continuity' | 'forbid' | 'background'> & { assetNames: string[] })[]
}

// Sanitized text outputs from successful local model runs. No account data or media history.
export const demoFixtures = data as DemoFixture[]
export const sameScript = (a: string, b: string) => comparable(cleanScript(a)) === comparable(cleanScript(b))
export const findDemoFixture = (script: string) => demoFixtures.find(f => sameScript(f.script, script))
