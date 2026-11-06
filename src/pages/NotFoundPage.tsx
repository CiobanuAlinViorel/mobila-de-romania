import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-5 py-24 text-center">
      <title>Pagina nu există · Mobila de România</title>
      <p className="font-serif text-6xl font-semibold text-stone-300">404</p>
      <h1 className="mt-4 font-serif text-2xl font-semibold text-stone-900">Pagina căutată nu există</h1>
      <p className="mt-2 text-stone-600">Produsul a fost mutat sau adresa este greșită.</p>
      <Link to="/" className="mt-6 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700">
        Înapoi la catalog
      </Link>
    </div>
  )
}
