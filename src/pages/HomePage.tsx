import { Palette, Rotate3d, Ruler } from 'lucide-react'
import { useSearchParams } from 'react-router'
import ProductCard from '../components/ProductCard'
import { catalog, products } from '../lib/catalog'

const FEATURES = [
  { icon: Rotate3d, text: 'Rotește și apropie fiecare piesă în 3D' },
  { icon: Palette, text: 'Alege culori, esențe de lemn și finisaje' },
  { icon: Ruler, text: 'Dimensiuni reale, măsurate pe model' },
]

export default function HomePage() {
  const [params, setParams] = useSearchParams()
  const active = params.get('categorie')
  const visible = active ? products.filter((p) => p.category === active) : products
  const chips = [
    { id: null, label: 'Toate', count: products.length },
    ...catalog.categories.map((c) => ({ ...c, count: products.filter((p) => p.category === c.id).length })),
  ].filter((c) => c.count > 0)

  const select = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('categorie', id)
        else next.delete('categorie')
        return next
      },
      { preventScrollReset: true },
    )

  return (
    <>
      <title>Mobila de România: mobilier configurabil în 3D</title>
      <section className="mx-auto max-w-7xl px-4 pt-6 pb-5 sm:px-8 sm:pt-14 sm:pb-8">
        <p className="text-xs font-semibold tracking-[0.22em] text-accent uppercase">Colecția 2026</p>
        <h1 className="mt-2 max-w-3xl font-serif text-[2rem] leading-[1.1] font-semibold tracking-tight text-stone-900 sm:mt-3 sm:text-5xl">
          Mobilier pentru casa ta, configurat chiar de tine.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] text-stone-600 sm:mt-4 sm:text-lg">
          Alege culoarea tapițeriei, esența lemnului și finisajul metalic, apoi privește piesa din orice unghi, la
          dimensiunile ei reale.
        </p>
        <ul className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 text-sm text-stone-700 sm:mx-0 sm:mt-6 sm:flex-wrap sm:gap-x-7 sm:gap-y-2 sm:px-0">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-8 sm:pb-16" aria-labelledby="catalog-title">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h2 id="catalog-title" className="font-serif text-2xl font-semibold text-stone-900">
              Catalog
            </h2>
            <p className="mt-1 text-sm text-stone-500">Imaginile păstrează proporțiile reale dintre produse.</p>
          </div>
          <div
            role="toolbar"
            aria-label="Filtrează după categorie"
            className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
          >
            {chips.map((chip) => {
              const selected = chip.id === active
              return (
                <button
                  key={chip.id ?? 'all'}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => select(chip.id)}
                  className={`min-h-10 shrink-0 rounded-full border px-4 text-sm transition active:scale-95 ${
                    selected
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-line bg-card text-stone-700 hover:border-stone-400'
                  }`}
                >
                  {chip.label} <span className={selected ? 'text-white/70' : 'text-stone-400'}>{chip.count}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>
    </>
  )
}
