import { Primitive, type Document, type TypedArray, type mat4, type vec3 } from '@gltf-transform/core'
import { clearNodeTransform, flatten, getBounds, transformMesh } from '@gltf-transform/functions'

type TypedArrayConstructor = new (length: number) => TypedArray

/**
 * Bakes every node transform into the vertices, converts to meters and moves the model so that it is
 * centered on X/Z and stands on the floor (y = 0). Returns the final bounding box.
 */
export async function normalizeScene(doc: Document, unitScale: number): Promise<{ min: vec3; max: vec3 }> {
  const root = doc.getRoot()
  await doc.transform(flatten())
  for (const node of root.listNodes()) if (node.getMesh()) clearNodeTransform(node)

  const s = unitScale
  for (const mesh of root.listMeshes()) transformMesh(mesh, [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1])

  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  const { min, max } = getBounds(scene)
  const center: mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2, 1]
  for (const mesh of root.listMeshes()) transformMesh(mesh, center)
  return getBounds(scene)
}

/** Triangle-list vertex indices of a primitive. */
export function triangleIndices(prim: Primitive): Uint32Array {
  if (prim.getMode() !== Primitive.Mode.TRIANGLES) throw new Error('Only triangle-list primitives are supported')
  const indices = prim.getIndices()
  if (indices) return Uint32Array.from(indices.getArray()!)
  return Uint32Array.from({ length: prim.getAttribute('POSITION')!.getCount() }, (_, i) => i)
}

/** Creates a new primitive (same material) containing only the given triangles. */
export function extractTriangles(doc: Document, prim: Primitive, triangles: ArrayLike<number>): Primitive {
  const src = triangleIndices(prim)
  const remap = new Map<number, number>()
  const indices = new Uint32Array(triangles.length * 3)
  for (let t = 0, k = 0; t < triangles.length; t++) {
    for (let c = 0; c < 3; c++) {
      const v = src[triangles[t] * 3 + c]
      let nv = remap.get(v)
      if (nv === undefined) remap.set(v, (nv = remap.size))
      indices[k++] = nv
    }
  }

  const buffer = doc.getRoot().listBuffers()[0]
  const out = doc.createPrimitive().setMode(prim.getMode()).setMaterial(prim.getMaterial())
  for (const semantic of prim.listSemantics()) {
    const attr = prim.getAttribute(semantic)!
    const size = attr.getElementSize()
    const from = attr.getArray()!
    const to = new (from.constructor as TypedArrayConstructor)(remap.size * size)
    for (const [ov, nv] of remap) for (let e = 0; e < size; e++) to[nv * size + e] = from[ov * size + e]
    out.setAttribute(
      semantic,
      doc.createAccessor().setType(attr.getType()).setArray(to).setNormalized(attr.getNormalized()).setBuffer(buffer),
    )
  }
  out.setIndices(
    doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(remap.size > 65535 ? indices : Uint16Array.from(indices))
      .setBuffer(buffer),
  )
  return out
}

const edge = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
  (bx - ax) * (py - ay) - (by - ay) * (px - ax)

/**
 * Marks the texels covered by a UV-space triangle in `mask` (w × h). Texel centers inside the triangle are
 * marked, plus the texels under its vertices and centroid so that slivers are never lost.
 */
export function rasterizeUV(mask: Uint8Array, w: number, h: number, u: ArrayLike<number>, v: ArrayLike<number>) {
  const ox = Math.floor(Math.min(u[0], u[1], u[2]))
  const oy = Math.floor(Math.min(v[0], v[1], v[2]))
  const x0 = (u[0] - ox) * w, x1 = (u[1] - ox) * w, x2 = (u[2] - ox) * w
  const y0 = (v[0] - oy) * h, y1 = (v[1] - oy) * h, y2 = (v[2] - oy) * h
  const mark = (x: number, y: number) => {
    mask[(((Math.floor(y) % h) + h) % h) * w + (((Math.floor(x) % w) + w) % w)] = 1
  }
  mark(x0, y0)
  mark(x1, y1)
  mark(x2, y2)
  mark((x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3)

  const area = edge(x0, y0, x1, y1, x2, y2)
  const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2))
  const minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2))
  if (Math.abs(area) < 1e-9 || (maxX - minX) * (maxY - minY) > w * h * 2) return
  const sign = Math.sign(area)
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const cx = px + 0.5, cy = py + 0.5
      if (
        sign * edge(x1, y1, x2, y2, cx, cy) >= 0 &&
        sign * edge(x2, y2, x0, y0, cx, cy) >= 0 &&
        sign * edge(x0, y0, x1, y1, cx, cy) >= 0
      ) {
        mask[((py % h) * w) + (px % w)] = 1
      }
    }
  }
}
