/**
 * Renders the snapshots with the app's own 3D viewer (hidden route /snapshot/:slug), using a headless
 * Chromium-based browser that is already installed (Edge or Chrome) through playwright-core.
 *
 *   catalog  square, one camera for every product: the home-page grid keeps the real proportions
 *            between products (a stool looks smaller than a wardrobe)
 *   detail   4:3, same framing as the interactive viewer: poster shown while the 3D model loads
 *
 * Output: public/snapshots/*.webp + src/generated/snapshots.json
 *
 * Usage: pnpm snapshots [slug ...]
 * Env:   BROWSER_PATH=/path/to/chrome   use a specific browser executable
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import sharp from 'sharp'
import { createServer } from 'vite'
import catalogJson from '../src/data/products.json' with { type: 'json' }
import type { Catalog, ModelManifest, SnapshotFraming, SnapshotImage, SnapshotManifest } from '../src/lib/types.ts'

const catalog = catalogJson as unknown as Catalog
const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'public', 'snapshots')
const MANIFEST = path.join(ROOT, 'src', 'generated', 'snapshots.json')

/** Render size and output widths per framing. */
const VARIANTS: Record<SnapshotFraming, { width: number; height: number; outputs: number[] }> = {
  catalog: { width: 1200, height: 1200, outputs: [960, 480] },
  detail: { width: 1600, height: 1200, outputs: [1600, 800] },
}

const models: ModelManifest = JSON.parse(await readFile(path.join(ROOT, 'src', 'generated', 'models.json'), 'utf8'))
const only = process.argv.slice(2)
const targets = catalog.products.filter((p) => (!only.length || only.includes(p.slug)) && models.models[p.slug])
if (!targets.length) throw new Error('Nothing to render: run `pnpm models` first (or check the slugs).')

async function launchBrowser(): Promise<Browser> {
  const args = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  const attempts: [string, () => Promise<Browser>][] = []
  if (process.env.BROWSER_PATH) {
    attempts.push([process.env.BROWSER_PATH, () => chromium.launch({ executablePath: process.env.BROWSER_PATH, args })])
  }
  attempts.push(
    ['Microsoft Edge', () => chromium.launch({ channel: 'msedge', args })],
    ['Google Chrome', () => chromium.launch({ channel: 'chrome', args })],
    ['Playwright Chromium', () => chromium.launch({ args })],
  )
  for (const [name, launch] of attempts) {
    try {
      const browser = await launch()
      console.log(`Browser: ${name} ${browser.version()}`)
      return browser
    } catch {
      // try the next one
    }
  }
  throw new Error('No Chromium-based browser found. Install Edge/Chrome, set BROWSER_PATH or run `npx playwright install chromium`.')
}

async function render(page: Page, slug: string, framing: SnapshotFraming): Promise<SnapshotImage> {
  const { width, height, outputs } = VARIANTS[framing]
  await page.setViewportSize({ width, height })
  await page.goto(`${baseUrl}snapshot/${slug}?framing=${framing}&w=${width}&h=${height}&tier=high`)
  await page.waitForFunction(() => (window as { __MDR_SNAPSHOT_READY__?: boolean }).__MDR_SNAPSHOT_READY__ === true, null, {
    timeout: 120_000,
  })
  const dataUrl = await page.evaluate(() => document.querySelector('canvas')!.toDataURL('image/png'))
  const png = Buffer.from(dataUrl.split(',')[1], 'base64')

  // Content-hashed names: safe to cache forever on any host or CDN.
  const prefix = `${slug}${framing === 'detail' ? '-detail' : ''}`
  const stale = new RegExp(`^${prefix}-\\d+\\.[0-9a-f]{10}\\.webp$`)
  await Promise.all((await readdir(OUT)).filter((f) => stale.test(f)).map((f) => rm(path.join(OUT, f))))

  const srcset: SnapshotImage['srcset'] = []
  for (const w of outputs) {
    const h = Math.round((w * height) / width)
    const webp = await sharp(png).resize(w, h).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toBuffer()
    const file = `${prefix}-${w}.${createHash('sha256').update(webp).digest('hex').slice(0, 10)}.webp`
    await writeFile(path.join(OUT, file), webp)
    srcset.push({ path: `snapshots/${file}`, width: w })
  }
  return { path: srcset[0].path, width: outputs[0], height: Math.round((outputs[0] * height) / width), srcset }
}

const server = await createServer({ root: ROOT, logLevel: 'warn', server: { port: 0, strictPort: false } })
await server.listen()
const baseUrl = server.resolvedUrls!.local[0]
const browser = await launchBrowser()

try {
  const previous: SnapshotManifest | null = await readFile(MANIFEST, 'utf8').then(JSON.parse, () => null)
  const images: SnapshotManifest['images'] = { ...previous?.images }
  await mkdir(OUT, { recursive: true })
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  page.on('pageerror', (error) => console.error(`  page error: ${error.message}`))

  for (const product of targets) {
    const started = Date.now()
    images[product.slug] = {
      catalog: await render(page, product.slug, 'catalog'),
      detail: await render(page, product.slug, 'detail'),
    }
    console.log(`${product.slug.padEnd(22)} ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }

  const ordered = Object.fromEntries(catalog.products.filter((p) => images[p.slug]).map((p) => [p.slug, images[p.slug]]))
  const sceneHeight = Math.max(...Object.values(models.models).map((m) => m.dimensions.height)) / 100
  const manifest: SnapshotManifest = { version: 1, sceneHeight, images: ordered }
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Manifest: ${path.relative(ROOT, MANIFEST)}`)
} finally {
  await browser.close()
  await server.close()
}
