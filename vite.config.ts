/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // VITE_BASE_PATH lets the same app be served from a sub-path (e.g. http://server/mobila/).
  const base = `/${(env.VITE_BASE_PATH || '').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')

  return {
    base,
    plugins: [react(), tailwindcss()],
    build: {
      // The 3D viewer chunk (three.js + R3F) is large, but it is only loaded on product pages.
      chunkSizeWarningLimit: 1500,
    },
    test: {
      include: ['src/**/*.test.ts'],
    },
  }
})
