import { Maximize2, Minimize2, RotateCcw, Rotate3d, X } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useSearchParams } from 'react-router'
import type { TierSetting } from '../config'
import { initialTierSetting, resolveTier, saveTierSetting } from '../lib/assets'
import { formatPrice, modelManifest } from '../lib/catalog'
import { loadViewer } from '../lib/lazy'
import type { Selection } from '../lib/selection'
import { TIERS, type Product, type Tier } from '../lib/types'
import type { Fullscreen } from '../lib/useFullscreen'
import ConfiguratorStrip from './ConfiguratorStrip'
import ErrorBoundary from './ErrorBoundary'
import SnapshotImage from './SnapshotImage'

const ProductViewer = lazy(loadViewer)

const TIER_LABEL: Record<Tier, string> = { high: 'HD', medium: 'Standard', low: 'Redusă' }
const mb = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 })

interface Props {
  product: Product
  selection: Selection
  onSelect: (partId: string, optionId: string) => void
  /** Element that goes fullscreen (owned by the page so other buttons can open it too). */
  stageRef: RefObject<HTMLDivElement | null>
  fullscreen: Fullscreen
}

function IconButton({ label, onClick, primary, children }: { label: string; onClick: () => void; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full shadow-sm backdrop-blur transition active:scale-95 ${
        primary ? 'bg-stone-900 text-white hover:bg-stone-700' : 'bg-white/90 text-stone-800 hover:bg-white'
      }`}
    >
      {children}
    </button>
  )
}

/** The product's 3D stage: poster, lazy 3D viewer, controls and the fullscreen layout. */
export default function ViewerStage({ product, selection, onSelect, stageRef, fullscreen }: Props) {
  const [params] = useSearchParams()
  const [tierSetting, setTierSetting] = useState<TierSetting>(() => initialTierSetting(params))
  const tier = resolveTier(tierSetting)
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const closeRef = useRef<HTMLButtonElement>(null)
  const files = modelManifest.models[product.slug].files
  const { active } = fullscreen

  const onReady = useCallback(() => setReady(true), [])
  const onProgress = useCallback((fraction: number | null) => setProgress(fraction), [])

  useEffect(() => {
    if (active) closeRef.current?.focus({ preventScroll: true })
  }, [active])

  const changeTier = (value: TierSetting) => {
    saveTierSetting(value)
    setTierSetting(value)
    if (resolveTier(value) !== tier) {
      setReady(false)
      setProgress(null)
    }
  }

  return (
    <div
      ref={stageRef}
      role={active ? 'dialog' : undefined}
      aria-modal={active || undefined}
      aria-label={active ? `${product.name} în 3D, pe tot ecranul` : undefined}
      className={
        active
          ? 'fixed inset-0 z-50 flex flex-col overscroll-contain bg-canvas pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] short-landscape:flex-row'
          : 'relative'
      }
    >
      <div
        className={`studio-backdrop relative overflow-hidden ${
          active ? 'min-h-0 flex-1' : 'aspect-square sm:aspect-[4/3] sm:rounded-3xl sm:border sm:border-line/70'
        }`}
      >
        {/* Poster rendered with the viewer's own framing, so it cross-fades seamlessly into the 3D view. */}
        <SnapshotImage
          product={product}
          framing="detail"
          eager
          sizes="(min-width: 1280px) 46rem, (min-width: 1024px) 58vw, 100vw"
          className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${ready ? 'opacity-0' : 'opacity-100'}`}
        />
        <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <ErrorBoundary
            fallback={
              <p className="absolute inset-x-4 bottom-20 rounded-xl bg-white/90 p-3 text-sm text-stone-700">
                Modelul 3D nu a putut fi încărcat. Verifică conexiunea și reîncarcă pagina.
              </p>
            }
          >
            <Suspense fallback={null}>
              <ProductViewer
                product={product}
                selection={selection}
                tier={tier}
                fullscreen={active}
                resetKey={resetKey}
                onReady={onReady}
                onProgress={onProgress}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        <div
          className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 ${
            active ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : ''
          }`}
        >
          {active ? (
            <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full bg-white/90 py-1 pr-4 pl-1 shadow-sm backdrop-blur">
              <button
                ref={closeRef}
                type="button"
                onClick={fullscreen.exit}
                aria-label="Închide ecranul complet"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-800 hover:bg-stone-900/5"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="truncate font-serif text-sm font-semibold text-stone-900 sm:text-base">{product.name}</span>
              <span className="shrink-0 text-sm font-semibold text-accent">{formatPrice(product.price)}</span>
            </div>
          ) : (
            <span className="flex h-8 items-center gap-1.5 rounded-full bg-white/85 px-3 text-xs text-stone-600 backdrop-blur">
              <Rotate3d className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sm:hidden">Glisează pentru a roti</span>
              <span className="hidden sm:inline">Trage pentru a roti · rotița pentru zoom</span>
            </span>
          )}
          <label className="pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/90 pr-1 pl-3 text-xs text-stone-600 shadow-sm backdrop-blur">
            <span className="hidden sm:inline">Calitate</span>
            <select
              value={tierSetting}
              onChange={(e) => changeTier(e.target.value as TierSetting)}
              aria-label="Calitatea modelului 3D"
              className="h-9 max-w-[9.5rem] rounded-full bg-white px-2 text-xs text-stone-800"
            >
              <option value="auto">Auto · {TIER_LABEL[resolveTier('auto')]}</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]} · {mb.format(files[t].bytes / 1024 / 1024)} MB
                </option>
              ))}
            </select>
          </label>
        </div>

        {active && (
          <span className="pointer-events-none absolute bottom-4 left-3 rounded-full bg-white/80 px-3 py-1.5 text-xs text-stone-600 backdrop-blur">
            <span className="sm:hidden">Un deget rotește · două degete apropie</span>
            <span className="hidden sm:inline">Trage pentru a roti · rotița pentru zoom · Esc pentru a ieși</span>
          </span>
        )}

        <div className="pointer-events-none absolute right-3 bottom-3 flex gap-2">
          <IconButton label="Vedere inițială" onClick={() => setResetKey((k) => k + 1)}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            primary
            label={active ? 'Ieși din ecranul complet' : 'Vezi pe tot ecranul'}
            onClick={active ? fullscreen.exit : fullscreen.enter}
          >
            {active ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
          </IconButton>
        </div>

        {!ready && (
          <div className="absolute inset-x-0 bottom-0" role="status" aria-live="polite">
            <span className="sr-only">Se încarcă modelul 3D</span>
            <div className="h-1 bg-stone-900/10">
              <div
                className={`h-full bg-accent transition-[width] duration-300 ${progress === null ? 'w-1/3 animate-pulse' : ''}`}
                style={progress === null ? undefined : { width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {active && <ConfiguratorStrip product={product} selection={selection} onChange={onSelect} />}
    </div>
  )
}
