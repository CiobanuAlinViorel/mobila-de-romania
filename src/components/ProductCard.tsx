import { Link } from 'react-router'
import { categoryLabel, formatPrice, partOptions } from '../lib/catalog'
import { loadViewer } from '../lib/lazy'
import type { Product } from '../lib/types'
import SnapshotImage from './SnapshotImage'

export default function ProductCard({ product }: { product: Product }) {
  const firstPart = product.parts[0]
  const options = firstPart ? partOptions(product, firstPart) : []
  const optionCount = product.parts.reduce((sum, part) => sum + part.options.length, 0)

  return (
    <Link
      to={`/produs/${product.slug}`}
      onMouseEnter={loadViewer}
      onFocus={loadViewer}
      onTouchStart={loadViewer}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line/70 bg-card transition active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(60,40,20,0.45)] sm:rounded-3xl"
    >
      <div className="studio-backdrop relative aspect-square">
        <SnapshotImage
          product={product}
          framing="catalog"
          sizes="(min-width: 1280px) 22rem, (min-width: 1024px) 30vw, 48vw"
          className="absolute inset-0 h-full w-full transition duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute top-3 left-3 hidden rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium tracking-wide text-stone-600 uppercase backdrop-blur sm:inline">
          {categoryLabel(product.category)}
        </span>
        <span className="absolute top-2 right-2 rounded-full bg-stone-900/80 px-2 py-0.5 text-[10px] font-semibold text-white sm:top-3 sm:right-3 sm:px-2.5 sm:py-1 sm:text-[11px]">
          3D
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:gap-2 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h3 className="font-serif text-[15px] leading-snug font-semibold text-stone-900 sm:text-lg">{product.name}</h3>
          <p className="text-sm font-semibold text-accent sm:shrink-0 sm:text-base">{formatPrice(product.price)}</p>
        </div>
        <p className="hidden text-sm text-stone-600 sm:line-clamp-2">{product.summary}</p>
        <div className="mt-auto flex items-center gap-1 pt-1.5 sm:gap-1.5 sm:pt-2" aria-label={`${optionCount} opțiuni de personalizare`}>
          {options.slice(0, 6).map((o) => (
            <span key={o.id} title={o.label} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10 sm:h-4 sm:w-4" style={{ background: o.swatch }} />
          ))}
          <span className="ml-1 hidden text-xs text-stone-500 min-[420px]:inline">{optionCount} opțiuni</span>
        </div>
      </div>
    </Link>
  )
}
