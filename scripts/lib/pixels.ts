import type { Texture } from '@gltf-transform/core'
import sharp from 'sharp'

/** Decoded RGBA image. */
export interface Pixels {
  data: Uint8Array
  width: number
  height: number
  /** Whether the source image carries a meaningful alpha channel. */
  hasAlpha: boolean
}

const cache = new WeakMap<Texture, Promise<Pixels>>()

export function decodeTexture(texture: Texture): Promise<Pixels> {
  let pending = cache.get(texture)
  if (!pending) {
    pending = decode(texture.getImage()!)
    cache.set(texture, pending)
  }
  return pending
}

async function decode(image: Uint8Array): Promise<Pixels> {
  const img = sharp(image)
  const meta = await img.metadata()
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height, hasAlpha: !!meta.hasAlpha }
}

/** Texel index for a UV coordinate (glTF: origin top-left, repeat wrapping). */
export function texelIndex(px: Pixels, u: number, v: number) {
  const wu = u >= 0 && u <= 1 ? u : u - Math.floor(u)
  const wv = v >= 0 && v <= 1 ? v : v - Math.floor(v)
  const x = Math.min(px.width - 1, Math.floor(wu * px.width))
  const y = Math.min(px.height - 1, Math.floor(wv * px.height))
  return y * px.width + x
}

export function encodePng(px: Pixels, grayscale = false) {
  const channels = grayscale ? (px.hasAlpha ? 2 : 1) : px.hasAlpha ? 4 : 3
  const out = new Uint8Array(px.width * px.height * channels)
  for (let i = 0, o = 0; i < px.data.length; i += 4) {
    out[o++] = px.data[i]
    if (!grayscale) {
      out[o++] = px.data[i + 1]
      out[o++] = px.data[i + 2]
    }
    if (px.hasAlpha) out[o++] = px.data[i + 3]
  }
  return sharp(out, { raw: { width: px.width, height: px.height, channels: channels as 1 | 2 | 3 | 4 } })
    .png({ compressionLevel: 9, effort: 8 })
    .toBuffer()
}
