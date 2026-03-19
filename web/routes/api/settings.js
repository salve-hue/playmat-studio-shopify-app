/**
 * GET  /api/settings        — return effective settings for this shop
 * PUT  /api/settings        — save overrides for this shop
 * GET  /api/settings/config — public (no auth) config endpoint, called by the
 *                             storefront Theme App Extension to bootstrap the editor
 */

import { Router } from 'express';
import {
  getEffectiveSettings,
  saveSettings,
} from '../../db/store.js';

const router = Router();

// ── Authenticated admin endpoints ────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const shop = res.locals.shopify?.session?.shop;
    if (!shop) return res.status(401).json({ error: 'Unauthorised' });

    const settings = getEffectiveSettings(shop);
    res.json({ ok: true, settings });
  } catch (err) {
    console.error('GET /api/settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/', async (req, res) => {
  try {
    const shop = res.locals.shopify?.session?.shop;
    if (!shop) return res.status(401).json({ error: 'Unauthorised' });

    const allowed = ['workerUrls', 'sizeDb', 'productSizeMap', 'alwaysShowProductIds', 'layoutRaw', 'rbPointsDb'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const saved = saveSettings(shop, update);
    res.json({ ok: true, settings: saved });
  } catch (err) {
    console.error('PUT /api/settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Public config endpoint for the storefront ─────────────────────────────────
// The Theme App Extension calls this on page load to get dynamic config.
// We use the shop domain from the query param and do NOT require auth here —
// the endpoint only returns read-only configuration, not secrets.

router.get('/config', async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop || !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
      return res.status(400).json({ error: 'Invalid shop parameter' });
    }

    const s = getEffectiveSettings(shop);

    // Never return Cloudflare secret keys; only the public Worker URLs
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
    console.error('GET /api/settings/config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
