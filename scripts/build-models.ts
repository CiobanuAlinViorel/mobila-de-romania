/**
 * Builds the web-ready model versions from the raw files in `assets/`:
 *
 *   high    original textures (PNG/JPEG), uncompressed geometry, no required extensions
 *           -> maximum fidelity and compatibility (Shopify, model-viewer, AR converters, Blender)
 *   medium  WebP q90 textures (normal maps q95, max 2048 px) + meshopt geometry (default on the web)
 *   low     WebP q85 textures (max 512 px) + ~50% simplified meshopt geometry (mobile / slow networks)
 *
 * Every version is normalized (meters, centered, standing on y = 0), has its material bugs fixed and its
 * customizable parts split out (see `parts` in src/data/products.json). Wood finishes are baked into
 * separate textures next to each model.
 *
 * Usage: pnpm models [slug ...]
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Logger, NodeIO, PropertyType, type Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, simplifyPrimitive, textureCompress, weldPrimitive } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import catalogJson from '../src/data/products.json' with { type: 'json' }
import { TIERS, type Catalog, type ModelEntry, type ModelManifest, type Product, type Tier } from '../src/lib/types.ts'
import { normalizeScene } from './lib/geometry.ts'
import { applyMaterialOverrides, applyParts, type BakedFinish } from './lib/parts.ts'

const catalog = catalogJson as unknown as Catalog
const ROOT = path.resolve(import.meta.dirname, '..')
const ASSETS = path.join(ROOT, 'assets')
const PUBLIC = path.join(ROOT, 'public')
const MANIFEST = path.join(ROOT, 'src', 'generated', 'models.json')

const TIER_SPECS: ModelManifest['tiers'] = {
  high: { maxTextureSize: 0, textures: 'PNG/JPEG originale', geometry: 'float32, fără compresie' },
  medium: { maxTextureSize: 2048, textures: 'WebP: culori q92, hărți de date near-lossless', geometry: 'meshopt' },
  low: { maxTextureSize: 512, textures: 'WebP: culori q85, hărți de date near-lossless', geometry: 'meshopt, simplificată ~40%' },
}

/**
 * Color textures tolerate lossy WebP well (≈45 dB at q92). Data textures (normal, metallic-roughness,
 * occlusion, clearcoat…) pack independent values in R/G/B: lossy WebP's chroma subsampling corrupts them at
 * any quality (≤ 38 dB), so they use near-lossless WebP (≈ 50 dB, still ~45% smaller than PNG).
 */
const COLOR_SLOTS = /^(baseColor|emissive|sheenColor|specularColor)Texture$/
const DATA_SLOTS = /^(?!(baseColor|emissive|sheenColor|specularColor)Texture$)/
const TEXTURE_QUALITY = { medium: { color: 92, data: 60 }, low: { color: 85, data: 50 } }

await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 10)
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`.padStart(8)

function countTriangles(doc: Document) {
  let n = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) n += (prim.getIndices() ?? prim.getAttribute('POSITION')!).getCount() / 3
  }
  return n
}

function maxTextureSize(doc: Document) {
  return Math.max(0, ...doc.getRoot().listTextures().map((t) => Math.max(...(t.getSize() ?? [0, 0]))))
}

async function compressTier(glb: Uint8Array, tier: Exclude<Tier, 'high'>) {
  const doc = await io.readBinary(glb)
  doc.setLogger(new Logger(Logger.Verbosity.WARN))
  const size = TIER_SPECS[tier].maxTextureSize
  if (tier === 'low') {
    // Only dense meshes are simplified: low-poly boxes (shelves, cabinets) would only lose UV accuracy.
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if ((prim.getIndices()?.getCount() ?? 0) / 3 < 4000) continue
        weldPrimitive(prim)
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.6, error: 0.0005 })
      }
    }
  }
  const triangles = countTriangles(doc)
  const quality = TEXTURE_QUALITY[tier]
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], slots: COLOR_SLOTS, quality: quality.color }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [size, size],
      slots: DATA_SLOTS,
      nearLossless: true,
      quality: quality.data,
    }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  return { bytes: await io.writeBinary(doc), triangles }
}

async function encodeFinish(finish: BakedFinish, tier: Tier) {
  const { data, width, height, hasAlpha } = finish.pixels
  let img = sharp(data, { raw: { width, height, channels: 4 } })
  if (!hasAlpha) img = img.removeAlpha()
  if (tier === 'high') {
    return hasAlpha
      ? { ext: 'png', data: await img.png({ compressionLevel: 9 }).toBuffer() }
      : { ext: 'jpg', data: await img.jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer() }
  }
  const size = TIER_SPECS[tier].maxTextureSize
  if (width > size || height > size) img = img.resize(size, size, { fit: 'inside', kernel: 'lanczos3' })
  return { ext: 'webp', data: await img.webp({ quality: TEXTURE_QUALITY[tier].color, smartSubsample: true, effort: 6 }).toBuffer() }
}

async function buildProduct(product: Product): Promise<ModelEntry> {
  const doc = await io.read(path.join(ASSETS, product.model.source))
  doc.setLogger(new Logger(Logger.Verbosity.WARN))

  // Cleanup: duplicates, unused UV sets / nodes, solid-color textures (e.g. a 1024² black image).
  // Materials are not deduplicated: part selectors refer to them by their source names.
  await doc.transform(
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }),
    prune({ keepAttributes: false, keepLeaves: false, keepSolidTextures: false }),
  )
  applyMaterialOverrides(doc, product)

  const { min, max } = await normalizeScene(doc, product.model.unitScale ?? 1)
  const size = max.map((v, i) => v - min[i])
  if (size[1] < 0.2 || size[1] > 3) {
    throw new Error(`${product.slug}: height ${size[1].toFixed(2)} m looks wrong, check model.unitScale`)
  }

  const { parts, finishes } = await applyParts(doc, product, catalog)
  await doc.transform(
    prune({ keepAttributes: false, keepLeaves: false }),
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }),
  )
  doc.getRoot().getAsset().generator = 'Mobila de România asset pipeline (glTF-Transform)'
  TIER_SPECS.high.maxTextureSize = Math.max(TIER_SPECS.high.maxTextureSize, maxTextureSize(doc))

  const high = await io.writeBinary(doc)
  const outputs: Record<Tier, { bytes: Uint8Array; triangles: number }> = {
    high: { bytes: high, triangles: countTriangles(doc) },
    medium: await compressTier(high, 'medium'),
    low: await compressTier(high, 'low'),
  }

  const entry: ModelEntry = {
    dimensions: { width: round(size[0] * 100), height: round(size[1] * 100), depth: round(size[2] * 100) },
    files: {} as ModelEntry['files'],
    parts: Object.fromEntries(Object.entries(parts).map(([id, part]) => [id, { ...part }])),
  }

  // File names carry a content hash, so every host / CDN can cache them forever (query strings are not
  // part of the cache key on some CDNs).
  for (const tier of TIERS) {
    const dir = path.join(PUBLIC, 'models', tier)
    await removeOutputs(dir, product.slug)
    await mkdir(path.join(dir, product.slug), { recursive: true })
    const { bytes, triangles } = outputs[tier]
    const file = `${product.slug}.${hash(bytes)}.glb`
    await writeFile(path.join(dir, file), bytes)
    entry.files[tier] = { path: `models/${tier}/${file}`, bytes: bytes.byteLength, triangles }

    for (const finish of finishes) {
      const { ext, data } = await encodeFinish(finish, tier)
      // Part materials are named `mdr-<part>-<n>`.
      const texture = `${finish.material.replace(/^mdr-/, '')}-${finish.finish}.${hash(data)}.${ext}`
      await writeFile(path.join(dir, product.slug, texture), data)
      const part = entry.parts[finish.part]
      part.textures ??= {}
      part.textures[finish.finish] ??= {} as Record<Tier, Record<string, string>>
      part.textures[finish.finish][tier] ??= {}
      part.textures[finish.finish][tier][finish.material] = `models/${tier}/${product.slug}/${texture}`
    }
  }
  return entry
}

/** Deletes the previous outputs of a product in a tier folder (`<slug>.<hash>.glb` and `<slug>/`). */
async function removeOutputs(dir: string, slug: string) {
  await rm(path.join(dir, slug), { recursive: true, force: true })
  const files = await readdir(dir).catch(() => [] as string[])
  const pattern = new RegExp(`^${slug}(\\.[0-9a-f]{10})?\\.glb$`)
  await Promise.all(files.filter((f) => pattern.test(f)).map((f) => rm(path.join(dir, f))))
}

const round = (v: number) => Math.round(v * 10) / 10

const only = process.argv.slice(2)
const unknown = only.filter((slug) => !catalog.products.some((p) => p.slug === slug))
if (unknown.length) throw new Error(`Unknown product(s): ${unknown.join(', ')}`)

const previous: ModelManifest | null = await readFile(MANIFEST, 'utf8').then(JSON.parse, () => null)
const models: ModelManifest['models'] = { ...previous?.models }
if (previous) TIER_SPECS.high.maxTextureSize = previous.tiers.high.maxTextureSize

console.log(`${'product'.padEnd(22)} ${'size (cm)'.padEnd(20)} ${'triangles h/m/l'.padEnd(22)} ${'high'.padStart(8)} ${'medium'.padStart(8)} ${'low'.padStart(8)}  parts`)
for (const product of catalog.products) {
  if (only.length && !only.includes(product.slug)) continue
  const entry = await buildProduct(product)
  models[product.slug] = entry
  const d = entry.dimensions
  console.log(
    [
      product.slug.padEnd(22),
      `${d.width} × ${d.height} × ${d.depth}`.padEnd(20),
      TIERS.map((t) => entry.files[t].triangles).join(' / ').padEnd(22),
      ...TIERS.map((t) => kb(entry.files[t].bytes)),
      ` ${Object.entries(entry.parts).map(([id, p]) => `${id}:${p.type}(${p.triangles}t ${p.swatch.join('→')})`).join(' ')}`,
    ].join(' '),
  )
}

const ordered = Object.fromEntries(catalog.products.filter((p) => models[p.slug]).map((p) => [p.slug, models[p.slug]]))
const manifest: ModelManifest = { version: 1, tiers: TIER_SPECS, models: ordered }
await mkdir(path.dirname(MANIFEST), { recursive: true })
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)

const totals = TIERS.map((t) => Object.values(ordered).reduce((sum, m) => sum + m.files[t].bytes, 0))
console.log(`\nTotal GLB size: ${TIERS.map((t, i) => `${t} ${kb(totals[i]).trim()}`).join(' · ')}`)
console.log(`Manifest: ${path.relative(ROOT, MANIFEST)}`)
