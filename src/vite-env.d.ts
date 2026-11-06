/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time default for the folder that contains `models/` and `snapshots/` (CDN, blob storage, …). */
  readonly VITE_ASSETS_BASE_URL?: string
  /** Build-time default model version: auto | high | medium | low. */
  readonly VITE_MODEL_TIER?: string
}
