import { TIERS, type Tier } from './lib/types'

export type TierSetting = Tier | 'auto'

/** Overrides loaded from `/config.js` (window.__MDR_CONFIG__), so one build can serve every environment. */
export interface RuntimeConfig {
  /** Folder that contains `models/` and `snapshots/`: same origin by default, or a CDN / blob storage URL. */
  assetsBaseUrl?: string
  /** Which model version to load: auto | high | medium | low. */
  modelTier?: string
}

declare global {
  interface Window {
    __MDR_CONFIG__?: RuntimeConfig
  }
}

export const parseTier = (value: unknown): TierSetting | undefined =>
  value === 'auto' || TIERS.includes(value as Tier) ? (value as TierSetting) : undefined

const withTrailingSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`)

export function resolveConfig(runtime: RuntimeConfig, env: ImportMetaEnv) {
  return {
    assetsBaseUrl: withTrailingSlash(runtime.assetsBaseUrl || env.VITE_ASSETS_BASE_URL || env.BASE_URL || '/'),
    modelTier: parseTier(runtime.modelTier) ?? parseTier(env.VITE_MODEL_TIER) ?? 'auto',
  }
}

export const config = resolveConfig((typeof window !== 'undefined' && window.__MDR_CONFIG__) || {}, import.meta.env)
