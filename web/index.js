/**
 * Playmat Studio — Shopify App Backend
 * Node.js / Express — deployable on Railway
 *
 * Provides:
 *   - Shopify OAuth flow
 *   - Per-store settings API (overlays, product map, worker URLs)
 *   - Upload proxy (Cloudflare R2)
 *   - Admin API orders endpoint
 *   - Static admin UI (Polaris)
 *
 * Session storage:
 *   - If DATABASE_URL is set (Supabase / any PostgreSQL): uses PostgreSQL
 *   - Otherwise: falls back to MemorySessionStorage (dev only)
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env only in development (Railway injects real env vars at runtime)
if (process.env.NODE_ENV !== 'production') {
  const __dir = dirname(fileURLToPath(import.meta.url));
  dotenvConfig({ path: resolve(__dir, '.env') });
}

// ── Startup diagnostics ───────────────────────────────────────────────────────
console.log('[startup] NODE_ENV      :', process.env.NODE_ENV);
console.log('[startup] SHOPIFY_API_KEY:', process.env.SHOPIFY_API_KEY ? '✓ set' : '✗ MISSING');
console.log('[startup] SHOPIFY_API_SECRET:', process.env.SHOPIFY_API_SECRET ? '✓ set' : '✗ MISSING');
console.log('[startup] HOST           :', process.env.HOST ?? '✗ MISSING');

import express from 'express';
import { join } from 'path';
import serveStatic from 'serve-static';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import shopifyPkg from '@shopify/shopify-app-express';
import { MemorySessionStorage } from '@shopify/shopify-app-session-storage-memory';
import { PostgreSQLSessionStorage } from '@shopify/shopify-app-session-storage-postgresql';
import { webhookHandlers } from './routes/webhooks.js';
import settingsRouter from './routes/api/settings.js';
import uploadRouter from './routes/api/upload.js';
import ordersRouter from './routes/api/orders.js';
import { getEffectiveSettings } from './db/store.js';

const { shopifyApp } = shopifyPkg;
const LATEST_API_VERSION = '2025-04';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '8080', 10);

// ── Session storage ───────────────────────────────────────────────────────────
// Use PostgreSQL (Supabase) when DATABASE_URL is available, otherwise memory.
// MemorySessionStorage loses sessions on every restart — only use for local dev.
const sessionStorage = process.env.DATABASE_URL
  ? new PostgreSQLSessionStorage(process.env.DATABASE_URL)
  : new MemorySessionStorage();

if (!process.env.DATABASE_URL) {
  console.warn('[startup] WARNING: Using MemorySessionStorage. Sessions will be lost on restart.');
  console.warn('[startup]          Set DATABASE_URL (Supabase connection string) for production.');
}

// ── Shopify app setup ─────────────────────────────────────────────────────────

const shopify = shopifyApp({
  api: {
    apiKey:       process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes:       (process.env.SCOPES ?? 'read_orders,write_orders,read_products,write_script_tags,read_customers').split(','),
    hostName:     (process.env.HOST ?? '').replace(/^https?:\/\//, ''),
    apiVersion:   LATEST_API_VERSION,
  },
  auth: {
    path:         '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
  sessionStorage,
});

// Register webhook handlers
shopify.api.webhooks.addHandlers(webhookHandlers);

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

// CORS — allow the Shopify admin embed and the storefront
app.use(cors({
  origin: (origin, cb) => {
    if (!origin
     || origin.includes('.myshopify.com')
     || origin.includes('.shopify.com')
     || origin.includes('shopifycdn.com')
     || (process.env.NODE_ENV !== 'production' && origin.includes('localhost'))) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
}));

app.use(cookieParser());

// ── OAuth routes (must be before json body parser) ───────────────────────────
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(shopify.config.auth.callbackPath, shopify.auth.callback(), shopify.redirectToShopifyOrAppRoot());

// ── Webhook route (raw body needed for HMAC) ─────────────────────────────────
app.post(shopify.config.webhooks.path, express.raw({ type: 'application/json' }), shopify.processWebhooks({ webhookHandlers }));

// ── JSON body parser for all other routes ────────────────────────────────────
app.use(express.json({ limit: '5mb' }));

// ── Public config endpoint ────────────────────────────────────────────────────
// Unauthenticated — called by the Theme App Extension on every storefront page load.
// Returns only read-only config (no secrets).
app.get('/api/config', async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop || !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
      return res.status(400).json({ error: 'Invalid shop parameter' });
    }
    const s = getEffectiveSettings(shop);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      ok: true,
      workerUrls:           s.workerUrls,
      sizeDb:               s.sizeDb,
      productSizeMap:       s.productSizeMap,
      alwaysShowProductIds: s.alwaysShowProductIds,
      layoutRaw:            s.layoutRaw,
      rbPointsDb:           s.rbPointsDb,
    });
  } catch (err) {
    console.error('GET /api/config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.7.1' }));

// ── Authenticated API routes ──────────────────────────────────────────────────
app.use('/api/settings', shopify.validateAuthenticatedSession(), settingsRouter);
app.use('/api/upload',   uploadRouter);  // auth handled per-request via shop query param
app.use('/api/orders',   shopify.validateAuthenticatedSession(), ordersRouter);

// ── Admin UI (static files — Polaris SPA) ────────────────────────────────────
app.use(serveStatic(join(__dirname, 'public/admin'), { index: false }));

app.use('/*', shopify.ensureInstalledOnShop(), async (_req, res) => {
  const html = readFileSync(join(__dirname, 'public/admin/index.html'), 'utf8')
    .replace('__SHOPIFY_API_KEY__', process.env.SHOPIFY_API_KEY ?? '');
  res.type('html').send(html);
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Playmat Studio app running on port ${PORT}`);
  console.log(`Host: ${process.env.HOST ?? 'not set — set HOST env var'}`);
});
