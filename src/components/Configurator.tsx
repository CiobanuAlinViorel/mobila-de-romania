import { partOptions } from '../lib/catalog'
import { resolvedSelection, type Selection } from '../lib/selection'
import type { PartType, Product } from '../lib/types'
import Swatch from './Swatch'

const TYPE_HINT: Record<PartType, string> = {
  color: 'Culoare',
  wood: 'Esență de lemn',
  metal: 'Finisaj metalic',
}

interface Props {
  product: Product
  selection: Selection
  onChange: (partId: string, optionId: string) => void
}

/** One row of swatches per part: swipeable on phones, wrapping on larger screens. */
export default function Configurator({ product, selection, onChange }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {resolvedSelection(product, selection).map(({ part, option: selected }) => (
        <fieldset key={part.id} className="min-w-0">
          <legend className="mb-1.5 flex w-full items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold text-stone-900">{part.label}</span>
            <span className="truncate text-stone-500">
              <span className="sr-only">{TYPE_HINT[part.type]}: </span>
              {selected.label}
            </span>
          </legend>
          <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0.5">
            {partOptions(product, part).map((option) => (
              <Swatch
                key={option.id}
                option={option}
                partLabel={part.label}
                active={option.id === selected.id}
                onSelect={() => onChange(part.id, option.id)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
