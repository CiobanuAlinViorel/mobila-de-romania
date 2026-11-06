import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { assetUrl } from '../lib/assets'
import { modelManifest } from '../lib/catalog'
import type { Selection } from '../lib/selection'
import type { Product, SnapshotFraming, Tier } from '../lib/types'
import { applyFraming, catalogBox, frameBox, toMeters, viewDirection, type BoxSize, type Controls } from './framing'
import { applySelection, preparePartMaterials } from './materials'

type ViewerMode = 'interactive' | SnapshotFraming

export interface ProductViewerProps {
  product: Product
  selection: Selection
  tier: Tier
  /**
   * `interactive`: orbit controls. Snapshots (no controls, transparent, drawing buffer kept):
   * `catalog` uses one camera for the whole catalog (natural relative scale), `detail` the interactive framing.
   */
  mode?: ViewerMode
  /** The viewer fills the screen: all touch gestures go to the 3D view and the model is framed larger. */
  fullscreen?: boolean
  /** Change it to move the camera back to the initial view. */
  resetKey?: number
  onReady?: () => void
  onProgress?: (fraction: number | null) => void
}

function configureLoader(loader: GLTFLoader) {
  loader.setMeshoptDecoder(MeshoptDecoder)
}

/** Neutral studio reflections generated locally (no HDR download), returns a cleanup function. */
function attachStudioEnvironment(gl: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(gl)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment
  return () => {
    if (scene.environment === environment) scene.environment = null
    environment.dispose()
    pmrem.dispose()
  }
}

function Studio() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => attachStudioEnvironment(gl, scene), [gl, scene])
  return <directionalLight position={[3, 5, 4]} intensity={1.2} />
}

interface RigProps {
  size: BoxSize
  mode: ViewerMode
  resetKey: number
  fullscreen: boolean
}

function CameraRig({ size, mode, resetKey, fullscreen }: RigProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const invalidate = useThree((s) => s.invalidate)
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const ready = mode !== 'interactive' || !!controls
  const fill = fullscreen ? 0.84 : 0.78
  /** Viewport shape and fullscreen state the current framing was computed for. */
  const fitted = useRef<{ aspect: number; fullscreen: boolean } | null>(null)

  useLayoutEffect(() => {
    if (!ready) return
    const framing =
      mode === 'catalog'
        ? frameBox(catalogBox(), aspect, { elevation: 6, fill: 0.97 })
        : frameBox(size, aspect, { elevation: 14, fill })
    applyFraming(camera, framing, mode === 'interactive' ? controls : null)
    fitted.current = { aspect, fullscreen }
    invalidate()
    // Full re-frame only for a new product, an explicit reset or once the controls exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, mode, resetKey, ready])

  // Viewport shape changed (fullscreen, phone rotation): keep the visitor's angle, only refit the distance.
  useLayoutEffect(() => {
    const last = fitted.current
    if (mode !== 'interactive' || !controls || !last) return
    if (last.fullscreen === fullscreen && Math.abs(aspect / last.aspect - 1) < 0.04) return
    applyFraming(camera, frameBox(size, aspect, { fill, direction: viewDirection(camera, controls) }), controls)
    fitted.current = { aspect, fullscreen }
    invalidate()
  }, [aspect, fullscreen, fill, size, mode, camera, controls, invalidate])

  return null
}

/**
 * Touch gestures. Inline, vertical swipes keep scrolling the page (horizontal swipes rotate); in fullscreen
 * every gesture belongs to the 3D view, pinch-zoom included. `!important` because OrbitControls writes
 * `touch-action: none` inline whenever it (re)connects; it applies to the wrapper and the canvas inside it.
 */
const TOUCH_INLINE = 'touch-pan-y! **:touch-pan-y!'
const TOUCH_FULLSCREEN = 'touch-none! **:touch-none!'

function Model({ product, selection, tier, onReady, onProgress }: Omit<ProductViewerProps, 'mode' | 'resetKey' | 'fullscreen'>) {
  const entry = modelManifest.models[product.slug]
  const url = assetUrl(entry.files[tier].path)
  const gltf = useLoader(GLTFLoader, url, configureLoader, (event) =>
    onProgress?.(event.lengthComputable && event.total ? event.loaded / event.total : null),
  )
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const parts = useMemo(() => preparePartMaterials(gltf.scene, gl.capabilities.getMaxAnisotropy()), [gltf.scene, gl])

  useEffect(() => {
    let stale = false
    applySelection(parts, product, selection, tier, () => stale).then((applied) => {
      if (!applied) return
      invalidate()
      onReady?.()
    })
    return () => {
      stale = true
    }
  }, [parts, product, selection, tier, invalidate, onReady])

  return <primitive object={gltf.scene} />
}

export default function ProductViewer({
  product,
  selection,
  tier,
  mode = 'interactive',
  fullscreen = false,
  resetKey = 0,
  onReady,
  onProgress,
}: ProductViewerProps) {
  const size = useMemo(() => toMeters(modelManifest.models[product.slug].dimensions), [product.slug])
  const shadowScale = Math.max(size.width, size.depth) * 2.4
  const snapshot = mode !== 'interactive'

  return (
    <Canvas
      className={snapshot ? undefined : fullscreen ? TOUCH_FULLSCREEN : TOUCH_INLINE}
      dpr={snapshot ? 1 : [1, 2]}
      frameloop="demand"
      gl={{ antialias: true, preserveDrawingBuffer: snapshot, toneMapping: THREE.NeutralToneMapping }}
      camera={{ fov: 30, near: 0.05, far: 100, position: [2, 1.2, 3] }}
      fallback={<p className="p-6 text-sm text-stone-600">Browserul tău nu poate afișa modele 3D (WebGL indisponibil).</p>}
    >
      <Studio />
      <CameraRig size={size} mode={mode} resetKey={resetKey} fullscreen={fullscreen} />
      <Suspense fallback={null}>
        <Model product={product} selection={selection} tier={tier} onReady={onReady} onProgress={onProgress} />
        <ContactShadows
          key={`${product.slug}-${tier}`}
          position={[0, 0.0005, 0]}
          scale={shadowScale}
          far={size.height + 0.1}
          resolution={1024}
          blur={2.2}
          opacity={0.55}
          frames={1}
        />
      </Suspense>
      {!snapshot && (
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.12}
          maxPolarAngle={Math.PI / 2 - 0.04}
          zoomSpeed={0.8}
        />
      )}
    </Canvas>
  )
}
