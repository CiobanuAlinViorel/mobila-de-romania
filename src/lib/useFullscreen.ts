import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type Mode = 'off' | 'native' | 'overlay'

type FullscreenTarget = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

const currentFullscreenElement = () =>
  document.fullscreenElement ?? (document as FullscreenDocument).webkitFullscreenElement ?? null

export interface Fullscreen {
  active: boolean
  /** `native`: Fullscreen API; `overlay`: fixed full-viewport fallback (iPhone Safari has no element fullscreen). */
  mode: Mode
  enter: () => void
  exit: () => void
}

/**
 * Fullscreen for one element. Uses the Fullscreen API where it exists (desktop, Android, iPad) and falls back
 * to a fixed overlay that locks page scrolling, so the same UI works on every device.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): Fullscreen {
  const [mode, setMode] = useState<Mode>('off')
  const returnFocus = useRef<HTMLElement | null>(null)

  const restoreFocus = useCallback(() => returnFocus.current?.focus({ preventScroll: true }), [])

  const exit = useCallback(() => {
    if (currentFullscreenElement()) {
      const doc = document as FullscreenDocument
      const leave = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(doc)
      Promise.resolve(leave?.()).catch(() => {})
    }
    setMode('off')
  }, [])

  const enter = useCallback(() => {
    const element = ref.current as FullscreenTarget | null
    if (!element) return
    returnFocus.current = document.activeElement as HTMLElement | null
    const request = element.requestFullscreen?.bind(element) ?? element.webkitRequestFullscreen?.bind(element)
    if (!request || document.fullscreenEnabled === false) {
      setMode('overlay')
      return
    }
    // Called synchronously from the click handler: the browser requires a user gesture.
    Promise.resolve(request({ navigationUI: 'hide' })).then(
      () => setMode('native'),
      () => setMode('overlay'),
    )
  }, [ref])

  useEffect(() => {
    // Leaving native fullscreen through the browser (Esc, system back gesture, browser UI).
    const onChange = () => {
      if (currentFullscreenElement()) return
      setMode((m) => (m === 'native' ? 'off' : m))
      restoreFocus()
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [restoreFocus])

  useEffect(() => {
    if (mode === 'off') {
      restoreFocus()
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exit()
    }
    window.addEventListener('keydown', onKey)
    // The overlay fallback has to stop the page behind it from scrolling.
    const root = document.documentElement
    const previous = root.style.overflow
    if (mode === 'overlay') root.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      root.style.overflow = previous
    }
  }, [mode, exit, restoreFocus])

  return { active: mode !== 'off', mode, enter, exit }
}
