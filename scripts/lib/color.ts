export type RGB = [number, number, number]

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** Lookup table: 8-bit sRGB value → linear 0–1. */
export const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255))

export const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function hexToRgb(hex: string): RGB {
  const v = hex.replace('#', '')
  const n = Number.parseInt(v.length === 3 ? [...v].map((c) => c + c).join('') : v, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const rgbToHex = (rgb: RGB) =>
  `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`

export const linearToHex = (rgb: RGB) => rgbToHex(rgb.map(linearToSrgb) as RGB)

/** Hue (degrees), saturation and value-based measures used by texel selectors (input sRGB 0–1). */
export function describe(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let hue = 0
  if (d > 0) {
    if (max === r) hue = ((g - b) / d + 6) % 6
    else if (max === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
  }
  return { lum: luminance(r, g, b), sat: max === 0 ? 0 : d / max, hue: hue * 60 }
}
