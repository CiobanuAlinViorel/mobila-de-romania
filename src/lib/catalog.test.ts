import { describe, expect, it } from 'vitest'
import { parseTier, resolveConfig } from '../config'
import { albedoToPerceived, perceivedToAlbedo, perceivedToAlbedoHex } from './appearance'
import { catalog, modelManifest, partOptions, snapshotManifest } from './catalog'
import { applySelectionToParams, defaultSelection, selectionFromParams } from './selection'
import { TIERS } from './types'

/** Generated files shipped in public/ (paths relative to the assets base URL). */
const publicFiles = new Set(
  Object.keys(import.meta.glob('/public/**/*.{glb,webp,jpg,png}')).map((p) => p.replace(/^\/public\//, '')),
)
const products = catalog.products.map((p) => [p.slug, p] as const)

describe('catalog', () => {
  it('has unique slugs and known categories', () => {
    expect(new Set(catalog.products.map((p) => p.slug)).size).toBe(catalog.products.length)
    const categories = new Set(catalog.categories.map((c) => c.id))
    for (const p of catalog.products) expect(categories, p.slug).toContain(p.category)
  })

  it.each(products)('%s has a generated model for every tier', (slug) => {
    const entry = modelManifest.models[slug]
    expect(entry, 'run `pnpm models`').toBeDefined()
    for (const tier of TIERS) expect(publicFiles, `${slug}/${tier}`).toContain(entry.files[tier].path)
    expect(entry.dimensions.height).toBeGreaterThan(20)
    expect(entry.dimensions.height).toBeLessThan(250)
  })

  it.each(products)('%s parts match the generated model', (slug, product) => {
    const entry = modelManifest.models[slug]
    for (const part of product.parts) {
      const generated = entry.parts[part.id]
      expect(generated, `${slug}/${part.id}: run \`pnpm models\``).toBeDefined()
      expect(generated.type).toBe(part.type)
      expect(generated.triangles).toBeGreaterThan(0)
      const options = partOptions(product, part)
      expect(options.length).toBeGreaterThan(0)
      for (const option of options) {
        if (option.color) expect(option.color).toMatch(/^#[0-9a-f]{6}$/i)
        if (part.type !== 'wood' || !option.finish) continue
        for (const tier of TIERS) {
          const textures = generated.textures?.[option.finish]?.[tier]
          expect(textures, `${slug}/${part.id}/${option.finish}/${tier}`).toBeDefined()
          for (const path of Object.values(textures!)) expect(publicFiles).toContain(path)
        }
      }
    }
  })

  it.each(products)('%s has catalog and detail snapshots', (slug) => {
    const images = snapshotManifest.images[slug]
    expect(images, 'run `pnpm snapshots`').toBeDefined()
    for (const image of [images.catalog, images.detail]) {
      for (const src of image.srcset) expect(publicFiles).toContain(src.path)
    }
  })
})

describe('selection', () => {
  const product = catalog.products.find((p) => p.parts.length > 1)!

  it('defaults to the first option of every part', () => {
    const selection = defaultSelection(product)
    for (const part of product.parts) expect(selection[part.id]).toBe(partOptions(product, part)[0].id)
  })

  it('round-trips through URL parameters and drops defaults', () => {
    const [first, second] = product.parts
    const choice = partOptions(product, second).at(-1)!.id
    const params = applySelectionToParams(product, { ...defaultSelection(product), [second.id]: choice }, new URLSearchParams('q=high'))
    expect(params.get(first.id)).toBeNull()
    expect(params.get(second.id)).toBe(choice)
    expect(params.get('q')).toBe('high')
    expect(selectionFromParams(product, params)[second.id]).toBe(choice)
  })

  it('ignores unknown options', () => {
    const part = product.parts[0]
    const selection = selectionFromParams(product, new URLSearchParams({ [part.id]: 'nu-exista' }))
    expect(selection[part.id]).toBe(defaultSelection(product)[part.id])
  })
})

describe('config', () => {
  const env = { BASE_URL: '/', MODE: 'test', DEV: false, PROD: true, SSR: false } as ImportMetaEnv

  it('uses the site itself by default', () => {
    expect(resolveConfig({}, env)).toEqual({ assetsBaseUrl: '/', modelTier: 'auto' })
  })

  it('prefers runtime config over build-time variables', () => {
    const config = resolveConfig(
      { assetsBaseUrl: 'https://cdn.example.com/mobila', modelTier: 'low' },
      { ...env, VITE_ASSETS_BASE_URL: 'https://build.example.com/', VITE_MODEL_TIER: 'high' },
    )
    expect(config).toEqual({ assetsBaseUrl: 'https://cdn.example.com/mobila/', modelTier: 'low' })
  })

  it('rejects unknown tiers', () => {
    expect(parseTier('medium')).toBe('medium')
    expect(parseTier('ultra')).toBeUndefined()
    expect(resolveConfig({ modelTier: 'ultra' }, env).modelTier).toBe('auto')
  })
})

describe('appearance', () => {
  it('converts perceived colors to albedo and back (within 8-bit rounding)', () => {
    const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    for (const hex of ['#bd6a4d', '#2d3d5c', '#ebe8e2']) {
      const back = channels(albedoToPerceived(perceivedToAlbedoHex(hex)))
      channels(hex).forEach((c, i) => expect(Math.abs(c - back[i])).toBeLessThanOrEqual(1))
    }
  })

  it('keeps metal reflectance unchanged', () => {
    expect(perceivedToAlbedo('#ffffff', 1)).toEqual([1, 1, 1])
    expect(perceivedToAlbedo('#ffffff', 0)).toEqual([0.5, 0.5, 0.5])
  })
})
