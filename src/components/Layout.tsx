import { Link, Outlet, ScrollRestoration } from 'react-router'

export function Logo() {
  return (
    <Link to="/" className="group flex items-center gap-2.5 sm:gap-3" aria-label="Mobila de România, pagina principală">
      <svg viewBox="0 0 40 40" className="h-8 w-8 sm:h-9 sm:w-9" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" rx="11" fill="#2b2622" />
        <path d="M11 27V15.5h3.2V25h11.6v-9.5H29V27z" fill="#f6f2ec" />
        <path d="M11 13.5h18" stroke="#c98a5d" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="leading-tight">
        <span className="block font-serif text-base font-semibold tracking-tight text-stone-900 sm:text-lg">Mobila de România</span>
        <span className="hidden text-[11px] tracking-[0.18em] text-stone-500 uppercase min-[400px]:block">Mobilier configurabil 3D</span>
      </span>
    </Link>
  )
}

export default function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-8 sm:py-3">
          <Logo />
          <nav className="text-sm font-medium text-stone-700">
            <Link to="/" className="flex min-h-10 items-center rounded-full px-3 hover:bg-stone-900/5">
              Catalog
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} Mobila de România. Prețurile sunt orientative.</p>
          <p>Modelele 3D sunt randate în browser, la dimensiuni reale.</p>
        </div>
      </footer>
      <ScrollRestoration />
    </div>
  )
}
