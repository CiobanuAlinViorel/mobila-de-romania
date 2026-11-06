import { Check, Share2 } from 'lucide-react'
import { useState } from 'react'
import type { Product } from '../lib/types'

interface Props {
  product: Product
  /** Labels of the chosen options, e.g. "Teracotă · Nuc". */
  summary: string
  compact?: boolean
  className?: string
}

/** Shares the current configuration (it lives in the URL) via the system share sheet, or copies the link. */
export default function ShareButton({ product, summary, compact = false, className = '' }: Props) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: `${product.name} · Mobila de România`, text: `${product.name}: ${summary}`, url })
      } catch {
        // Closing the share sheet rejects: nothing to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copiază linkul configurației:', url)
    }
  }

  const label = copied ? 'Link copiat' : 'Trimite configurația'
  return (
    <button
      type="button"
      onClick={share}
      aria-label={compact ? label : undefined}
      className={`flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-white text-sm font-medium text-stone-800 transition hover:border-stone-400 active:scale-95 ${
        compact ? 'w-11' : 'px-4'
      } ${className}`}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
      {!compact && label}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Linkul a fost copiat' : ''}
      </span>
    </button>
  )
}
