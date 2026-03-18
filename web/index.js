/**
 * Playmat Studio — Shopify App Backend
 * Node.js / Express — deployable on Railway
 *
 * Replaces the Cloudflare Workers proxy and the manual theme-file-edit workflow.
 * Provides:
 *   - Shopify OAuth flow
 *   - Per-store settings API (overlays, product map, worker URLs)
 *   - Upload proxy (Cloudflare R2)
 *   - Admin API orders endpoint (replaces shopify-proxy Worker)
 *   - Static admin UI (Polaris)
 */

import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import serveStatic from 'serve-static';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import shopifyPkg from '@shopify/shopify-app-express';
import { MemorySessionStorage } from '@shopify/shopify-app-session-storage-memory';
import { webhookHandlers } from './routes/webhooks.js';
import settingsRouter from './routes/api/settings.js';
import uploadRouter from './routes/api/upload.js';
import ordersRouter from './routes/api/orders.js';

const { shopifyApp } = shopifyPkg;
const LATEST_API_VERSION = '2025-04';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '8080', 10);

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
  sessionStorage: new MemorySessionStorage(),
});

// Register webhook handlers
shopify.api.webhooks.addHandlers(webhookHandlers);

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

// CORS — allow the Shopify admin embed and the storefront
app.use(cors({
  origin: (origin, cb) => {
    // Allow Shopify admin embeds, the CDN, and the storefront
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

// ── Authenticated API routes ──────────────────────────────────────────────────
app.use('/api/settings', shopify.validateAuthenticatedSession(), settingsRouter);
app.use('/api/upload', uploadRouter);           // auth handled inside via Shopify customer token
app.use('/api/orders', shopify.validateAuthenticatedSession(), ordersRouter);

// ── Public config endpoint ────────────────────────────────────────────────────
// /api/settings/config is unauthenticated (returns only public config)
// It's mounted BEFORE the validateAuthenticatedSession middleware above,
// so we expose it directly:
import settingsConfigRouter from './routes/api/settings.js';
app.get('/api/config', async (req, res) => {
  const { shop } = req.query;
  if (!shop || !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
    return res.status(400).json({ error: 'Invalid shop parameter' });
  }
  // Re-use the /config sub-route logic by forwarding
  req.url = '/config';
  settingsConfigRouter(req, res, () => {
    res.status(404).json({ error: 'Not found' });
  });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.7.1' }));

// ── Admin UI (static files — React + Polaris SPA) ────────────────────────────
app.use(serveStatic(join(__dirname, 'public/admin'), { index: false }));

app.use('/*', shopify.ensureInstalledOnShop(), async (_req, res) => {
  res.sendFile(join(__dirname, 'public/admin/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Playmat Studio app running on port ${PORT}`);
  console.log(`Host: ${process.env.HOST ?? 'not set — set HOST env var'}`);
});
