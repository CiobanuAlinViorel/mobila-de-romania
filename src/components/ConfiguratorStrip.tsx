import { useState } from 'react'
import { partOptions } from '../lib/catalog'
import { resolvedSelection, type Selection } from '../lib/selection'
import type { Product } from '../lib/types'
import Swatch from './Swatch'

interface Props {
  product: Product
  selection: Selection
  onChange: (partId: string, optionId: string) => void
}

/**
 * Compact configurator for the fullscreen viewer: one tab per part, one thumb-sized swatch row.
 * Bottom panel in portrait / on large screens, side panel on phones held sideways.
 */
export default function ConfiguratorStrip({ product, selection, onChange }: Props) {
  const resolved = resolvedSelection(product, selection)
  const [activeId, setActiveId] = useState(resolved[0]?.part.id)
  const current = resolved.find((r) => r.part.id === activeId) ?? resolved[0]
  if (!current) return null

  return (
    <div className="border-t border-line bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur short-landscape:w-72 short-landscape:shrink-0 short-landscape:overflow-y-auto short-landscape:border-t-0 short-landscape:border-l short-landscape:pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-3xl">
        {resolved.length > 1 ? (
          <div
            role="tablist"
            aria-label="Părți personalizabile"
            className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:justify-center-safe short-landscape:mx-0 short-landscape:flex-wrap short-landscape:px-0"
          >
            {resolved.map(({ part, option }) => {
              const selected = part.id === current.part.id
              return (
                <button
                  key={part.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="fullscreen-swatches"
                  onClick={() => setActiveId(part.id)}
                  className={`min-h-11 shrink-0 rounded-2xl border px-3.5 py-1.5 text-left transition ${
                    selected ? 'border-stone-900 bg-stone-900 text-white' : 'border-line bg-white text-stone-700'
                  }`}
                >
                  <span className="block text-xs font-semibold">{part.label}</span>
                  <span className={`block text-[11px] ${selected ? 'text-white/70' : 'text-stone-500'}`}>{option.label}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm">
            <span className="font-semibold text-stone-900">{current.part.label}</span>
            <span className="text-stone-500"> · {current.option.label}</span>
          </p>
        )}
        <div
          id="fullscreen-swatches"
          role="tabpanel"
          aria-label={current.part.label}
          className="no-scrollbar -mx-4 mt-2 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 py-2 lg:justify-center-safe short-landscape:mx-0 short-landscape:flex-wrap short-landscape:overflow-visible short-landscape:px-0.5"
        >
          {partOptions(product, current.part).map((option) => (
            <Swatch
              key={option.id}
              size="lg"
              option={option}
              partLabel={current.part.label}
              active={option.id === current.option.id}
              onSelect={() => onChange(current.part.id, option.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
