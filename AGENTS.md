# Mobila de România: agent notes

Static furniture catalog with a 3D configurator, no backend and no cart. Built once, deployed to several
environments (on-premise nginx, Vercel, Azure Static Web Apps, Azure VM, Shopify for the 3D files).

## Stack
- Vite 8, React 19.3, TypeScript 6.0, Tailwind 4, react-router 7, three 0.186 + @react-three/fiber 9 + drei 10.
- pnpm 11; `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (only versions public for 7+ days).
- Asset scripts are TypeScript run directly by Node (type stripping): gltf-transform 4, meshoptimizer, sharp,
  playwright-core (drives the installed Edge/Chrome, no browser download).

## Commands
- `pnpm dev` -> http://localhost:5173
- Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- `pnpm models [slug ...]`: rebuilds `public/models/{high,medium,low}` + `src/generated/models.json` from `assets/*.glb`
- `pnpm snapshots [slug ...]`: renders `public/snapshots` + `src/generated/snapshots.json` (`BROWSER_PATH` to pick a browser)
- `pnpm assets`: both. Generated files are committed: CI hosts only run `pnpm build`.
- Tests fail when a product, part, finish texture or snapshot in the manifests is missing on disk: run `pnpm assets`
  after changing `src/data/products.json` or `assets/`.

## Assets pipeline (scripts/build-models.ts)
- `assets/` holds the raw source models; they are never served.
- Per product (`model` in products.json): `unitScale` converts to meters (the 6 cm-based models use 0.01; the
  script aborts if the height is outside 0.2–3 m), `materials` fixes source materials (e.g. birou BLEND -> MASK,
  which hid the wooden desktop; Sketchfab wood/leather metalness -> 0). The model is centered on X/Z, floor at y = 0.
- `parts` select triangles by source `materials`, `texel` ranges on the base color / metal-rough texture
  (lum, sat, hue, metal, rough) and centroid height `y` (m). First matching part wins.
  - `color`: base texture replaced by a neutral luminance texture; runtime sets `material.color` (detail kept).
  - `wood`: one gradient-mapped base color texture baked per finish (`finishes.wood`), loaded on demand.
  - `metal`: flattened to factors; finishes set color / metalness / roughness.
  Part materials are named `mdr-<part>-<n>` and tagged `extras.mdr` (`material.userData.mdr` in three.js).
- Tiers: `high` = original PNG/JPEG, plain geometry, no required extensions (Shopify, AR, any viewer);
  `medium` (web default) = WebP color maps q92 + near-lossless data maps, meshopt; `low` = 512 px, meshopt,
  meshes > 4000 triangles simplified. Never use lossy WebP for normal / metal-roughness / occlusion maps: chroma
  subsampling corrupts the packed channels (measured ≤ 38 dB, near-lossless ≥ 47 dB). Rendered medium vs high: 42–47 dB.
- Output file names are content-hashed, so all hosts cache `/models/*`, `/snapshots/*` and `/assets/*` immutable.
- Colors in products.json are *perceived* colors; dielectric albedo = color × `ALBEDO_SCALE` (0.5, linear) in
  `src/lib/appearance.ts`, matching how the source models are authored. Metal finish colors (metalness ≥ 0.5) are
  physical reflectance.

## Adding a product
1. Drop the `.glb` into `assets/`, add the entry to `src/data/products.json` (`model.source`, `unitScale`, `parts`).
2. `pnpm assets`, then check `/produs/<slug>` (try every option) and `pnpm test`.
3. To tune a texel selector, render the part split: options change only the triangles of that part.

## App
- Home (`/`): snapshot grid, one shared camera for every product (natural relative scale). No three.js on this page.
- Product (`/produs/:slug`): lazy 3D viewer (three's GLTFLoader + MeshoptDecoder, no Draco CDN), orbit controls,
  configurator. The configuration lives in the URL (`?sezut=teracota&picioare=nuc`); `?q=high|medium|low` forces a tier.
  The poster is a snapshot rendered with the viewer's own framing, so it cross-fades into the 3D view.
- `/snapshot/:slug` is a hidden route used by `pnpm snapshots`.
- Fullscreen (`components/ViewerStage.tsx` + `lib/useFullscreen.ts`): Fullscreen API where available, otherwise a
  fixed overlay (iPhone Safari has no element fullscreen) that locks page scroll. Esc exits in both modes, focus
  goes to the close button and back. In fullscreen the configurator is `ConfiguratorStrip` (part tabs + swatch row):
  bottom panel, or side panel on phones held sideways (`short-landscape:` custom variant in `index.css`).
- Touch: inline viewer is `touch-action: pan-y` (vertical swipe scrolls the page, horizontal rotates), fullscreen is
  `none` (pinch zoom). Set with `!important` classes on the R3F `<Canvas>`: OrbitControls rewrites the inline style.
- When the viewport shape changes (fullscreen, rotation) the camera keeps the visitor's angle and only refits the
  distance (`viewDirection` + `frameBox({ direction })`); a full re-frame happens only on product change / reset.
- Mobile-first layout: full-bleed viewer, title + price + configurator above the fold, swipeable rows
  (`no-scrollbar` utility), ≥ 44 px touch targets, 2-column cards, sticky bottom bar (price, share via Web Share
  API / clipboard, fullscreen). `viewport-fit=cover` + `env(safe-area-inset-*)` for notches.
- Fullscreen/mobile behaviour is verified with Playwright in mobile emulation (native + overlay fallback, swatches
  in fullscreen, computed touch-action, landscape, desktop Esc); keep those checks when changing the stage.
- react-hooks v7 (React Compiler lint) forbids mutating hook values (three.js objects from `useThree`/`useLoader`)
  inside components: do those mutations in plain helpers (`viewer/materials.ts`, `viewer/framing.ts`).
- Tone mapping: Khronos PBR Neutral via `gl={{ toneMapping: THREE.NeutralToneMapping }}` (keeps product colors).

## Runtime configuration (one build, every environment)
Priority: `?q=` (tier) > visitor choice (localStorage) > `public/config.js` (`window.__MDR_CONFIG__`) > `VITE_*` build
variables > defaults. `config.js` is never cached by any of the deployment configs.
- `assetsBaseUrl`: folder with `models/` + `snapshots/` (default: the site). For a CDN / Azure Blob Storage the host
  must send CORS headers; our own deployments send `Access-Control-Allow-Origin: *` on those folders.
- `modelTier`: `auto` (medium; low on data saver / 2g / 3g / ≤ 2 GB RAM) | `high` | `medium` | `low`.
- `VITE_BASE_PATH` (build time only) serves the app from a sub-path; the nginx config assumes the site root.

## Deployment
- Azure Static Web Apps: `public/staticwebapp.config.json` (copied into `dist/`) + `.github/workflows/azure-static-web-apps.yml`
  (pnpm build, then uploads `dist/` with `skip_app_build`). Secret `AZURE_STATIC_WEB_APPS_API_TOKEN`; optional
  repository variables `VITE_ASSETS_BASE_URL`, `VITE_MODEL_TIER`. Free plan: 250 MB per environment, `dist/` ≈ 41 MB.
  Local check: `npx @azure/static-web-apps-cli start dist --swa-config-location dist` (verified: fallback, 404s, headers).
- Vercel: `vercel.json` (pnpm build -> `dist`, SPA rewrite that skips the asset folders, cache headers).
- nginx on Linux (on-premise machine, Azure VM): `pnpm build && sudo deploy/nginx/install.sh` (copies `dist/` to
  `/var/www/mobila-de-romania`, keeps the host's `config.js`, installs `deploy/nginx/mobila-de-romania.conf`).
  Put TLS in front (certbot, Azure Application Gateway / Front Door).
- Docker (any host): `docker compose up -d --build` -> http://localhost:8080; `MDR_ASSETS_BASE_URL` / `MDR_MODEL_TIER`
  are written to `config.js` at container start (`deploy/nginx/40-runtime-config.sh`). Verified with nginx 1.30.
- Shopify: upload `public/models/high/<slug>.<hash>.glb` as product media (meters, < 15 MB, no required extensions).
  Shopify cannot attach 3D models to variants, so the configurator itself would need a custom theme section.

## Machine notes
- Docker Desktop is normally off: `docker desktop start` before building images, `docker desktop stop` afterwards.
- Windows checkouts: shell scripts and the nginx config must stay LF (`.gitattributes`; the Dockerfile also strips CR).
  Git Bash `sed`/`grep` run in text mode and misreport/keep CRLF: convert with Node if needed.
- Headless Edge prints harmless `THREE.Clock` deprecation and D3D `X4122` shader warnings during `pnpm snapshots`.
