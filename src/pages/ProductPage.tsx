import { ChevronRight, Maximize2 } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import Configurator from '../components/Configurator'
import ProductCard from '../components/ProductCard'
import ShareButton from '../components/ShareButton'
import ViewerStage from '../components/ViewerStage'
import { categoryLabel, dimensions, formatPrice, getProduct, products } from '../lib/catalog'
import { applySelectionToParams, resolvedSelection, selectionFromParams } from '../lib/selection'
import type { Product } from '../lib/types'
import { useFullscreen } from '../lib/useFullscreen'
import NotFoundPage from './NotFoundPage'

const cm = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 })

export default function ProductPage() {
  const product = getProduct(useParams().slug)
  if (!product) return <NotFoundPage />
  return <ProductDetails key={product.slug} product={product} />
}

function ProductDetails({ product }: { product: Product }) {
  const [params, setParams] = useSearchParams()
  const selection = useMemo(() => selectionFromParams(product, params), [product, params])
  const stageRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(stageRef)
  const size = dimensions(product)
  const summary = resolvedSelection(product, selection)
    .map(({ option }) => option.label)
    .join(' · ')
  const related = [
    ...products.filter((p) => p.slug !== product.slug && p.category === product.category),
    ...products.filter((p) => p.category !== product.category),
  ].slice(0, 4)

  const choose = (partId: string, optionId: string) =>
    setParams(
      (prev) => applySelectionToParams(product, { ...selection, [partId]: optionId }, new URLSearchParams(prev)),
      { replace: true, preventScrollReset: true },
    )

  return (
    <>
      <title>{`${product.name} · Mobila de România`}</title>
      <div className="mx-auto max-w-7xl sm:px-8 sm:pt-6">
        <nav aria-label="Breadcrumb" className="mb-5 hidden items-center gap-1 text-sm text-stone-500 sm:flex">
          <Link to="/" className="hover:text-stone-900">
            Catalog
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link to={`/?categorie=${product.category}`} className="hover:text-stone-900">
            {categoryLabel(product.category)}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-stone-800">{product.name}</span>
        </nav>

        <div className="grid lg:grid-cols-12 lg:gap-10">
          <section className="lg:sticky lg:top-24 lg:col-span-7 lg:self-start" aria-label="Vizualizare 3D">
            <ViewerStage product={product} selection={selection} onSelect={choose} stageRef={stageRef} fullscreen={fullscreen} />
          </section>

          <section className="flex min-w-0 flex-col gap-5 px-4 pt-5 sm:px-0 lg:col-span-5 lg:pt-0">
            <header>
              <Link
                to={`/?categorie=${product.category}`}
                className="text-xs font-semibold tracking-[0.2em] text-accent uppercase hover:text-accent-dark"
              >
                {categoryLabel(product.category)}
              </Link>
              <div className="mt-1.5 flex items-start justify-between gap-4">
                <h1 className="font-serif text-[1.7rem] leading-tight font-semibold tracking-tight text-stone-900 sm:text-4xl">
                  {product.name}
                </h1>
                <p className="shrink-0 pt-1 text-xl font-semibold text-stone-900 sm:text-2xl">{formatPrice(product.price)}</p>
              </div>
              <p className="mt-2 text-[15px] text-stone-600 sm:text-base">{product.summary}</p>
            </header>

            <div className="rounded-3xl border border-line/70 bg-card p-4 sm:p-5">
              <h2 className="mb-3 text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Personalizează</h2>
              <Configurator product={product} selection={selection} onChange={choose} />
              <div className="mt-5 hidden flex-wrap gap-3 lg:flex">
                <button
                  type="button"
                  onClick={fullscreen.enter}
                  className="flex h-11 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  Vezi pe tot ecranul
                </button>
                <ShareButton product={product} summary={summary} />
              </div>
            </div>

            {size && (
              <dl className="grid grid-cols-3 gap-2 text-center sm:gap-3">
                {[
                  ['Lățime', size.width],
                  ['Înălțime', size.height],
                  ['Adâncime', size.depth],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-line/70 bg-card px-2 py-3">
                    <dt className="text-xs text-stone-500">{label}</dt>
                    <dd className="mt-1 font-semibold text-stone-900">{cm.format(Number(value))} cm</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="space-y-3 text-sm leading-relaxed text-stone-700">
              <p>{product.description}</p>
              <p>
                <span className="font-semibold text-stone-900">Materiale: </span>
                {product.materials.join(', ')}
              </p>
            </div>
          </section>
        </div>

        <section className="mt-12 px-4 sm:mt-16 sm:px-0" aria-labelledby="related-title">
          <h2 id="related-title" className="mb-4 font-serif text-xl font-semibold text-stone-900 sm:mb-5 sm:text-2xl">
            Te-ar mai putea interesa
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>

        {/* Thumb-reach actions on phones and tablets; sticks to the bottom until the page content ends. */}
        <div className="sticky bottom-0 z-30 mt-8 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 sm:px-0">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-stone-900">{formatPrice(product.price)}</p>
              <p className="truncate text-xs text-stone-500">{summary}</p>
            </div>
            <ShareButton product={product} summary={summary} compact />
            <button
              type="button"
              onClick={fullscreen.enter}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-medium text-white active:scale-95"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              Ecran complet
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
