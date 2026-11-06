import * as THREE from 'three'
import { perceivedToAlbedo } from '../lib/appearance'
import { assetUrl } from '../lib/assets'
import { modelManifest } from '../lib/catalog'
import { resolvedSelection, type Selection } from '../lib/selection'
import type { MaterialTag, Product, Tier } from '../lib/types'

interface OriginalLook {
  color: THREE.Color
  metalness: number
  roughness: number
  map: THREE.Texture | null
}

export interface PartMaterial {
  material: THREE.MeshStandardMaterial
  tag: MaterialTag
  original: OriginalLook
}

/**
 * Collects the customizable materials of a loaded model (tagged by the asset pipeline) and remembers their
 * original look. The scene object is cached by the loader, so originals are stored on the material itself.
 */
export function preparePartMaterials(root: THREE.Object3D, maxAnisotropy: number) {
  const parts = new Map<string, PartMaterial[]>()
  const seen = new Set<THREE.Material>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(material)) continue
      seen.add(material)
      const m = material as THREE.MeshStandardMaterial
      for (const tex of [m.map, m.normalMap, m.roughnessMap]) if (tex) tex.anisotropy = Math.min(8, maxAnisotropy)
      const tag = m.userData.mdr as MaterialTag | undefined
      if (!tag) continue
      m.userData.mdrOriginal ??= { color: m.color.clone(), metalness: m.metalness, roughness: m.roughness, map: m.map }
      const list = parts.get(tag.part) ?? []
      list.push({ material: m, tag, original: m.userData.mdrOriginal as OriginalLook })
      parts.set(tag.part, list)
    }
  })
  return parts
}

const textureLoader = new THREE.TextureLoader()
const textureCache = new Map<string, Promise<THREE.Texture>>()

function loadFinishTexture(url: string, like: THREE.Texture | null) {
  let pending = textureCache.get(url)
  if (!pending) {
    pending = textureLoader.loadAsync(url).then((texture) => {
      texture.flipY = false
      texture.colorSpace = THREE.SRGBColorSpace
      if (like) {
        texture.wrapS = like.wrapS
        texture.wrapT = like.wrapT
        texture.anisotropy = like.anisotropy
        texture.channel = like.channel
      }
      return texture
    })
    pending.catch(() => textureCache.delete(url))
    textureCache.set(url, pending)
  }
  return pending
}

/**
 * Applies a configuration to the materials. Finish textures are downloaded first and everything is then
 * assigned at once (unless `isStale()` reports that a newer configuration superseded this one).
 */
export async function applySelection(
  parts: Map<string, PartMaterial[]>,
  product: Product,
  selection: Selection,
  tier: Tier,
  isStale: () => boolean,
) {
  const entry = modelManifest.models[product.slug]
  const resolved = resolvedSelection(product, selection)

  const maps = new Map<THREE.MeshStandardMaterial, THREE.Texture | null>()
  await Promise.all(
    resolved.flatMap(({ part, option }) =>
      part.type !== 'wood'
        ? []
        : (parts.get(part.id) ?? []).map(async ({ material, original }) => {
            const path = option.finish && entry?.parts[part.id]?.textures?.[option.finish]?.[tier]?.[material.name]
            maps.set(material, path ? await loadFinishTexture(assetUrl(path), original.map) : original.map)
          }),
    ),
  )
  if (isStale()) return false

  for (const { part, option } of resolved) {
    for (const { material, tag, original } of parts.get(part.id) ?? []) {
      if (part.type === 'wood') {
        const map = maps.get(material) ?? original.map
        if (material.map !== map) {
          material.map = map
          material.needsUpdate = true
        }
      } else if (option.color) {
        const metalness = option.metalness ?? original.metalness
        const [r, g, b] = perceivedToAlbedo(option.color, metalness)
        material.color.setRGB(r / tag.scale, g / tag.scale, b / tag.scale, THREE.LinearSRGBColorSpace)
        material.metalness = metalness
        material.roughness = option.roughness ?? original.roughness
      } else {
        material.color.copy(original.color)
        material.metalness = original.metalness
        material.roughness = original.roughness
      }
    }
  }
  return true
}
