import type { Accessor, Document, Material, Primitive } from '@gltf-transform/core'
import { perceivedToAlbedoHex } from '../../src/lib/appearance.ts'
import type { Catalog, MaterialTag, PartEntry, Product, ProductPart, Range, TexelSelector } from '../../src/lib/types.ts'
import { SRGB_TO_LINEAR, describe, hexToRgb, linearToHex, linearToSrgb, luminance, rgbToHex, type RGB } from './color.ts'
import { extractTriangles, rasterizeUV, triangleIndices } from './geometry.ts'
import { decodeTexture, encodePng, texelIndex, type Pixels } from './pixels.ts'

export interface BakedFinish {
  part: string
  material: string
  finish: string
  pixels: Pixels
}

export interface PartsResult {
  parts: Record<string, Omit<PartEntry, 'textures'>>
  finishes: BakedFinish[]
}

const inRange = (range: Range | undefined, x: number) => !range || (x >= range[0] && x <= range[1])

function readFloats(accessor: Accessor): Float32Array {
  const size = accessor.getElementSize()
  const out = new Float32Array(accessor.getCount() * size)
  const el: number[] = []
  for (let i = 0; i < accessor.getCount(); i++) out.set(accessor.getElement(i, el), i * size)
  return out
}

export function applyMaterialOverrides(doc: Document, product: Product) {
  for (const [name, o] of Object.entries(product.model.materials ?? {})) {
    const mat = doc.getRoot().listMaterials().find((m) => m.getName() === name)
    if (!mat) throw new Error(`${product.slug}: material "${name}" not found in ${product.model.source}`)
    if (o.alphaMode) mat.setAlphaMode(o.alphaMode)
    if (o.alphaCutoff !== undefined) mat.setAlphaCutoff(o.alphaCutoff)
    if (o.metalness !== undefined) mat.setMetallicFactor(o.metalness)
    if (o.roughness !== undefined) mat.setRoughnessFactor(o.roughness)
    if (o.doubleSided !== undefined) mat.setDoubleSided(o.doubleSided)
  }
}

/** Splits the customizable parts into their own primitives/materials and prepares them for runtime changes. */
export async function applyParts(doc: Document, product: Product, catalog: Catalog): Promise<PartsResult> {
  const sourceNames = new Set(doc.getRoot().listMaterials().map((m) => m.getName()))
  const prims = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((prim) => ({ mesh, prim })))
  const claims = new Map(prims.map(({ prim }) => [prim, new Int16Array(triangleIndices(prim).length / 3).fill(-1)]))

  // 1. Classify triangles.
  for (const [pi, part] of product.parts.entries()) {
    const sel = part.select
    for (const name of sel.materials ?? []) {
      if (!sourceNames.has(name)) throw new Error(`${product.slug}/${part.id}: material "${name}" not found`)
    }
    for (const { prim } of prims) {
      const mat = prim.getMaterial()
      if (sel.materials && !sel.materials.includes(mat?.getName() ?? '')) continue
      const claim = claims.get(prim)!
      const tri = triangleIndices(prim)
      const pos = sel.y ? readFloats(prim.getAttribute('POSITION')!) : null
      const uvAttr = prim.getAttribute('TEXCOORD_0')
      const uv = sel.texel && uvAttr ? readFloats(uvAttr) : null
      const baseTex = mat?.getBaseColorTexture()
      const mrTex = mat?.getMetallicRoughnessTexture()
      const base = sel.texel && baseTex ? await decodeTexture(baseTex) : null
      const mr = sel.texel && (sel.texel.metal || sel.texel.rough) && mrTex ? await decodeTexture(mrTex) : null
      const factor = (mat?.getBaseColorFactor().slice(0, 3) ?? [1, 1, 1]).map(linearToSrgb) as RGB

      for (let t = 0; t < claim.length; t++) {
        if (claim[t] !== -1) continue
        const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2]
        if (pos && sel.y) {
          const cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3
          if (!inRange(sel.y, cy)) continue
        }
        if (sel.texel && !matchTriangle(sel.texel, base, mr, uv, factor, a, b, c)) continue
        claim[t] = pi
      }
    }
  }

  // 2. Split primitives so that every part has its own material(s).
  const partMaterials = product.parts.map(() => new Map<Material, Material>())
  const partTriangles = product.parts.map(() => 0)
  for (const { mesh, prim } of prims) {
    const claim = claims.get(prim)!
    const groups = new Map<number, number[]>()
    claim.forEach((pi, t) => {
      const list = groups.get(pi)
      if (list) list.push(t)
      else groups.set(pi, [t])
    })
    if (!groups.has(-1) && groups.size === 1) {
      const [pi] = groups.keys()
      prim.setMaterial(partMaterial(product.parts[pi], partMaterials[pi], prim.getMaterial()!))
      partTriangles[pi] += claim.length
      continue
    }
    if (groups.size === 1) continue
    for (const [pi, tris] of groups) {
      const split = extractTriangles(doc, prim, tris)
      if (pi >= 0) {
        split.setMaterial(partMaterial(product.parts[pi], partMaterials[pi], prim.getMaterial()!))
        partTriangles[pi] += tris.length
      }
      mesh.addPrimitive(split)
    }
    mesh.removePrimitive(prim)
    prim.dispose()
  }

  // 3. Prepare each part material for its customization type.
  const result: PartsResult = { parts: {}, finishes: [] }
  for (const [pi, part] of product.parts.entries()) {
    if (!partTriangles[pi]) throw new Error(`${product.slug}/${part.id}: the selector did not match any triangle`)
    const swatches: string[][] = []
    for (const material of partMaterials[pi].values()) {
      const users = material
        .listParents()
        .filter((p): p is Primitive => p.propertyType === 'Primitive')
      swatches.push(await preparePart(doc, product, part, material, users, catalog, result.finishes))
    }
    result.parts[part.id] = { type: part.type, swatch: swatches[0], triangles: partTriangles[pi] }
  }
  return result
}

function partMaterial(part: ProductPart, cache: Map<Material, Material>, source: Material): Material {
  let mat = cache.get(source)
  if (!mat) {
    mat = source.clone().setName(`mdr-${part.id}-${cache.size}`)
    const tag: MaterialTag = { part: part.id, type: part.type, scale: 1, source: source.getName() }
    mat.setExtras({ ...source.getExtras(), mdr: tag })
    cache.set(source, mat)
  }
  return mat
}

function matchTriangle(
  sel: TexelSelector,
  base: Pixels | null,
  mr: Pixels | null,
  uv: Float32Array | null,
  factor: RGB,
  a: number,
  b: number,
  c: number,
) {
  if (!uv || !base) return matchTexel(sel, factor, null)
  const cu = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3
  const cv = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3
  let hits = 0
  for (const [u, v] of [
    [cu, cv],
    [(cu + uv[a * 2]) / 2, (cv + uv[a * 2 + 1]) / 2],
    [(cu + uv[b * 2]) / 2, (cv + uv[b * 2 + 1]) / 2],
    [(cu + uv[c * 2]) / 2, (cv + uv[c * 2 + 1]) / 2],
  ]) {
    const i = texelIndex(base, u, v) * 4
    const rgb: RGB = [base.data[i] / 255, base.data[i + 1] / 255, base.data[i + 2] / 255]
    const j = mr ? texelIndex(mr, u, v) * 4 : -1
    if (matchTexel(sel, rgb, mr && j >= 0 ? [mr.data[j + 2] / 255, mr.data[j + 1] / 255] : null)) hits++
  }
  return hits >= 2
}

function matchTexel(sel: TexelSelector, rgb: RGB, metalRough: [number, number] | null) {
  const { lum, sat, hue } = describe(...rgb)
  if (!inRange(sel.lum, lum) || !inRange(sel.sat, sat) || !inRange(sel.hue, hue)) return false
  if (metalRough && (!inRange(sel.metal, metalRough[0]) || !inRange(sel.rough, metalRough[1]))) return false
  return true
}

/** Texels of a texture (w × h) that are used by the given primitives. */
function coverage(prims: Primitive[], w: number, h: number) {
  const mask = new Uint8Array(w * h)
  const u = [0, 0, 0], v = [0, 0, 0]
  for (const prim of prims) {
    const uv = readFloats(prim.getAttribute('TEXCOORD_0')!)
    const tri = triangleIndices(prim)
    for (let t = 0; t < tri.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        u[k] = uv[tri[t + k] * 2]
        v[k] = uv[tri[t + k] * 2 + 1]
      }
      rasterizeUV(mask, w, h, u, v)
    }
  }
  return mask
}

function colorStats(px: Pixels, mask: Uint8Array, factor: RGB) {
  let n = 0, sum = 0, sum2 = 0, r = 0, g = 0, b = 0
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    const i = p * 4
    const lr = SRGB_TO_LINEAR[px.data[i]], lg = SRGB_TO_LINEAR[px.data[i + 1]], lb = SRGB_TO_LINEAR[px.data[i + 2]]
    const l = luminance(lr, lg, lb)
    n++
    sum += l
    sum2 += l * l
    r += lr
    g += lg
    b += lb
  }
  const mean = sum / n
  return {
    mean,
    variation: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) / Math.max(mean, 1e-6),
    color: [(r / n) * factor[0], (g / n) * factor[1], (b / n) * factor[2]] as RGB,
  }
}

function averageChannel(px: Pixels, mask: Uint8Array, channel: number) {
  let n = 0, sum = 0
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    sum += px.data[p * 4 + channel] / 255
    n++
  }
  return n ? sum / n : 1
}

/**
 * Prepares a part material for its customization type and returns the swatch of the original look.
 * - wood: bakes one gradient-mapped base color texture per finish (served next to the model);
 * - metal: flattens the surface to factors so finishes can set color / metalness / roughness exactly;
 * - color: replaces the base color by a neutral luminance texture so that `material.color` alone defines
 *   the hue while the fabric / leather detail is kept.
 */
async function preparePart(
  doc: Document,
  product: Product,
  part: ProductPart,
  material: Material,
  prims: Primitive[],
  catalog: Catalog,
  finishes: BakedFinish[],
): Promise<string[]> {
  const tag = material.getExtras().mdr as MaterialTag
  const baseTex = material.getBaseColorTexture()
  const texCoord = material.getBaseColorTextureInfo()?.getTexCoord() ?? 0
  if (baseTex && texCoord !== 0) throw new Error(`${product.slug}/${part.id}: only TEXCOORD_0 textures are supported`)
  const factor = material.getBaseColorFactor()
  const base = baseTex ? await decodeTexture(baseTex) : null
  const mask = base ? coverage(prims, base.width, base.height) : null
  const pbrOverride = part.metalness !== undefined || part.roughness !== undefined

  if (part.type === 'wood') {
    if (!base || !mask) throw new Error(`${product.slug}/${part.id}: wood parts need a base color texture`)
    const { lo, hi, dark, light } = woodStats(base, mask)
    for (const finish of part.options) {
      if (finish === 'original') continue
      const def = catalog.finishes.wood[finish]
      if (!def) throw new Error(`${product.slug}/${part.id}: unknown wood finish "${finish}"`)
      const pixels = gradientMap(base, lo, hi, perceivedToAlbedoHex(def.dark), perceivedToAlbedoHex(def.light))
      finishes.push({ part: part.id, material: material.getName(), finish, pixels })
    }
    if (pbrOverride) applyPbrOverride(material, part)
    return [dark, light]
  }

  if (part.type === 'metal') {
    for (const finish of part.options) {
      if (finish !== 'original' && !catalog.finishes.metal[finish]) {
        throw new Error(`${product.slug}/${part.id}: unknown metal finish "${finish}"`)
      }
    }
    const color = base && mask ? colorStats(base, mask, factor.slice(0, 3) as RGB).color : (factor.slice(0, 3) as RGB)
    material.setBaseColorTexture(null).setBaseColorFactor([...color, factor[3]])
    const mrTex = material.getMetallicRoughnessTexture()
    if (mrTex) {
      const mr = await decodeTexture(mrTex)
      const mrMask = coverage(prims, mr.width, mr.height)
      material
        .setMetallicFactor(material.getMetallicFactor() * averageChannel(mr, mrMask, 2))
        .setRoughnessFactor(material.getRoughnessFactor() * averageChannel(mr, mrMask, 1))
        .setMetallicRoughnessTexture(null)
    }
    applyPbrOverride(material, part)
    return [linearToHex(color)]
  }

  // Color part.
  if (pbrOverride) applyPbrOverride(material, part)
  if (!base || !mask) return [linearToHex(factor.slice(0, 3) as RGB)]
  const stats = colorStats(base, mask, factor.slice(0, 3) as RGB)
  if (stats.variation < 0.04) {
    material.setBaseColorTexture(null).setBaseColorFactor([...stats.color, factor[3]])
    return [linearToHex(stats.color)]
  }
  // Neutral texel = scale × relative luminance, so that factor × texel reproduces the original average color.
  const scale = Math.max(0.5, ...stats.color)
  const detail = part.detail ?? 1
  const neutral = new Uint8Array(base.data.length)
  for (let i = 0; i < base.data.length; i += 4) {
    const l = luminance(SRGB_TO_LINEAR[base.data[i]], SRGB_TO_LINEAR[base.data[i + 1]], SRGB_TO_LINEAR[base.data[i + 2]])
    const n = Math.min(1, Math.max(0, scale * (1 + detail * (l / stats.mean - 1))))
    neutral[i] = neutral[i + 1] = neutral[i + 2] = Math.round(linearToSrgb(n) * 255)
    neutral[i + 3] = base.data[i + 3]
  }
  const texture = doc
    .createTexture(`${material.getName()}-neutral`)
    .setMimeType('image/png')
    .setImage(new Uint8Array(await encodePng({ ...base, data: neutral }, true)))
  material
    .setBaseColorTexture(texture)
    .setBaseColorFactor([stats.color[0] / scale, stats.color[1] / scale, stats.color[2] / scale, factor[3]])
  material.setExtras({ ...material.getExtras(), mdr: { ...tag, scale } satisfies MaterialTag })
  return [linearToHex(stats.color)]
}

function applyPbrOverride(material: Material, part: ProductPart) {
  if (part.metalness === undefined && part.roughness === undefined) return
  material.setMetallicRoughnessTexture(null)
  if (part.metalness !== undefined) material.setMetallicFactor(part.metalness)
  if (part.roughness !== undefined) material.setRoughnessFactor(part.roughness)
}

/** Luminance percentiles of the wood grain (sRGB, 0–255) and a [dark, light] swatch of the original look. */
function woodStats(px: Pixels, mask: Uint8Array) {
  const hist = new Uint32Array(256)
  let n = 0
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    const i = p * 4
    hist[Math.round(luminance(px.data[i], px.data[i + 1], px.data[i + 2]))]++
    n++
  }
  const percentile = (q: number) => {
    let acc = 0
    for (let y = 0; y < 256; y++) if ((acc += hist[y]) >= q * n) return y
    return 255
  }
  const lo = percentile(0.02), hi = Math.max(percentile(0.98), lo + 1), median = percentile(0.5)
  const dark = [0, 0, 0, 0], light = [0, 0, 0, 0]
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    const i = p * 4
    const bucket = luminance(px.data[i], px.data[i + 1], px.data[i + 2]) <= median ? dark : light
    bucket[0] += px.data[i]
    bucket[1] += px.data[i + 1]
    bucket[2] += px.data[i + 2]
    bucket[3]++
  }
  const hex = (s: number[]) => rgbToHex([s[0], s[1], s[2]].map((c) => c / Math.max(1, s[3]) / 255) as RGB)
  return { lo, hi, dark: hex(dark), light: hex(light) }
}

/** Re-tints the grain: luminance between the percentiles is mapped onto the finish's dark → light colors. */
function gradientMap(px: Pixels, lo: number, hi: number, darkHex: string, lightHex: string): Pixels {
  const dark = hexToRgb(darkHex), light = hexToRgb(lightHex)
  const out = new Uint8Array(px.data.length)
  for (let i = 0; i < px.data.length; i += 4) {
    const t = Math.min(1, Math.max(0, (luminance(px.data[i], px.data[i + 1], px.data[i + 2]) - lo) / (hi - lo)))
    for (let c = 0; c < 3; c++) out[i + c] = Math.round((dark[c] + (light[c] - dark[c]) * t) * 255)
    out[i + 3] = px.data[i + 3]
  }
  return { ...px, data: out }
}
