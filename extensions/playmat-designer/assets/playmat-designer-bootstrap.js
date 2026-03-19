/**
 * Playmat Studio — Config Bootstrap
 *
 * Runs before the main editor JS. Fetches dynamic configuration from the
 * Shopify app backend (hosted on Railway) and sets the globals that the
 * editor expects.
 *
 * Required globals set by the Liquid block before this script loads:
 *   window.PLAYMAT_APP_URL  — Railway app base URL, no trailing slash
 *   window.PLAYMAT_SHOP     — myshopify domain (e.g. "my-store.myshopify.com")
 *
 * After this script resolves, the editor globals will be populated:
 *   window.CLOUDFLARE_UPLOAD_URL
 *   window.CLOUDFLARE_WORKER_URL
 *   window.CLOUDFLARE_BG_WORKER_URL
 *   window.PLAYMAT_SIZE_DB          (replaces const SIZE_DB in tool.js)
 *   window.PLAYMAT_PRODUCT_SIZE_MAP
 *   window.PLAYMAT_ALWAYS_SHOW_IDS
 *   window.PLAYMAT_LAYOUT_RAW
 *   window.RB_POINTS_DB
 */

(function () {
  'use strict';

  var APP_URL = window.PLAYMAT_APP_URL || '';
  var SHOP    = window.PLAYMAT_SHOP    || (window.Shopify && window.Shopify.shop) || '';

  /**
   * Apply a config object received from the backend (or use defaults).
   */
  function applyConfig(cfg) {
    var w = cfg.workerUrls || {};
    window.CLOUDFLARE_UPLOAD_URL    = w.upload   || 'https://playmat-r2-upload.salve.workers.dev/';
    window.CLOUDFLARE_WORKER_URL    = w.upscale  || 'https://playmat-upscaler.salve.workers.dev';
    window.CLOUDFLARE_BG_WORKER_URL = w.bgRemove || 'https://playmat-removebg.salve.workers.dev/';
    // Host URL used by the Share and Get Printed upload flow.
    // Stores the file for 7 days and returns a public URL.
    window.CLOUDFLARE_HOST_URL      = w.host     || 'https://files.playmatstudio.com/';

    // Override the SIZE_DB, product maps, and layout data used by the editor.
    // The editor reads these from the window object when they are present,
    // falling back to its built-in constants otherwise.
    if (cfg.sizeDb)              window.PLAYMAT_SIZE_DB          = cfg.sizeDb;
    if (cfg.productSizeMap)      window.PLAYMAT_PRODUCT_SIZE_MAP = cfg.productSizeMap;
    if (cfg.alwaysShowProductIds) window.PLAYMAT_ALWAYS_SHOW_IDS = cfg.alwaysShowProductIds;
    if (cfg.layoutRaw && cfg.layoutRaw.length) window.PLAYMAT_LAYOUT_RAW = cfg.layoutRaw;
    if (cfg.rbPointsDb)          window.RB_POINTS_DB             = cfg.rbPointsDb;

    window.__PLAYMAT_CONFIG_READY = true;
    document.dispatchEvent(new Event('playmat:config-ready'));
  }

  /**
   * Fetch config from the app backend. Falls back to noop (built-in defaults)
   * if the app URL is not configured or the request fails.
   */
  function loadConfig() {
    if (!APP_URL || !SHOP) {
      // No backend configured — editor uses its own built-in defaults.
      window.__PLAYMAT_CONFIG_READY = true;
      document.dispatchEvent(new Event('playmat:config-ready'));
      return;
    }

    var url = APP_URL + '/api/config?shop=' + encodeURIComponent(SHOP);

    fetch(url, { method: 'GET', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Config fetch returned ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data && data.ok) {
          applyConfig(data);
        } else {
          console.warn('[Playmat Studio] Config response was not ok, using built-in defaults.');
          applyConfig({});
        }
      })
      .catch(function (err) {
        console.warn('[Playmat Studio] Config fetch failed, using built-in defaults:', err.message);
        applyConfig({});
      });
  }

  loadConfig();
})();
