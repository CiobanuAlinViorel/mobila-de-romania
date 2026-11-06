import { Check } from 'lucide-react'
import type { ResolvedOption } from '../lib/catalog'

interface Props {
  option: ResolvedOption
  partLabel: string
  active: boolean
  onSelect: () => void
  /** `lg` is used in the fullscreen strip (thumb-sized targets). */
  size?: 'md' | 'lg'
}

export default function Swatch({ option, partLabel, active, onSelect, size = 'md' }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${partLabel}: ${option.label}`}
      title={option.label}
      className={`relative shrink-0 snap-start rounded-full ring-1 ring-black/10 ring-offset-2 ring-offset-card transition active:scale-95 hover:scale-105 ${
        size === 'lg' ? 'h-12 w-12' : 'h-11 w-11 sm:h-10 sm:w-10'
      } ${active ? 'ring-2 ring-stone-900' : ''}`}
      style={{ background: option.swatch }}
    >
      {active && (
        <Check
          aria-hidden="true"
          className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]"
          strokeWidth={3}
        />
      )}
    </button>
  )
}
