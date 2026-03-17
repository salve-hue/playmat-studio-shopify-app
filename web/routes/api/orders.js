/**
 * GET /api/orders/print-files  — fetch unfulfilled orders with print file URLs
 *
 * Replaces the Cloudflare shopify-proxy Worker used by the standalone print
 * downloader tool. This backend has proper OAuth session access so it can
 * query the Shopify Admin API directly.
 *
 * Query params:
 *   created_at_min  ISO date string (default: 7 days ago)
 *   created_at_max  ISO date string (default: now)
 *
 * Response:
 *   { ok: true, orders: [ { id, name, created_at, line_items: [...] } ] }
 */

import { Router } from 'express';

const router = Router();

router.get('/print-files', async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: 'Unauthorised' });

    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const createdAtMin = req.query.created_at_min ?? sevenDaysAgo.toISOString();
    const createdAtMax = req.query.created_at_max ?? now.toISOString();

    // Validate date params to prevent injection
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(createdAtMin)
     || !/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(createdAtMax)) {
      return res.status(400).json({ error: 'Invalid date parameters' });
    }

    const params = new URLSearchParams({
      status: 'open',
      fulfillment_status: 'unfulfilled',
      created_at_min: createdAtMin,
      created_at_max: createdAtMax,
      fields: 'id,name,created_at,fulfillment_status,line_items',
      limit: '250',
    });

    const apiUrl = `https://${session.shop}/admin/api/2025-01/orders.json?${params}`;

    const response = await fetch(apiUrl, {
      headers: {
        'X-Shopify-Access-Token': session.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: 'Shopify API error', detail: text });
    }

    const { orders } = await response.json();

    // Filter: skip ETSY- prefixed orders and already-fulfilled orders
    const filtered = orders.filter(o =>
      !o.name.startsWith('ETSY-')
      && o.fulfillment_status !== 'fulfilled'
      && o.fulfillment_status !== 'partial'
    );

    // Extract only line items that have a _Print_File_URL property
    const result = filtered
      .map(o => ({
        id:           o.id,
        name:         o.name,
        created_at:   o.created_at,
        line_items:   o.line_items.filter(li =>
          li.properties?.some(p => p.name === '_Print_File_URL')
        ),
      }))
      .filter(o => o.line_items.length > 0);

    res.json({ ok: true, orders: result });
  } catch (err) {
    console.error('GET /api/orders/print-files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
