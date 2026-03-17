# Rubicon Games Supplies — Playmat Designer

A browser-based custom playmat designer embedded in a Shopify theme. Customers upload artwork, apply game-specific overlays, and submit a print-ready 300 DPI JPEG directly to cart. A companion tool handles bulk print file downloads for order fulfilment.

---

## Repo Structure

```
rubicon-playmat/
├── shopify/
│   └── playmat-designer-v1.7.1.liquid   # Main Shopify snippet (all HTML/CSS/JS)
├── print-tool/
│   ├── index.html                        # Print file downloader (GitHub Pages PWA)
│   ├── manifest.json                     # PWA manifest
│   ├── sw.js                             # Service worker
│   ├── icon-192.png
│   └── icon-512.png
├── workers/
│   └── shopify-proxy.js                  # Cloudflare Worker — Shopify Admin API proxy
├── docs/
│   ├── playmat-designer-handoff.docx     # Session 1 handoff — full architecture reference
│   └── playmat-designer-handoff-session2.docx  # Session 2 handoff — recent changes
└── README.md
```

---

## How It Works

### Playmat Designer (`shopify/`)
A Shopify Liquid snippet included on product pages. Detects the current product ID and either:
- Shows the designer automatically (products in `ALWAYS_SHOW_PRODUCT_IDS`)
- Shows the designer when a specific variant option is selected (e.g. "Custom Artwork")

The designer has two modes:
- **Quick Upload** — upload a file, auto-fit to canvas, add to cart
- **Advanced Editor** — full canvas with zoom, pan, rotate, flip, text layers, AI upscale, AI background removal

On cart submission:
1. Canvas is rendered at 300 DPI (e.g. 7350×4350px for standard mat)
2. JFIF DPI metadata is injected into the JPEG byte stream
3. File is uploaded to Cloudflare R2 via a Worker
4. Cart item is added with `_Print_File_URL` line item property

### Print File Downloader (`print-tool/`)
A standalone PWA hosted on GitHub Pages at `https://salve-hue.github.io/print-tool/`. Connects to the Shopify Admin API via the Cloudflare proxy Worker to fetch unfulfilled orders, then bulk-downloads all print files as a ZIP.

### Cloudflare Workers (`workers/`)
- **shopify-proxy** — proxies Shopify Admin API requests from the downloader tool (CORS bypass). Deployed at `shopify-proxy.salve.workers.dev`.
- **Upload Worker** — accepts image POST, stores in R2, returns public URL. URL stored in `window.CLOUDFLARE_UPLOAD_URL` in the Liquid snippet.
- **AI Upscale Worker** — bridges to Replicate API for image upscaling. URL in `window.CLOUDFLARE_WORKER_URL`.
- **Background Removal Worker** — bridges to Replicate API. URL in `window.CLOUDFLARE_BG_WORKER_URL`.

> Note: Only the shopify-proxy Worker source is in this repo. The upload and AI Workers are managed separately in Cloudflare.

---

## Configuration

All configuration lives inside `playmat-designer-v1.7.1.liquid`. Search for these blocks to update them:

| Config | Location | Purpose |
|--------|----------|---------|
| `window.CLOUDFLARE_UPLOAD_URL` | Top of `<script>` | R2 upload Worker URL |
| `window.CLOUDFLARE_WORKER_URL` | Top of `<script>` | AI upscale Worker URL |
| `window.CLOUDFLARE_BG_WORKER_URL` | Top of `<script>` | Background removal Worker URL |
| `SIZE_DB` | `~line 753` | Canvas dimensions per size key |
| `PRODUCT_SIZE_MAP` | `~line 767` | Maps product ID → size key |
| `ALWAYS_SHOW_PRODUCT_IDS` | `~line 779` | Products that always show the designer |
| `LAYOUT_RAW` | `~line 850` | All game overlay definitions |
| `RB_POINTS_DB` | After `LAYOUT_RAW` | Riftbound points overlay URLs |

### Adding a New Product
1. Add the product ID to `ALWAYS_SHOW_PRODUCT_IDS`
2. If it's not standard size (24.5" × 14.5"), add a size key to `SIZE_DB` and map the product in `PRODUCT_SIZE_MAP`

### Adding a New Size
Add an entry to `SIZE_DB`:
```javascript
"mykey": { w: 30.5, h: 14.5, label: '30" x 14"' }
```
- `w` and `h` are the **canvas** dimensions in inches (physical print size + 0.25" bleed each side)
- Bleed: 0.25" (75px at 300 DPI)
- Safe area: 0.75" (225px at 300 DPI)
- Print resolution: `w * 300` × `h * 300` pixels

---

## Product Size Reference

| Size Key | Canvas (inches) | Print Resolution | Product |
|----------|----------------|-----------------|---------|
| `standard` | 24.5 × 14.5 | 7350 × 4350px | Standard Playmat |
| `extended` | 28.5 × 14.5 | 8550 × 4350px | Extended Playmat |
| `wide16` | 28.5 × 16.5 | 8550 × 4950px | Custom 28" × 16" Playmat |
| `victor` | 24.0 × 12.0 | 7200 × 3600px | Victor Deskmat |
| `secundus` | 28.0 × 12.0 | 8400 × 3600px | Secundus Deskmat |
| `primus` | 31.0 × 12.0 | 9300 × 3600px | Primus Deskmat |
| `tiro` | 10.0 × 8.0 | 3000 × 2400px | Tiro Mousepad |
| `veteranus` | 12.0 × 10.0 | 3600 × 3000px | Veteranus Mousepad |
| `gladiator` | 18.0 × 12.0 | 5400 × 3600px | Gladiator Mousepad |

---

## Deployment

### Shopify Snippet
1. In Shopify admin go to **Online Store → Themes → Edit Code**
2. Under **Snippets**, open `playmat-designer.liquid` (or whichever filename it's saved as)
3. Replace the contents with the updated file
4. Save — changes are live immediately

### Print Tool (GitHub Pages)
The `print-tool/` folder maps directly to the `salve-hue/print-tool` GitHub repo root.
- Push changes to `main` — GitHub Pages deploys automatically
- Live URL: `https://salve-hue.github.io/print-tool/`

### Cloudflare Worker (shopify-proxy)
```bash
cd workers
wrangler deploy shopify-proxy.js
```
Or paste into the Cloudflare dashboard Workers editor manually.

---

## Roadmap

### Immediate
- [ ] Retry button on "Failed to fetch" cart error
- [ ] Apply `changeSize()` defer fix to simple canvas (currently advanced only)
- [ ] End-to-end test of Paste URL → cart flow

### Near-term
- [ ] Convert to **Railway-hosted Shopify app** (Node.js / Express)
  - Moves R2 upload, Worker proxy, and settings into a proper backend
  - Eliminates manual theme file edits for deployments
  - Fixes CORS at the source
- [ ] **Admin settings UI** — manage overlays, product map, Worker URLs without touching code

### Long-term
- [ ] Shopify app store listing (target: TCG/gaming supply stores, ~$30–50/month)
- [ ] Standalone tool with Supabase auth + saved designs
- [ ] Print-on-demand partner integration (Gelato / Prodigi)

---

## Key Technical Notes for Claude Code

- **`buildPrintCanvas()`** is the most sensitive function — all print export logic lives here. Changes affect every product's output.
- **`injectJpegDpi()`** must always wrap the `toBlob()` result. Chrome outputs EXIF APP1 not JFIF APP0, so in-place patching doesn't work — the function strips and replaces the entire APP0/APP1 header.
- **`getPageVariant()`** has four fallback levels covering: standard Shopify pages, bundle app pages, any radio with `data-variant-id`, and single-variant products (uses `_variantTitleMap`). Do not simplify.
- **Fabric.js `setZoom()`** only moves the viewport — it does not reposition objects. Print exports draw art directly using `scaleX/Y * print/display ratio` to avoid crop bugs.
- **`ALWAYS_SHOW_PRODUCT_IDS` and `PRODUCT_SIZE_MAP`** must be kept in sync. A product in one but not the other will either not show the designer or use the wrong canvas size.

---

## Reference Docs

Full architecture, infrastructure, all historical bug fixes, and detailed technical notes are in `/docs/`:
- `playmat-designer-handoff.docx` — Session 1: complete architecture reference
- `playmat-designer-handoff-session2.docx` — Session 2: recent changes and current state
