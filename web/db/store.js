/**
 * Simple settings store backed by a JSON file.
 * In production on Railway, use SQLite (via @shopify/shopify-app-session-storage-sqlite)
 * or swap this module for a Postgres client.
 *
 * Schema per shop:
 * {
 *   workerUrls: { upload, upscale, bgRemove },
 *   sizeDb: { [key]: { w, h, label } },
 *   productSizeMap: { [productId]: sizeKey },
 *   alwaysShowProductIds: number[],
 *   layoutRaw: Array<{ game, format, size, hand, url }>,
 *   rbPointsDb: { [key]: string|undefined },
 * }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/settings.json');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getSettings(shop) {
  const all = readAll();
  return all[shop] ?? null;
}

export function saveSettings(shop, settings) {
  const all = readAll();
  all[shop] = { ...all[shop], ...settings };
  writeAll(all);
  return all[shop];
}

export function deleteSettings(shop) {
  const all = readAll();
  delete all[shop];
  writeAll(all);
}

// --- Default settings shipped with the app ---
export const DEFAULT_SIZE_DB = {
  standard:  { w: 24.5, h: 14.5, label: '24" x 14"' },
  extended:  { w: 28.5, h: 14.5, label: '28" x 14"' },
  victor:    { w: 24.0, h: 12.0, label: '24" x 12"' },
  secundus:  { w: 28.0, h: 12.0, label: '28" x 12"' },
  primus:    { w: 31.0, h: 12.0, label: '31" x 12"' },
  tiro:      { w: 10.0, h:  8.0, label: '10" x 8"'  },
  veteranus: { w: 12.0, h: 10.0, label: '12" x 10"' },
  gladiator: { w: 18.0, h: 12.0, label: '18" x 12"' },
  wide16:    { w: 28.5, h: 16.5, label: '28" x 16"' },
};

export const DEFAULT_PRODUCT_SIZE_MAP = {
  8712290107651: 'extended',
  9055451971843: 'victor',
  9049146884355: 'secundus',
  9049147867395: 'primus',
  9049030951171: 'tiro',
  9049140494595: 'veteranus',
  9049145737475: 'gladiator',
  9333936718083: 'wide16',
};

export const DEFAULT_ALWAYS_SHOW_IDS = [
  8712290107651,
  9055451971843,
  9049146884355,
  9049147867395,
  9049030951171,
  9049140494595,
  9049145737475,
  8632969527555,
  9278146085123,
  9333936718083,
];

export const DEFAULT_RB_POINTS_DB = {
  none:         undefined,
  basic:        'https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/rb-points-basic.png',
  basic_1_14:   'https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/rb-points-basic-1-14.png',
  project:      'https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/rb-points-project.png',
  project_1_14: 'https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/rb-points-project-1-14.png',
  lunar:        'https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/rb-points-lunar.png',
  lunar_1_14:   'https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/rb-points-lunar-1-14.png',
  khasino:      'https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/rb-points-khasino.png',
};

/**
 * Get effective settings for a shop, merging stored overrides over defaults.
 */
export function getEffectiveSettings(shop) {
  const stored = getSettings(shop) ?? {};
  return {
    workerUrls: stored.workerUrls ?? {
      upload:   process.env.DEFAULT_CLOUDFLARE_UPLOAD_URL ?? 'https://playmat-r2-upload.salve.workers.dev/',
      upscale:  process.env.DEFAULT_CLOUDFLARE_WORKER_URL ?? 'https://playmat-upscaler.salve.workers.dev',
      bgRemove: process.env.DEFAULT_CLOUDFLARE_BG_WORKER_URL ?? 'https://playmat-removebg.salve.workers.dev/',
    },
    sizeDb:              stored.sizeDb ?? DEFAULT_SIZE_DB,
    productSizeMap:      stored.productSizeMap ?? DEFAULT_PRODUCT_SIZE_MAP,
    alwaysShowProductIds: stored.alwaysShowProductIds ?? DEFAULT_ALWAYS_SHOW_IDS,
    layoutRaw:           stored.layoutRaw ?? [],
    rbPointsDb:          stored.rbPointsDb ?? DEFAULT_RB_POINTS_DB,
  };
}
