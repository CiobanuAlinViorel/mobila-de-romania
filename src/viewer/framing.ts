import * as THREE from 'three'
import { modelManifest } from '../lib/catalog'

export interface BoxSize {
  /** Meters. */
  width: number
  height: number
  depth: number
}

/** Manifest dimensions (cm) → meters. */
export const toMeters = (d: BoxSize): BoxSize => ({ width: d.width / 100, height: d.height / 100, depth: d.depth / 100 })

/** Box enclosing every product: snapshots share one camera so their sizes compare naturally. */
export function catalogBox(): BoxSize {
  const all = Object.values(modelManifest.models).map((m) => toMeters(m.dimensions))
  return {
    width: Math.max(...all.map((d) => d.width)),
    height: Math.max(...all.map((d) => d.height)),
    depth: Math.max(...all.map((d) => d.depth)),
  }
}

export interface Framing {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
  distance: number
}

const AZIMUTH = THREE.MathUtils.degToRad(35)

interface FrameOptions {
  fov?: number
  /** Degrees above the horizon for the default 3/4 product angle. */
  elevation?: number
  /** Fraction of the viewport the box may use (normalized device coordinates). */
  fill?: number
  /** Viewing direction (from the target towards the camera) to keep instead of the default angle. */
  direction?: THREE.Vector3
}

/** Camera that tightly fits a box standing on the floor (y = 0, centered on X/Z). */
export function frameBox(size: BoxSize, aspect: number, { fov = 30, elevation = 14, fill = 0.86, direction: keep }: FrameOptions = {}): Framing {
  const target = new THREE.Vector3(0, size.height / 2, 0)
  const el = THREE.MathUtils.degToRad(elevation)
  const direction = keep
    ? keep.clone().normalize()
    : new THREE.Vector3(Math.cos(el) * Math.sin(AZIMUTH), Math.sin(el), Math.cos(el) * Math.cos(AZIMUTH))
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 1000)
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) =>
      new THREE.Vector3(
        (i & 1 ? 0.5 : -0.5) * size.width,
        i & 2 ? size.height : 0,
        (i & 4 ? 0.5 : -0.5) * size.depth,
      ),
  )
  const projected = new THREE.Vector3()
  const fits = (distance: number) => {
    camera.position.copy(target).addScaledVector(direction, distance)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    return corners.every((c) => {
      projected.copy(c).project(camera)
      return Math.abs(projected.x) <= fill && Math.abs(projected.y) <= fill && projected.z < 1
    })
  }
  let lo = 0.05
  let hi = 100
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  return { position: target.clone().addScaledVector(direction, hi), target, fov, distance: hi }
}

export interface Controls {
  target: THREE.Vector3
  minDistance: number
  maxDistance: number
  update: () => void
}

/** Direction from the orbit target towards the camera (the angle the visitor is looking from). */
export const viewDirection = (camera: THREE.Camera, controls: Controls) =>
  camera.position.clone().sub(controls.target).normalize()

export function applyFraming(camera: THREE.PerspectiveCamera, framing: Framing, controls?: Controls | null) {
  camera.fov = framing.fov
  camera.near = framing.distance / 50
  camera.far = framing.distance * 20
  camera.position.copy(framing.position)
  camera.updateProjectionMatrix()
  if (controls) {
    controls.target.copy(framing.target)
    controls.minDistance = framing.distance * 0.45
    controls.maxDistance = framing.distance * 2.2
    controls.update()
  } else {
    camera.lookAt(framing.target)
  }
}
