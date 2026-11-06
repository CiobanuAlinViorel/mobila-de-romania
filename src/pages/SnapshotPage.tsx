import { Suspense, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { parseTier } from '../config'
import { getProduct } from '../lib/catalog'
import { selectionFromParams } from '../lib/selection'
import ProductViewer from '../viewer/ProductViewer'

declare global {
  interface Window {
    __MDR_SNAPSHOT_READY__?: boolean
  }
}

/**
 * Hidden route used by `pnpm snapshots`: renders one product on a transparent canvas
 * (`?framing=catalog|detail&w=…&h=…&tier=…` plus optional part options), then raises
 * `window.__MDR_SNAPSHOT_READY__`.
 */
export default function SnapshotPage() {
  const product = getProduct(useParams().slug)
  const [params] = useSearchParams()
  const width = Number(params.get('w') ?? 1024)
  const height = Number(params.get('h') ?? width)
  const framing = params.get('framing') === 'detail' ? 'detail' : 'catalog'
  const tierParam = parseTier(params.get('tier'))
  const tier = !tierParam || tierParam === 'auto' ? 'high' : tierParam
  const selection = useMemo(() => (product ? selectionFromParams(product, params) : {}), [product, params])

  const onReady = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => (window.__MDR_SNAPSHOT_READY__ = true)))
  }, [])

  if (!product) return <p id="snapshot-error">Produs necunoscut</p>
  return (
    <div style={{ width, height }}>
      <Suspense fallback={null}>
        <ProductViewer product={product} selection={selection} tier={tier} mode={framing} onReady={onReady} />
      </Suspense>
    </div>
  )
}
