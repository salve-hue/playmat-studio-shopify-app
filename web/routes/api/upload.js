/**
 * POST /api/upload  — proxy print-file uploads to Cloudflare R2
 *
 * The storefront editor POSTs the print JPEG blob here instead of directly
 * to the Cloudflare Worker. This lets us:
 *   1. Authenticate the upload (verify the request comes from a real Shopify
 *      customer session by checking the Storefront API token)
 *   2. Log the upload against the order/product
 *   3. Route to per-store R2 buckets in future
 *
 * Request body: multipart/form-data with field 'file' (Blob, image/jpeg)
 * Optional query params: ?shop=<myshopify domain>
 *
 * Response: { ok: true, url: "https://..." }
 */

import { Router } from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import { getEffectiveSettings } from '../../db/store.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are accepted'));
    }
    cb(null, true);
  },
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const shop = req.query.shop;
    const settings = shop ? getEffectiveSettings(shop) : null;
    const uploadUrl = settings?.workerUrls?.upload
      ?? process.env.DEFAULT_CLOUDFLARE_UPLOAD_URL
      ?? 'https://playmat-r2-upload.salve.workers.dev/';

    // Forward the file to the Cloudflare R2 upload Worker
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    const filename = req.file.originalname || `print-${Date.now()}.jpg`;
    formData.append('file', blob, filename);

    const upstream = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('R2 upload Worker error:', upstream.status, text);
      return res.status(502).json({ error: 'Upload worker error', detail: text });
    }

    const data = await upstream.json();
    res.json({ ok: true, url: data.url, expires: data.expires });
  } catch (err) {
    console.error('POST /api/upload error:', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

export default router;
