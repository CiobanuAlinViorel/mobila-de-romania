import catalogJson from '../data/products.json'
import modelsJson from '../generated/models.json'
import snapshotsJson from '../generated/snapshots.json'
import { albedoToPerceived } from './appearance'
import type { Catalog, ModelManifest, Product, ProductPart, SnapshotManifest } from './types'

export const catalog = catalogJson as unknown as Catalog
export const modelManifest = modelsJson as unknown as ModelManifest
export const snapshotManifest = snapshotsJson as unknown as SnapshotManifest

export const products = catalog.products
export const getProduct = (slug: string | undefined) => products.find((p) => p.slug === slug)
export const categoryLabel = (id: string) => catalog.categories.find((c) => c.id === id)?.label ?? id

const priceFormat = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 })
export const formatPrice = (value: number) => `${priceFormat.format(value)} ${catalog.currency}`

/** Real dimensions in cm, measured on the normalized model. */
export const dimensions = (product: Product) => modelManifest.models[product.slug]?.dimensions

export interface ResolvedOption {
  id: string
  label: string
  /** CSS background for the swatch. */
  swatch: string
  /** Color / metal parts: perceived sRGB color (undefined = original). */
  color?: string
  metalness?: number
  roughness?: number
  /** Wood parts: finish id (undefined = original texture). */
  finish?: string
}

const grain = (dark: string, light: string) =>
  `repeating-linear-gradient(105deg, ${dark} 0 2px, ${light} 2px 5px, ${dark} 5px 6px, ${light} 6px 11px)`
const metallic = (color: string) => `linear-gradient(135deg, #ffffffb0 0%, ${color} 38%, ${color} 62%, #00000055 100%)`

export function partOptions(product: Product, part: ProductPart): ResolvedOption[] {
  const original = modelManifest.models[product.slug]?.parts[part.id]?.swatch ?? ['#999999']
  if (part.type === 'color') {
    return part.options.map((o) => ({
      ...o,
      swatch: o.id === 'original' || !o.color ? albedoToPerceived(original[0]) : o.color,
    }))
  }
  if (part.type === 'wood') {
    return part.options.map((id) => {
      if (id === 'original') {
        const [dark, light] = original.map((c) => albedoToPerceived(c))
        return { id, label: part.original, swatch: grain(dark, light ?? dark) }
      }
      const finish = catalog.finishes.wood[id]
      return { id, label: finish.label, swatch: grain(finish.dark, finish.light), finish: id }
    })
  }
  return part.options.map((id) => {
    if (id === 'original') return { id, label: part.original, swatch: metallic(albedoToPerceived(original[0])) }
    const finish = catalog.finishes.metal[id]
    return { id, swatch: metallic(finish.color), ...finish }
  })
}
