import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import Layout from './components/Layout'
import './index.css'
import { loadSnapshotPage } from './lib/lazy'
import HomePage from './pages/HomePage'
import NotFoundPage from './pages/NotFoundPage'
import ProductPage from './pages/ProductPage'

const router = createBrowserRouter(
  [
    {
      path: '/snapshot/:slug',
      HydrateFallback: () => null,
      lazy: async () => ({ Component: (await loadSnapshotPage()).default }),
    },
    {
      element: <Layout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'produs/:slug', element: <ProductPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
