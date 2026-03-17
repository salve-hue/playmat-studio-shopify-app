#!/usr/bin/env node
/**
 * Migration script — extracts the editor JS and CSS from the original
 * playmat-designer-v1.7.1.liquid and writes them as Theme App Extension assets.
 *
 * Run once:
 *   node scripts/extract-editor-js.js
 *
 * Outputs:
 *   extensions/playmat-designer/assets/playmat-designer.js
 *
 * What it changes vs. the original JS:
 *   1. Replaces the hardcoded CLOUDFLARE_* window assignments with
 *      no-ops (the bootstrap sets these before this script runs).
 *   2. Wraps SIZE_DB, PRODUCT_SIZE_MAP, ALWAYS_SHOW_PRODUCT_IDS, LAYOUT_RAW,
 *      and RB_POINTS_DB definitions to fall back to window.PLAYMAT_* overrides
 *      set by the bootstrap, so the app admin settings take effect at runtime.
 *   3. Removes the {% schema %} block (Liquid-only, not valid in .js files).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const liquidPath = path.join(root, 'playmat-designer-v1.7.1.liquid');
const outPath    = path.join(root, 'extensions/playmat-designer/assets/playmat-designer.js');

const src = fs.readFileSync(liquidPath, 'utf8');

// ── Extract the JS block ──────────────────────────────────────────────────────
// The script block starts after <script> on line 676 and ends before </script>
// followed by {% schema %}.
const scriptStart = src.indexOf('<script>\n    fabric.Object.prototype');
const scriptEnd   = src.indexOf('</script>\n\n{% schema %}');

if (scriptStart === -1 || scriptEnd === -1) {
  console.error('Could not locate script block boundaries. Check the liquid file format.');
  process.exit(1);
}

// Extract everything between <script> and </script>
let js = src.slice(scriptStart + '<script>\n'.length, scriptEnd);

// ── Apply config override patches ────────────────────────────────────────────

// 1. Wrap Worker URL assignments so the bootstrap values take precedence
js = js.replace(
  /window\.CLOUDFLARE_WORKER_URL\s*=\s*'[^']+';/,
  "window.CLOUDFLARE_WORKER_URL    = window.CLOUDFLARE_WORKER_URL    || 'https://playmat-upscaler.salve.workers.dev';"
);
js = js.replace(
  /window\.CLOUDFLARE_BG_WORKER_URL\s*=\s*'[^']+';/,
  "window.CLOUDFLARE_BG_WORKER_URL = window.CLOUDFLARE_BG_WORKER_URL || 'https://playmat-removebg.salve.workers.dev/';"
);
js = js.replace(
  /window\.CLOUDFLARE_UPLOAD_URL\s*=\s*'[^']+';/,
  "window.CLOUDFLARE_UPLOAD_URL    = window.CLOUDFLARE_UPLOAD_URL    || 'https://playmat-r2-upload.salve.workers.dev/';"
);

// 2. Wrap SIZE_DB so backend overrides take effect
js = js.replace(
  /const SIZE_DB = \{/,
  'const SIZE_DB = window.PLAYMAT_SIZE_DB || {'
);
// SIZE_DB ends at the closing }; — find the matching closing brace
// Simpler: replace "const SIZE_DB = window.PLAYMAT_SIZE_DB || {" ... "};"
// by appending a fallback terminator. The object literal already ends with };
// The replacement above changes `const SIZE_DB = {` to `const SIZE_DB = window.PLAYMAT_SIZE_DB || {`
// so the literal still acts as a fallback. No further change needed here.

// 3. Wrap PRODUCT_SIZE_MAP
js = js.replace(
  /const PRODUCT_SIZE_MAP = \{/,
  'const PRODUCT_SIZE_MAP = window.PLAYMAT_PRODUCT_SIZE_MAP || {'
);

// 4. Wrap ALWAYS_SHOW_PRODUCT_IDS
js = js.replace(
  /const ALWAYS_SHOW_PRODUCT_IDS = \[/,
  'const ALWAYS_SHOW_PRODUCT_IDS = window.PLAYMAT_ALWAYS_SHOW_IDS || ['
);

// 5. Wrap LAYOUT_RAW — back-end can inject new game overlays at runtime
js = js.replace(
  /const LAYOUT_RAW = \[/,
  'const LAYOUT_RAW = (window.PLAYMAT_LAYOUT_RAW && window.PLAYMAT_LAYOUT_RAW.length ? window.PLAYMAT_LAYOUT_RAW : ['
);
// Close the array with an extra ] if we opened a ternary
// Find the closing ]; for LAYOUT_RAW and add extra ] before ;
// This is fragile with a regex — use a landmark comment instead
js = js.replace(
  /(\{ game: "Flesh and Blood", format: "Double Arsenal"[^\n]+\n    \];)/,
  (match) => match.replace('];', ']);')
);

// 6. Wrap RB_POINTS_DB — already uses window.RB_POINTS_DB, just ensure fallback
// (The bootstrap sets window.RB_POINTS_DB from backend if available,
//  so no change needed — the existing code already reads window.RB_POINTS_DB directly.)

// ── Write output ──────────────────────────────────────────────────────────────
const header = `/**
 * Playmat Studio — Main Editor JS
 * Auto-generated from playmat-designer-v1.7.1.liquid by scripts/extract-editor-js.js
 *
 * Config variables (CLOUDFLARE_* URLs, SIZE_DB, PRODUCT_SIZE_MAP, etc.) are
 * overridden at runtime by playmat-designer-bootstrap.js, which fetches them
 * from the Playmat Studio app backend. Edit settings in the app admin panel
 * rather than modifying this file directly.
 *
 * @version 1.7.1b
 */
/* global fabric */
`;

fs.writeFileSync(outPath, header + js, 'utf8');
console.log(`✓ Extracted editor JS to ${outPath}`);
console.log(`  Lines: ${js.split('\n').length}`);
