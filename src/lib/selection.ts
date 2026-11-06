import { partOptions, type ResolvedOption } from './catalog'
import type { Product } from './types'

/** Chosen option per part: partId → optionId. */
export type Selection = Record<string, string>

export const defaultSelection = (product: Product): Selection =>
  Object.fromEntries(product.parts.map((part) => [part.id, part.options.map((o) => (typeof o === 'string' ? o : o.id))[0]]))

/** Reads the configuration from the URL (`?sezut=teracota&picioare=nuc`), ignoring unknown values. */
export function selectionFromParams(product: Product, params: URLSearchParams): Selection {
  const selection = defaultSelection(product)
  for (const part of product.parts) {
    const value = params.get(part.id)
    if (value && partOptions(product, part).some((o) => o.id === value)) selection[part.id] = value
  }
  return selection
}

/** Writes the configuration into `params`, leaving out parts that use their default option. */
export function applySelectionToParams(product: Product, selection: Selection, params: URLSearchParams) {
  const defaults = defaultSelection(product)
  for (const part of product.parts) {
    if (selection[part.id] && selection[part.id] !== defaults[part.id]) params.set(part.id, selection[part.id])
    else params.delete(part.id)
  }
  return params
}

export function resolvedSelection(product: Product, selection: Selection) {
  return product.parts.map((part) => {
    const options = partOptions(product, part)
    const option: ResolvedOption = options.find((o) => o.id === selection[part.id]) ?? options[0]
    return { part, option }
  })
}
