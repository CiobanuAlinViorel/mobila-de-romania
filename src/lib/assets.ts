import { config, parseTier, type TierSetting } from '../config'
import type { Tier } from './types'

/** Absolute or root-relative URL of a generated asset (paths in the manifests are relative to the base). */
export const assetUrl = (path: string) => `${config.assetsBaseUrl}${path}`

type NetworkInfo = { saveData?: boolean; effectiveType?: string }

/** Picks the lighter version on data-saver / slow connections and low-memory devices. */
export function autoTier(): Tier {
  const nav = navigator as Navigator & { connection?: NetworkInfo; deviceMemory?: number }
  const connection = nav.connection
  if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')) return 'low'
  if ((nav.deviceMemory ?? 8) <= 2) return 'low'
  return 'medium'
}

export const resolveTier = (setting: TierSetting): Tier => (setting === 'auto' ? autoTier() : setting)

const STORAGE_KEY = 'mdr.modelTier'

/** Quality chosen by the visitor (URL `?q=` > saved choice > environment config). */
export function initialTierSetting(search: URLSearchParams): TierSetting {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode, sandboxed iframes).
  }
  return parseTier(search.get('q')) ?? parseTier(saved) ?? config.modelTier
}

export function saveTierSetting(setting: TierSetting) {
  try {
    localStorage.setItem(STORAGE_KEY, setting)
  } catch {
    // Ignore: the choice simply won't be remembered.
  }
}
