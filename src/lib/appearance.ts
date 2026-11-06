// Shared by the app and the asset scripts.

/**
 * The source models are authored with albedos at roughly half of their real-world brightness (the white
 * chair shell is ~0.39 linear) and look right under the studio lighting used by the viewer. Colors in
 * products.json describe how a surface should *look*, so dielectric colors are multiplied by this factor
 * (in linear space) before being used as albedo, which keeps new colors consistent with the original ones.
 * Metal finish colors (metalness >= 0.5) are physical reflectance values and are used as-is.
 */
export const ALBEDO_SCALE = 0.5

export const isMetallic = (metalness: number | undefined) => (metalness ?? 0) >= 0.5

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const formatHex = (rgb: number[]) =>
  `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`

/** Perceived sRGB color → linear albedo. */
export const perceivedToAlbedo = (hex: string, metalness?: number) =>
  parseHex(hex).map((c) => toLinear(c) * (isMetallic(metalness) ? 1 : ALBEDO_SCALE)) as [number, number, number]

/** Albedo stored in a model (sRGB hex) → the color it is perceived as in the viewer (for UI swatches). */
export const albedoToPerceived = (hex: string, metalness?: number) =>
  formatHex(parseHex(hex).map((c) => toSrgb(toLinear(c) / (isMetallic(metalness) ? 1 : ALBEDO_SCALE))))

/** Perceived sRGB color → sRGB albedo hex (used when baking textures). */
export const perceivedToAlbedoHex = (hex: string) => formatHex(perceivedToAlbedo(hex).map(toSrgb))
