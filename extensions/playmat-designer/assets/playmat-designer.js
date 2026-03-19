/**
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
    fabric.Object.prototype.objectCaching = false;
    fabric.textureSize = 16384;

    // ============================================================
    // WORKER URLS — update these if workers are redeployed
    // CLOUDFLARE_WORKER_URL    — image upscaler (Replicate AI)
    // CLOUDFLARE_BG_WORKER_URL — background removal (Replicate AI)
    // CLOUDFLARE_UPLOAD_URL    — R2 print file upload
    //   Worker code: playmat-r2-upload-worker.js
    //   Deploy to Cloudflare Workers, bind your R2 bucket,
    //   then replace the URL below with your worker address.
    // ============================================================
    window.CLOUDFLARE_WORKER_URL    = window.CLOUDFLARE_WORKER_URL    || 'https://playmat-upscaler.salve.workers.dev';
    window.CLOUDFLARE_BG_WORKER_URL = window.CLOUDFLARE_BG_WORKER_URL || 'https://playmat-removebg.salve.workers.dev/';
    window.CLOUDFLARE_UPLOAD_URL    = window.CLOUDFLARE_UPLOAD_URL    || 'https://playmat-r2-upload.salve.workers.dev/';

    // ============================================================
    // FIX 2 (CODE QUALITY): Consolidated all app state into one
    // object instead of ~25 scattered window.* globals.
    // ============================================================
    const APP = {
        isMaskMode:        false,
        isRecolorMode:     false,
        currentZoom:       1,
        currentBrushShape: 'round',
        aiFgImg:           null,
        activeUpscaleEditor: null,
        activeLayoutUrl:   null,
        erasedPaths:       [],
        canvasW:           0,
        canvasH:           0,
        baseArtScale:      1,
        cachedLayoutUrl:   null,
        cachedLayoutImg:   null,
        s_activeLayoutUrl: null,
        s_cachedLayoutImg: null,
        s_baseArtScale:    1,
        // Mat size is set once from the Liquid schema setting — no runtime changes needed.
        // Variant ID and quantity are read live from the page at cart time via getPageVariant()/getPageQty().
        activeSizeKey:     'standard', // overridden by product ID detection below
        s_filters:         { enhance: false, grayscale: false },
        activePointsUrl:   null,
        _bleedConfirmCallback: null,
    };

    // Keep legacy window aliases so any external code still works
    Object.defineProperties(window, {
        isMaskMode:        { get: () => APP.isMaskMode,        set: v => APP.isMaskMode = v },
        isRecolorMode:     { get: () => APP.isRecolorMode,     set: v => APP.isRecolorMode = v },
        currentZoom:       { get: () => APP.currentZoom,       set: v => APP.currentZoom = v },
        currentBrushShape: { get: () => APP.currentBrushShape, set: v => APP.currentBrushShape = v },
        aiFgImg:           { get: () => APP.aiFgImg,           set: v => APP.aiFgImg = v },
        activeUpscaleEditor: { get: () => APP.activeUpscaleEditor, set: v => APP.activeUpscaleEditor = v },
        activeLayoutUrl:   { get: () => APP.activeLayoutUrl,   set: v => APP.activeLayoutUrl = v },
        erasedPaths:       { get: () => APP.erasedPaths,       set: v => APP.erasedPaths = v },
        canvasW:           { get: () => APP.canvasW,           set: v => APP.canvasW = v },
        canvasH:           { get: () => APP.canvasH,           set: v => APP.canvasH = v },
        baseArtScale:      { get: () => APP.baseArtScale,      set: v => APP.baseArtScale = v },
        cachedLayoutUrl:   { get: () => APP.cachedLayoutUrl,   set: v => APP.cachedLayoutUrl = v },
        cachedLayoutImg:   { get: () => APP.cachedLayoutImg,   set: v => APP.cachedLayoutImg = v },
        s_activeLayoutUrl: { get: () => APP.s_activeLayoutUrl, set: v => APP.s_activeLayoutUrl = v },
        s_cachedLayoutImg: { get: () => APP.s_cachedLayoutImg, set: v => APP.s_cachedLayoutImg = v },
        s_baseArtScale:    { get: () => APP.s_baseArtScale,    set: v => APP.s_baseArtScale = v },
        activeSizeKey:     { get: () => APP.activeSizeKey,     set: v => APP.activeSizeKey = v },
        s_filters:         { get: () => APP.s_filters,         set: v => APP.s_filters = v },
        activePointsUrl:   { get: () => APP.activePointsUrl,   set: v => APP.activePointsUrl = v },
    });

    window.rbPointsImg = new Image();
    window.rbPointsImg.crossOrigin = 'anonymous';

    window.BUNDLE_CONFIG = { enabled: false, tubeVariantId: "1234567890", getSleeveVariantId: function() { return null; } };

    // SIZE_DB: physical dimensions in inches for each canvas size key.
    // Canvas pixel dimensions = w * 300, h * 300 (all at 300 DPI).
    // Bleed: 0.25" (75px), Safe area: 0.75" (225px) — same for all sizes.
    const SIZE_DB = window.PLAYMAT_SIZE_DB || {
        //                 raw canvas size       customer-facing label
        "standard":  { w: 24.5, h: 14.5, label: '24" x 14"'  },  // Standard Playmat
        "extended":  { w: 28.5, h: 14.5, label: '28" x 14"'  },  // Extended Playmat
        "victor":    { w: 24.0, h: 12.0, label: '24" x 12"'  },  // Victor Deskmat
        "secundus":  { w: 28.0, h: 12.0, label: '28" x 12"'  },  // Secundus Deskmat
        "primus":    { w: 31.0, h: 12.0, label: '31" x 12"'  },  // Primus Deskmat
        "tiro":      { w: 10.0, h:  8.0, label: '10" x 8"'   },  // Tiro Mousepad
        "veteranus": { w: 12.0, h: 10.0, label: '12" x 10"'  },  // Veteranus Mousepad
        "gladiator": { w: 18.0, h: 12.0, label: '18" x 12"'  },  // Gladiator Mousepad
        "wide16":    { w: 28.5, h: 16.5, label: '28" x 16"'  },  // Custom 28" x 16" Playmat
    };

    // PRODUCT_SIZE_MAP: maps Shopify product ID → SIZE_DB key.
    // Add an entry here for every product page that isn't standard size.
    const PRODUCT_SIZE_MAP = window.PLAYMAT_PRODUCT_SIZE_MAP || {
        8712290107651: 'extended',   // Extended Playmat   28.5" × 14.5"
        9055451971843: 'victor',     // Victor Deskmat     24" × 12"
        9049146884355: 'secundus',   // Secundus Deskmat   28" × 12"
        9049147867395: 'primus',     // Primus Deskmat     31" × 12"
        9049030951171: 'tiro',       // Tiro Mousepad      10" × 8"
        9049140494595: 'veteranus',  // Veteranus Mousepad 12" × 10"
        9049145737475: 'gladiator',  // Gladiator Mousepad 18" × 12"
        9333936718083: 'wide16',     // Custom 28" x 16" Playmat  28.5" × 16.5"
    };

    // Product IDs that should ALWAYS show the designer regardless of variant selection.
    // Add all dedicated playmat/deskmat/mousepad product IDs here.
    const ALWAYS_SHOW_PRODUCT_IDS = window.PLAYMAT_ALWAYS_SHOW_IDS || [
        8712290107651,  // Extended Playmat
        9055451971843,  // Victor Deskmat
        9049146884355,  // Secundus Deskmat
        9049147867395,  // Primus Deskmat
        9049030951171,  // Tiro Mousepad
        9049140494595,  // Veteranus Mousepad
        9049145737475,  // Gladiator Mousepad
        8632969527555,  // Standard Playmat 24" x 14"
        9278146085123,  // TCG Essentials Bundle
        9333936718083,  // Custom 28" x 16" Playmat
    ];

    // Read the currently selected variant ID from Shopify's native variant selector.
    // Falls back gracefully if the selector isn't found (e.g. during local testing).
    function getPageVariant() {
        // Standard Shopify pages: hidden [name="id"] input
        const standard = document.querySelector('[name="id"]');
        if (standard?.value) return standard.value;

        // Bundle app pages (Simple Bundles / variant-picker__form):
        // The playmat stitching fieldset is the first fieldset.
        // Each radio has data-variant-id on it — read the checked one.
        const bundleChecked = document.querySelector(
            '.variant-picker__form fieldset:first-of-type input[type="radio"]:checked'
        );
        if (bundleChecked?.dataset?.variantId) return bundleChecked.dataset.variantId;

        // Fallback: any checked radio with a data-variant-id
        const anyChecked = document.querySelector(
            'input[type="radio"][data-variant-id]:checked'
        );
        if (anyChecked?.dataset?.variantId) return anyChecked.dataset.variantId;

        // Last resort: single-variant products have no selector at all.
        // _variantTitleMap is populated at init from the product JSON — if there
        // is exactly one variant, use it automatically.
        const knownVariants = Object.keys(window._variantTitleMap || {});
        if (knownVariants.length === 1) return knownVariants[0];

        return null;
    }

    // Read the quantity from the page's quantity input.
    // Bundle pages typically don't expose a qty input — default to 1.
    function getPageQty() {
        const qty = document.querySelector('[name="quantity"]');
        return qty ? parseInt(qty.value || '1', 10) : 1;
    }

    const LAYOUT_RAW = (window.PLAYMAT_LAYOUT_RAW && window.PLAYMAT_LAYOUT_RAW.length ? window.PLAYMAT_LAYOUT_RAW : [
        { game: "Magic: the Gathering", format: "60-card", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/60-Card%20New%20Player%20Standard%20Left%20Handed.webp" },
        { game: "Magic: the Gathering", format: "60-card", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/60-Card%20New%20Player%20Standard%20Right%20Handed.webp" },
        { game: "Magic: the Gathering", format: "60-card", size: "Extended", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/60-Card%20New%20Player%20Extended%20Left%20Handed.webp" },
        { game: "Magic: the Gathering", format: "60-card", size: "Extended", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/60-Card%20New%20Player%20Extended%20Right%20Handed.webp" },
        { game: "Magic: the Gathering", format: "Commander", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/Commander%20New%20Player%20Standard%20Left%20Handed.webp" },
        { game: "Magic: the Gathering", format: "Commander", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/Commander%20New%20Player%20Standard%20Right%20Handed.webp" },
        { game: "Magic: the Gathering", format: "Commander", size: "Extended", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/Commander%20New%20Player%20Extended%20Left%20Handed.webp" },
        { game: "Magic: the Gathering", format: "Commander", size: "Extended", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/MTG%20Overlays/Commander%20New%20Player%20Extended%20Right%20Handed.webp" },
        { game: "Pokemon", format: "", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Pokemon%20Overlays/Pokemon%20Left%20Handed%20Standard.webp" },
        { game: "Pokemon", format: "", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Pokemon%20Overlays/Pokemon%20Right%20Handed%20Standard.webp" },
        { game: "Pokemon", format: "", size: "Extended", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Pokemon%20Overlays/Pokemon%20Left%20Handed%20Extended.webp" },
        { game: "Pokemon", format: "", size: "Extended", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Pokemon%20Overlays/Pokemon%20Right%20Handed%20Extended.webp" },
        { game: "Riftbound", format: "Bounded", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Standard%20Left.webp" },
        { game: "Riftbound", format: "Bounded", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Standard%20Right.webp" },
        { game: "Riftbound", format: "Unbounded", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Riftbound_Template_Unbounded_Left.webp" },
        { game: "Riftbound", format: "Unbounded", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Riftbound_Template_Unbounded_Right.webp" },
        { game: "Riftbound", format: "Rubicon Mod", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Rubicon%20Template%20Left%20No%20Points%20With%20Labels.webp" },
        { game: "Riftbound", format: "Rubicon Mod", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Rubicon%20Template%20Right%20No%20Points%20With%20Labels.webp" },
        { game: "Riftbound", format: "Regional Solo Mod", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regionals%20Solo%20Mod%20Left.webp" },
        { game: "Riftbound", format: "Regional Solo Mod", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regionals%20Solo%20Mod%20Right.webp" },
        { game: "Riftbound", format: "Gen Con Solo", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/GenCon%20Solo%20Left.webp" },
        { game: "Riftbound", format: "Gen Con Solo", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/GenCon%20Solo.webp" },
        { game: "Riftbound", format: "Houston Regional", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regional%20Qualifier%20Left.webp" },
        { game: "Riftbound", format: "Houston Regional", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regional%20Qualifier%20Right.webp" },
        { game: "Riftbound", format: "Houston Regional w/ Points", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regional%20Qualifier%20Points%20Left.webp" },
        { game: "Riftbound", format: "Houston Regional w/ Points", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Regional%20Qualifier%20Points%20Right.webp" },
        { game: "Riftbound", format: "Points Only", size: "Standard", hand: "Left", url: "" },
        { game: "Riftbound", format: "Points Only", size: "Standard", hand: "Right", url: "" },
        { game: "One Piece", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/One%20Piece.webp" },
        { game: "Neuroscape", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Neuroscape%20Standard.webp" },
        { game: "Neuroscape", format: "", size: "Extended", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Neuroscape%20Extended.webp" },
        { game: "Star Wars: Unlimited", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Star%20Wars%20Unlimited.webp" },
        { game: "Grand Archive", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Grand%20Archive.webp" },
        { game: "Gundam", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Gundam.webp" },
        { game: "Union Arena", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Union%20Arena.webp" },
        { game: "Yu-Gi-Oh", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Yu-Gi-Oh.webp" },
        { game: "Final Fantasy", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Final%20Fantasy.webp" },
        { game: "Sorcery: Contested Realm", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Sorcery%20Contested%20Realm.webp" },
        { game: "Lorcana", format: "", size: "Standard", hand: "Left", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Lorcana%20Left%20Handed.webp" },
        { game: "Lorcana", format: "", size: "Standard", hand: "Right", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Lorcana%20Right%20Handed.webp" },
        { game: "SolForge Fusion", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/SolForge%20Fusion.webp" },
        { game: "Digimon", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Digimon.webp" },
        { game: "Altered", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Altered.webp" },
        { game: "Warlord", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Warlord.webp" },
        { game: "Universus", format: "", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Universus.webp" },
        { game: "Flesh and Blood", format: "Single Arsenal", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Flesh%20and%20Blood%20Single%20Arsenal.webp" },
        { game: "Flesh and Blood", format: "Double Arsenal", size: "Standard", hand: "", url: "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Main%20Overlays/Flesh%20and%20Blood%20Double%20Arsenal.webp" }
    ]);

    window.RB_POINTS_DB = {
        "none": "",
        "basic": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Basic%20Points.webp",
        "basic_1_14": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Basic%20Points%201-14.webp",
        "project": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Project%20Points.webp",
        "project_1_14": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Project%20Points%201-14.webp",
        "lunar": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Lunar%20Points.webp",
        "lunar_1_14": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Lunar%20Points%201-14.webp",
        "khasino": "https://pub-6fa65da7f5a44c9a9f6fbefabd3634dd.r2.dev/Riftbound%20Overlays/Points%20Overlays/Khasino%20Points.webp"
    };

    // --- GENERIC IN-APP ALERT ---
    window.showAppAlert = function(title, message, type='info') {
        const modal = document.getElementById('app-alert-modal');
        const titleEl = document.getElementById('app-alert-title');
        const textEl  = document.getElementById('app-alert-text');
        const boxEl   = document.getElementById('app-alert-box');
        const btnEl   = document.getElementById('app-alert-btn');
        titleEl.innerText  = title;
        textEl.innerHTML   = message;
        if(type === 'error')        { titleEl.style.color = 'var(--danger-red)';   boxEl.style.borderColor = 'var(--danger-red)';   btnEl.style.background = 'var(--danger-red)'; }
        else if(type === 'success') { titleEl.style.color = 'var(--success-green)';boxEl.style.borderColor = 'var(--success-green)';btnEl.style.background = 'var(--success-green)';}
        else                        { titleEl.style.color = 'var(--brand-hover)';  boxEl.style.borderColor = 'var(--brand-hover)';  btnEl.style.background = 'var(--brand-hover)'; }
        modal.style.display = 'flex';
    };

    // --- CURSOR TRACKING ---
    const trackCursor = (e) => {
        const cursor = document.getElementById('brush-cursor');
        if (!cursor) return;
        if (APP.isMaskMode || APP.isRecolorMode) {
            cursor.style.left    = e.clientX + 'px';
            cursor.style.top     = e.clientY + 'px';
            cursor.style.display = 'block';
            window.updateCursorStyle();
        } else {
            cursor.style.display = 'none';
        }
    };
    document.addEventListener('mousemove', trackCursor);

    // ============================================================
    // IMAGE UPLOAD — Cloudflare R2 via Worker
    // Worker code: playmat-r2-upload-worker.js
    // Deploy instructions are inside that file.
    // Update CLOUDFLARE_UPLOAD_URL below once deployed.
    // ============================================================
    // Build a structured print file filename:
    // Format: MM-DD-YYYY/<timestamp>-<variantCode>.jpg
    // Variant codes: CLR = Clear Stitched, BLK = Black Stitched, UNS = Unstitched
    window.buildPrintFilename = function(varId) {
        const now    = new Date();
        const mm     = String(now.getMonth() + 1).padStart(2, '0');
        const dd     = String(now.getDate()).padStart(2, '0');
        const yyyy   = now.getFullYear();
        const folder = `${mm}-${dd}-${yyyy}`;
        const ts     = now.getTime();

        // Try cached title map first (standard product pages)
        const variantInfo = (window._variantTitleMap || {})[String(varId)] || {};
        let title = (variantInfo.title || '').toLowerCase();

        // Fallback: read label text from the checked bundle radio directly
        if (!title) {
            const checkedRadio = document.querySelector(
                '.variant-picker__form fieldset:first-of-type input[type="radio"]:checked'
            );
            title = (checkedRadio?.getAttribute('aria-label') || checkedRadio?.value || '').toLowerCase();
        }

        let code = 'UNK';
        if      (title.includes('clear'))      code = 'CLR';
        else if (title.includes('black'))      code = 'BLK';
        else if (title.includes('unstitched')) code = 'UNS';

        return `${folder}/${ts}-${code}.jpg`;
    };

    async function uploadImageToStaging(blob, filename) {
        const formData = new FormData();
        formData.append('image', blob, filename);
        const res = await fetch(window.CLOUDFLARE_UPLOAD_URL, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Failed to upload print file. Please try again.');
        const data = await res.json();
        if (!data?.data?.url) throw new Error('Upload succeeded but no URL returned.');
        return data.data.url;
    }

    // ============================================================
    // BLEED COVERAGE WARNINGS
    // ============================================================

    window.checkArtCoverage = function(ac) {
        var art = ac.getObjects().find(function(o){ return o.name==='art'; });
        if (!art) return true;
        var T=1, br=art.getBoundingRect(true,true);
        return (br.left<=T && br.top<=T &&
                br.left+br.width>=APP.canvasW-T &&
                br.top+br.height>=APP.canvasH-T);
    };

    window.updateBleedWarnings = function(ac) {
        var ok=window.checkArtCoverage(ac), adv=(ac===window.canvas);
        var b=document.getElementById(adv?'adv-bleed-warning':'simple-bleed-warning');
        if(b) b.classList.toggle('visible',!ok);
        var inf=document.getElementById(adv?'adv-info-bar':'simple-info-bar');
        if(inf) inf.classList.toggle('coverage-warn',!ok);
    };

    window._closeBleedConfirm = function() {
        document.getElementById('bleed-confirm-modal').style.display='none';
        APP._bleedConfirmCallback=null;
    };

    window._proceedDespiteBleed = function() {
        document.getElementById('bleed-confirm-modal').style.display='none';
        if(typeof APP._bleedConfirmCallback==='function'){
            APP._bleedConfirmCallback();
            APP._bleedConfirmCallback=null;
        }
    };

    // ============================================================
    // Shared Riftbound layout drawing helper.
    // Used by both the canvas preview and the print export.
    // ============================================================
    function drawRiftboundLayout(ctx, img, canvasW, canvasH, hand, format, rbPointsVal) {
        // Riftbound overlays are designed at standard playmat resolution (7350×4350).
        // Scale factor maps overlay native px → current canvas px.
        const nativeW  = Math.round(24.5 * 300); // 7350 — standard playmat native width
        const bleedPx  = Math.round(0.25 * 300); // 75px bleed at 300 DPI
        const safePx   = Math.round(0.75 * 300); // 225px safe area at 300 DPI
        const s        = canvasW / nativeW;
        const isRight  = (hand === 'Right');

        // Safe area bounds — derived from bleed/safe constants, not hardcoded
        const safeX = safePx * s, safeY = safePx * s;
        const safeW = 6900 * s, safeH = 3900 * s;

        // --- Points strip dimensions ---
        const hasPoints = (rbPointsVal && rbPointsVal !== 'none');
        let pX = 0, pY = 0, pW = 0, pH = 0;
        if (hasPoints) {
            const isWide = rbPointsVal.includes('1_14');
            const basePw = isWide ? 549 : 399;
            pW = basePw * s;
            pH = 3888 * s;
            pY = safeY + (safeH - pH) / 2;                       // vertically centred in safe area
            pX = isRight ? safeX : (safeX + safeW - pW);         // right-hand = left edge; left-hand = right edge
        }

        // --- Available zone for the main overlay ---
        // With points: a 150 native-unit gap (0.5" at 300dpi) sits between the
        // points strip and the overlay zone on all formats.
        // Without points: overlay fills the entire safe area.
        const gap   = hasPoints ? 150 * s : 0;
        const zoneX = hasPoints ? (isRight ? safeX + pW + gap : safeX) : safeX;
        const zoneW = hasPoints ? (safeW - pW - gap) : safeW;
        const zoneH = safeH;

        const imgRatio = img.width / img.height;
        let drawX, drawY, drawW, drawH;
        if (format === 'Unbounded') {
            // Unbounded: full zone width, preserve ratio, bottom-aligned.
            drawW = zoneW;
            drawH = zoneW / imgRatio;
            drawX = zoneX;
            drawY = safeY + safeH - drawH;
        } else if (!hasPoints) {
            // No points: images are designed for the full safe area — stretch
            // to fill zone exactly, no scaling math needed.
            drawW = zoneW;
            drawH = zoneH;
            drawX = zoneX;
            drawY = safeY;
        } else {
            // Points present: zone is narrower. Preserve aspect ratio (contain),
            // centred both axes — prevents horizontal squishing.
            if (imgRatio > zoneW / zoneH) { drawW = zoneW; drawH = zoneW / imgRatio; }
            else                           { drawH = zoneH; drawW = zoneH * imgRatio; }
            drawX = zoneX + (zoneW - drawW) / 2;
            drawY = safeY  + (zoneH - drawH) / 2;
        }
        // Points Only format: no overlay image, just the points strip
        if (format !== 'Points Only' && img && img.width) {
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }

        if (hasPoints && window.rbPointsImg && window.rbPointsImg.src) {
            ctx.drawImage(window.rbPointsImg, pX, pY, pW, pH);
        }
    }

    // ============================================================
    // FIX 5 (CODE QUALITY): Shared gradient fill helper.
    // Previously duplicated between renderLayout and submitToCart.
    // ============================================================
    function applyGradientOrSolidFill(ctx, w, h, mode, c1) {
        if (mode === 'gradient') {
            const c2  = document.getElementById('zone-col2')?.value || '#000000';
            const deg = parseInt(document.getElementById('gradient-angle')?.value, 10) || 0;
            const angleRad = (deg - 90) * (Math.PI / 180);
            const cx = w / 2, cy = h / 2;
            // FIX 6: Correct radius formula — was (cx*cx + cy*cy) in submitToCart, now unified
            const r  = Math.sqrt(cx * cx + cy * cy);
            const x0 = cx - Math.cos(angleRad) * r, y0 = cy - Math.sin(angleRad) * r;
            const x1 = cx + Math.cos(angleRad) * r, y1 = cy + Math.sin(angleRad) * r;
            const grad = ctx.createLinearGradient(x0, y0, x1, y1);
            grad.addColorStop(0, c1); grad.addColorStop(1, c2);
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = String(c1);
        }
        ctx.fillRect(0, 0, w, h);
    }

    // --- FILTERS ---
    window.autoOptimizePrintAdv = function() {
        const btn = document.getElementById('auto-opt-btn-adv');
        if (btn.dataset.active === 'true') { window.resetFilters(); return; }
        document.getElementById('filter-brightness').value = 0.12;
        document.getElementById('filter-contrast').value   = 0.08;
        document.getElementById('filter-saturation').value = 0.15;
        window.updateFilters();
        btn.dataset.active   = 'true';
        btn.style.background = 'var(--brand-hover)';
        btn.style.color      = 'var(--brand-bg)';
    };

    window.toggleSimpleFilter = function(type) {
        APP.s_filters[type] = !APP.s_filters[type];
        const btn = document.getElementById('s-btn-' + type);
        if (APP.s_filters[type]) { btn.style.background = 'var(--brand-hover)'; btn.style.color = 'var(--brand-bg)'; }
        else                     { btn.style.background = 'transparent'; btn.style.color = 'var(--brand-text-pri)'; }
        window.applySimpleFiltersCore();
    };

    window.applySimpleFiltersCore = function() {
        if (!window.sCanvas) return;
        const art = window.sCanvas.getObjects().find(o => o.name === 'art');
        if (!art) return;
        let filterStr = '';
        if (APP.s_filters.enhance)   filterStr += 'brightness(112%) contrast(108%) saturate(115%) ';
        if (APP.s_filters.grayscale) filterStr += 'grayscale(100%) ';
        art.customFilterStr = filterStr.trim();
        art._render = function(ctx) {
            if (this.customFilterStr) { ctx.save(); ctx.filter = this.customFilterStr; fabric.Image.prototype._render.call(this, ctx); ctx.restore(); }
            else fabric.Image.prototype._render.call(this, ctx);
        };
        window.sCanvas.requestRenderAll();
    };

    window.rotateSimpleArt = function() {
        if (!window.sCanvas) return;
        const art = window.sCanvas.getObjects().find(o => o.name === 'art');
        if (!art) return;
        art.set('angle', ((art.angle || 0) + 90) % 360);
        window.sCanvas.requestRenderAll();
        window.updateBleedWarnings(window.sCanvas);
    };

    window.resetFilters = function() {
        ['filter-brightness','filter-contrast','filter-saturation'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = 0;
        });
        const btnAdv = document.getElementById('auto-opt-btn-adv');
        if (btnAdv) { btnAdv.dataset.active = 'false'; btnAdv.style.background = 'transparent'; btnAdv.style.color = 'var(--brand-hover)'; }
        APP.s_filters = { enhance: false, grayscale: false };
        ['enhance','grayscale'].forEach(type => {
            const btn = document.getElementById('s-btn-' + type);
            if (btn) { btn.style.background = 'transparent'; btn.style.color = 'var(--brand-text-pri)'; }
        });
        window.updateFilters();
        if (window.sCanvas) window.applySimpleFiltersCore();
    };

    window.updateFilters = function() {
        if (!window.canvas) return;
        const b = parseFloat(document.getElementById('filter-brightness')?.value || 0);
        const c = parseFloat(document.getElementById('filter-contrast')?.value   || 0);
        const s = parseFloat(document.getElementById('filter-saturation')?.value || 0);
        const art = window.canvas.getObjects().find(o => o.name === 'art');
        if (art) {
            let f = '';
            if (b !== 0) f += `brightness(${100 + b * 100}%) `;
            if (c !== 0) f += `contrast(${100 + c * 100}%) `;
            if (s !== 0) f += `saturate(${100 + s * 100}%) `;
            art.customFilterStr = f.trim();
            art._render = function(ctx) {
                if (this.customFilterStr) { ctx.save(); ctx.filter = this.customFilterStr; fabric.Image.prototype._render.call(this, ctx); ctx.restore(); }
                else fabric.Image.prototype._render.call(this, ctx);
            };
            window.canvas.requestRenderAll();
            window.renderForeground();
        }
    };

    // --- GAME DROPDOWNS ---
    window.populateGameDropdowns = function() {
        // Map activeSizeKey to LAYOUT_RAW size string
        const sizeKeyToName = { standard: 'Standard', extended: 'Extended' };
        const sizeName  = sizeKeyToName[APP.activeSizeKey] || null;
        const allGames  = [...new Set(LAYOUT_RAW.map(i => i.game))].sort();
        const sizeGames = sizeName
            ? new Set(LAYOUT_RAW.filter(i => i.size === sizeName).map(i => i.game))
            : new Set(); // no overlays for this size yet — all grayed out
        const unavailLabel = sizeName ? ' — Standard only' : ' — Playmat only';
        ['s-game-sel', 'game-sel'].forEach(id => {
            const el = document.getElementById(id); if (!el) return;
            const prev = el.value;
            el.innerHTML = '<option value="">-- Select Game (Optional) --</option>';
            allGames.forEach(g => {
                const available = sizeGames.has(g);
                const opt = document.createElement('option');
                opt.value       = available ? g : '';
                opt.textContent = available ? g : g + unavailLabel;
                opt.disabled    = !available;
                opt.style.color = available ? '' : '#888888';
                el.appendChild(opt);
            });
            if (prev && sizeGames.has(prev)) el.value = prev;
        });
    };

    // --- ACCORDION ---
    window.toggleAcc = (id, forceOpen = false) => {
        const target = document.getElementById(id);
        if (forceOpen) { document.querySelectorAll('.acc-content').forEach(c => c.style.display = 'none'); target.style.display = 'block'; return; }
        const isOpen = target.style.display === 'block';
        document.querySelectorAll('.acc-content').forEach(c => c.style.display = 'none');
        if (!isOpen) target.style.display = 'block';
    };

    window.updateLandingVars = () => {
        // Size comes from the Liquid schema setting injected below — nothing to update at runtime.
        window.populateGameDropdowns();
    };

    window.triggerAdvancedFlow = () => {
        // Variant and quantity are read from the page at cart time — nothing to validate here.
        document.getElementById('landing-ui').style.display    = 'none';
        const advBd = document.getElementById('adv-backdrop');
        const isMobile = window.innerWidth <= 900;
        advBd.style.setProperty('--adv-nav-offset', isMobile ? '0px' : window.getNavHeight() + 'px');
        advBd.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        window.initCanvas();
        window.toggleAcc('acc-size', true);
    };

    window.triggerSimpleFlow = () => {
        document.getElementById('simple-file-in').click();
    };

    // Called when the file input resolves — show the simple backdrop with nav offset
    const _origShowSimple = window.showSimpleBackdrop;
    window._applyNavOffsetToSimple = () => {
        const bd = document.getElementById('simple-backdrop');
        bd.style.setProperty('--adv-nav-offset', window.getNavHeight() + 'px');
    };

    // Measure the tallest fixed/sticky element above the fold (the nav bar).
    // Returns at least 80px as a safe minimum in case the nav isn't detected.
    window.getNavHeight = () => {
        let maxBottom = 0;
        document.querySelectorAll('header, [class*="header"], [class*="nav"], [id*="header"], [id*="nav"]').forEach(el => {
            const style = window.getComputedStyle(el);
            if ((style.position === 'fixed' || style.position === 'sticky') && el.getBoundingClientRect) {
                const rect = el.getBoundingClientRect();
                if (rect.bottom > 0 && rect.bottom < window.innerHeight * 0.4) {
                    maxBottom = Math.max(maxBottom, rect.bottom);
                }
            }
        });
        return Math.max(maxBottom, 180); // measured Horizon nav = 172.4px, rounded up
    };

    window.restartApp = () => {
        document.getElementById('adv-backdrop').style.display       = 'none';
        document.getElementById('simple-backdrop').style.display      = 'none';
        document.body.style.overflow = '';
        document.getElementById('landing-ui').style.display          = 'block';
        if (APP.isMaskMode)    window.toggleMaskMode();
        if (APP.isRecolorMode) window.toggleRecolorMode();
        if (window.canvas)  { window.canvas.clear();  window.canvas.dispose();  window.canvas  = null; }
        if (window.rCanvas) { window.rCanvas.clear(); window.rCanvas.dispose(); window.rCanvas = null; }
        if (window.sCanvas) { window.sCanvas.clear(); window.sCanvas.dispose(); window.sCanvas = null; }
        const cursor = document.getElementById('brush-cursor');
        if (cursor) cursor.style.display = 'none';
        APP.activeLayoutUrl   = null;
        APP.s_activeLayoutUrl = null;
        APP.cachedLayoutUrl   = null;
        APP.cachedLayoutImg   = null;
        APP.s_cachedLayoutImg = null;
        APP.canvasW           = 0;
        APP.canvasH           = 0;
        APP.erasedPaths       = [];
        APP.aiFgImg           = null;
        APP._bleedConfirmCallback = null;
        ["adv-bleed-warning","simple-bleed-warning"].forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove("visible"); });
        ["adv-info-bar","simple-info-bar"].forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove("coverage-warn"); });
        window.resetFilters();
        document.getElementById('adv-file-in').value    = '';
        document.getElementById('simple-file-in').value = '';
    };

    window.openHelpModal = () => { document.getElementById('dpi-warning-modal').style.display = 'none'; document.getElementById('help-modal').style.display = 'flex'; };
    // Use DOMContentLoaded if the DOM isn't ready yet, otherwise run immediately.
    // Snippets loaded via Custom Liquid blocks often miss DOMContentLoaded.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.updateLandingVars();
            window.initDesignerVisibility();
        });
    } else {
        window.updateLandingVars();
        window.initDesignerVisibility();
    }

    // ============================================================
    // VARIANT-TRIGGERED VISIBILITY
    // Reads the Liquid schema setting 'trigger_variant'.
    // - If blank: designer is always visible.
    // - If set (e.g. "Custom Artwork"): designer only shows when
    //   the selected variant's Option1 matches that text
    //   (case-insensitive). Listens to the change event on the
    //   hidden [ref="variantId"] input that Shopify updates on
    //   every variant switch.
    // ============================================================
    window.initDesignerVisibility = async function() {
        const wrapper      = document.getElementById('designer-visibility-wrapper');
        const variantInput = document.querySelector('[ref="variantId"], [name="id"]');

        // ── GLOBAL TRIGGER TEXT ─────────────────────────────────────────────
        // The designer shows whenever a variant whose Option1 contains this
        // text is selected. Works automatically on any product page the
        // snippet is embedded on — no per-product configuration needed.
        const GLOBAL_TRIGGER = 'custom artwork';

        // Detect current product ID from Shopify globals
        const productId = (window.ShopifyAnalytics?.meta?.product?.id)
                       || (window.meta?.product?.id)
                       || null;

        // Set canvas size from PRODUCT_SIZE_MAP — defaults to 'standard' if not listed
        const mappedSize = PRODUCT_SIZE_MAP[productId];
        if (mappedSize && mappedSize !== 'standard') {
            APP.activeSizeKey = mappedSize;
            window.populateGameDropdowns(); // re-filter overlays to match this size
        }
        window.updateInfoBars(null); // update info bars now that size is confirmed

        // Always fetch product variants so we can resolve variant titles at upload time
        // (used to generate the print file filename).
        let variantMap = {};
        let hasCustomArtworkVariant = false;
        try {
            const path = window.location.pathname.replace(/\/$/, '');
            const res  = await fetch(path + '.js');
            const prod = await res.json();
            prod.variants.forEach(v => {
                variantMap[String(v.id)] = {
                    option1: (v.option1 || '').toLowerCase().trim(),
                    option2: (v.option2 || '').toLowerCase().trim(),
                    option3: (v.option3 || '').toLowerCase().trim(),
                    title:   (v.title   || '').trim()
                };
                // Check all options for Custom Artwork trigger text
                const allOptions = [v.option1, v.option2, v.option3]
                    .map(o => (o || '').toLowerCase());
                if (allOptions.some(o => o.includes(GLOBAL_TRIGGER))) {
                    hasCustomArtworkVariant = true;
                }
            });
            // Cache for use in uploadImageToStaging
            window._variantTitleMap = variantMap;
        } catch(e) {
            console.warn('Playmat designer: could not load product variants.', e);
        }

        // If the product has no Custom Artwork variant, show only if it's a
        // dedicated product page (listed in ALWAYS_SHOW_PRODUCT_IDS), otherwise hide.
        if (!hasCustomArtworkVariant) {
            const alwaysShow = ALWAYS_SHOW_PRODUCT_IDS.map(String).includes(String(productId));
            wrapper.style.display = alwaysShow ? '' : 'none';
            return;
        }

        const updateAll = () => {
            const selectedId = variantInput?.value;
            const info       = variantMap[selectedId] || {};

            // Check all options for the trigger text
            const allOptions = [info.option1, info.option2, info.option3]
                .map(o => o || '');
            const shouldShow = allOptions.some(o => o.includes(GLOBAL_TRIGGER));
            wrapper.style.display = shouldShow ? '' : 'none';
        };

        updateAll();

        if (variantInput) {
            const mo = new MutationObserver(updateAll);
            mo.observe(variantInput, { attributes: true });
            variantInput.addEventListener('change', updateAll);
            document.addEventListener('change', e => {
                if (e.target === variantInput) updateAll();
            });
        }
    };

    // --- DPI CHECKER ---
    // Update the info bars in both editors with current mat size and image DPI
    window.updateInfoBars = function(img) {
        const conf     = SIZE_DB[APP.activeSizeKey];
        const sizeText = `Mat size: ${conf.label || conf.w + '\" × ' + conf.h + '\"'}`;
        const dpiText  = img
            ? `Image DPI: ${Math.round(Math.min(img.width / conf.w, img.height / conf.h))}`
            : 'Image DPI: —';

        // Quick Upload bar
        const si = document.getElementById('si-size');
        const sd = document.getElementById('si-dpi');
        if (si) si.textContent = sizeText;
        if (sd) sd.textContent = dpiText;

        // Advanced Editor bar
        const ai = document.getElementById('ai-size');
        const ad = document.getElementById('ai-dpi');
        if (ai) ai.textContent = sizeText;
        if (ad) ad.textContent = dpiText;
    };

    window.checkDPI = function(img) {
        const conf = SIZE_DB[APP.activeSizeKey];
        const effectiveDpi = Math.round(Math.min(img.width / conf.w, img.height / conf.h));
        window.updateInfoBars(img); // update bars whenever we have an image
        if (effectiveDpi < 300) {
            document.getElementById('dpi-warning-text').innerText =
                `Your artwork is roughly ${effectiveDpi} DPI based on the selected mat size.\n\nWe recommend 300 DPI for the best print quality. Your playmat may print slightly blurry or pixelated.`;
            document.getElementById('dpi-warning-modal').style.display = 'flex';
        }
    };

    // ============================================================
    // FIX 7: URL import now validates that the URL looks like a
    // real image before attempting to load it.
    // ============================================================
    window.promptPasteUrl = () => {
        document.getElementById('paste-url-input').value = '';
        document.getElementById('url-paste-modal').style.display = 'flex';
    };

    window.submitUrlPaste = () => {
        const url = document.getElementById('paste-url-input').value.trim();
        if (!url) return;

        // Validate: must be http/https and end with a recognised image extension
        if (!url.startsWith('http') || !/\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(url)) {
            window.showAppAlert("Invalid URL", "Please paste a direct link to an image file (ending in .jpg, .png, .webp, etc.).", "error");
            return;
        }
        window.loadRemoteArt(url);
    };

    window.openUrlToCartModal = () => {
        const varId = getPageVariant();
        if (!varId) {
            window.showAppAlert("Missing Selection", "Please select your edge style on the product page before continuing.", "error");
            return;
        }
        document.getElementById('url-to-cart-input').value = '';
        document.getElementById('url-to-cart-status').textContent = '';
        const btn = document.getElementById('url-to-cart-btn');
        btn.innerText = 'ADD TO CART'; btn.disabled = false; btn.style.background = 'var(--brand-hover)';
        document.getElementById('url-to-cart-modal').style.display = 'flex';
    };

    window.submitUrlToCart = async () => {
        const url = document.getElementById('url-to-cart-input').value.trim();
        const status = document.getElementById('url-to-cart-status');
        const btn = document.getElementById('url-to-cart-btn');

        if (!url) return;
        if (!url.startsWith('http') || !/\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(url)) {
            window.showAppAlert("Invalid URL", "Please paste a direct link to an image file (ending in .jpg, .png, .webp, etc.).", "error");
            return;
        }

        const varId = getPageVariant();
        const qty   = getPageQty();
        if (!varId) {
            window.showAppAlert("Missing Selection", "Please select your edge style on the product page before adding to cart.", "error");
            return;
        }

        btn.innerText = 'LOADING IMAGE...'; btn.disabled = true;
        status.textContent = 'Fetching image...';

        // Try proxies in sequence to handle CORS
        const proxies = [
            `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg`,
            `https://corsproxy.io/?${encodeURIComponent(url)}`
        ];

        let img = null;
        for (const proxy of proxies) {
            img = await new Promise(resolve => {
                fabric.Image.fromURL(proxy, (i, err) => {
                    resolve((!err && i && i.width > 0) ? i : null);
                });
            });
            if (img) break;
        }

        if (!img) {
            window.showAppAlert("Import Failed", "Could not load that image. Try downloading it and uploading the file directly.", "error");
            btn.innerText = 'ADD TO CART'; btn.disabled = false;
            status.textContent = '';
            return;
        }

        // Build a temporary offscreen simple canvas sized to the product
        status.textContent = 'Preparing print file...';
        btn.innerText = 'PROCESSING...';

        try {
            // Spin up a temporary sCanvas-equivalent for export
            const tmpEl = document.createElement('canvas');
            tmpEl.width  = APP.canvasW || 800;
            tmpEl.height = APP.canvasH || Math.round((APP.canvasW || 800) * (14.5 / 24.5));
            const tmpFabric = new fabric.Canvas(tmpEl, { backgroundColor: '#000', preserveObjectStacking: true });

            const cW = tmpFabric.width, cH = tmpFabric.height;
            const srcW = img.naturalWidth  || img.width;
            const srcH = img.naturalHeight || img.height;
            const fitScale = Math.max(cW / srcW, cH / srcH);
            img.set({ name: 'art', originX: 'center', originY: 'center',
                      left: cW / 2, top: cH / 2, scaleX: fitScale, scaleY: fitScale });
            tmpFabric.add(img);
            tmpFabric.renderAll();

            // Reuse buildPrintCanvas with this temporary canvas (simple mode = false flag irrelevant; pass canvas directly)
            const blob = await buildPrintCanvas(false, tmpFabric);
            tmpFabric.dispose();

            status.textContent = 'Uploading...';
            btn.innerText = 'UPLOADING...';

            const printFilename = window.buildPrintFilename(varId);
            const fileUrl = await uploadImageToStaging(blob, printFilename);

            status.textContent = 'Adding to cart...';
            btn.innerText = 'ADDING TO CART...';

            await pushToShopifyCart(fileUrl, varId, qty, false);

            btn.innerText = 'ADDED! ✓'; btn.style.background = 'var(--success-green)';
            status.textContent = 'Redirecting...';
            setTimeout(() => { window.location.href = '/cart'; }, 1000);
        } catch(err) {
            console.error(err);
            window.showAppAlert("Cart Error", err.message, "error");
            btn.innerText = 'ADD TO CART'; btn.disabled = false; btn.style.background = 'var(--brand-hover)';
            status.textContent = '';
        }
    };

    window.loadRemoteArt = (url) => {
        document.getElementById('url-paste-modal').style.display = 'none';
        const isAdv = document.getElementById('adv-backdrop').style.display === 'flex';

        // FIX 8: Always initialise the simple canvas before trying to use it
        if (!isAdv) {
            document.getElementById('landing-ui').style.display      = 'none';
            window._applyNavOffsetToSimple(); document.getElementById('simple-backdrop').style.display = 'flex';
            window.initSimpleCanvas();
        }

        const proxies = [
            `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=webp`,
            `https://corsproxy.io/?${encodeURIComponent(url)}`
        ];

        const tryLoad = (index) => {
            if (index >= proxies.length) {
                // FIX 9: Was referencing a non-existent 'url-error-modal' element
                window.showAppAlert("Import Failed", "Could not load that image. Try downloading it and uploading the file directly.", "error");
                return;
            }
            fabric.Image.fromURL(proxies[index], (img, isError) => {
                if (isError || !img || img.width === 0 || img.height === 0) { tryLoad(index + 1); return; }
                window.resetFilters();
                window.checkDPI(img);
                img.set({ name: 'art', originX: 'center', originY: 'center' });
                const targetCanvas = isAdv ? window.canvas : window.sCanvas;
                targetCanvas.getObjects().forEach(o => { if (o.name === 'art') targetCanvas.remove(o); });
                targetCanvas.add(img).sendToBack(img);
                if (isAdv) {
                    window.clearAutoFrameBreak(); window.forceFit(); window.toggleAcc('acc-size', true);
                } else {
                    APP.s_baseArtScale = Math.max(APP.canvasW / img.width, APP.canvasH / img.height);
                    img.scale(APP.s_baseArtScale).set({ left: APP.canvasW / 2, top: APP.canvasH / 2, angle: 0 });
                    document.getElementById('s-zoom-in').value = 1;
                    window.sCanvas.renderAll();
                }
                window.updateBleedWarnings(targetCanvas);
            }, { crossOrigin: 'anonymous' });
        };
        tryLoad(0);
    };

    // --- AI UPSCALER ---
    window.confirmAutoUpscale = (isAdv) => {
        APP.activeUpscaleEditor = isAdv ? 'adv' : 'simple';
        const targetCanvas = isAdv ? window.canvas : window.sCanvas;
        const art = targetCanvas.getObjects().find(o => o.name === 'art');
        if (!art) { window.showAppAlert("Missing Artwork", "Please upload artwork first.", "error"); return; }
        if ((art.getElement().width * art.getElement().height) >= 2500000) {
            window.showAppAlert("Image Too Large", "This image is already highly detailed! The AI Enhancer is designed for small, blurry images.", "info");
            return;
        }
        document.getElementById('ai-upscale-modal').style.display = 'flex';
    };

    window.runAutoUpscale = async () => {
        document.getElementById('ai-upscale-modal').style.display = 'none';
        const isAdv        = APP.activeUpscaleEditor === 'adv';
        const targetCanvas = isAdv ? window.canvas : window.sCanvas;
        const btn          = document.getElementById(isAdv ? 'ai-upscale-btn-adv' : 'ai-upscale-btn-simple');
        btn.innerHTML = 'ENHANCING (CLOUD)...<br><span style="font-size:10px;font-weight:normal;">(Please wait 5-15s)</span>';
        btn.disabled  = true;

        try {
            const art      = targetCanvas.getObjects().find(o => o.name === 'art');
            if (!art) throw new Error('No artwork found.');
            const imgEl    = art.getElement();
            let targetW    = imgEl.naturalWidth  || imgEl.width;
            let targetH    = imgEl.naturalHeight || imgEl.height;
            const origArea = targetW * targetH;
            const maxPx    = 2000000;
            if (origArea > maxPx) { const r = Math.sqrt(maxPx / origArea); targetW = Math.round(targetW * r); targetH = Math.round(targetH * r); }
            const tempC = document.createElement('canvas');
            tempC.width = targetW; tempC.height = targetH;
            tempC.getContext('2d').drawImage(imgEl, 0, 0, targetW, targetH);
            const blob = await new Promise(res => tempC.toBlob(res, 'image/jpeg', 0.85));

            // FIX 1 in action: upload goes through the worker, no key in frontend
            const tinyImgUrl = await uploadImageToStaging(blob, 'upscale-temp.jpg', 300);

            const startRes = await fetch(window.CLOUDFLARE_WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: tinyImgUrl })
            });
            if (!startRes.ok) throw new Error('Failed to contact secure upscaler bridge.');
            let prediction = await startRes.json();
            if (prediction.detail || prediction.error || !prediction.id) throw new Error('Internal AI Server Error');

            let attempts = 0;
            while (!['succeeded','failed','canceled'].includes(prediction.status)) {
                if (attempts++ > 30) throw new Error('AI Server timed out.');
                await new Promise(r => setTimeout(r, 2000));
                const pollRes = await fetch(`${window.CLOUDFLARE_WORKER_URL}?id=${prediction.id}`);
                if (!pollRes.ok) throw new Error('Failed to poll AI status.');
                prediction = await pollRes.json();
            }
            if (prediction.status !== 'succeeded') throw new Error('AI Cloud processing failed.');

            fabric.Image.fromURL(prediction.output, (newImg) => {
                if ((newImg.width * newImg.height) < (origArea * 0.9)) {
                    btn.innerHTML = '✨ ENHANCE QUALITY <span class="beta-badge">BETA</span>'; btn.disabled = false;
                    window.showAppAlert("Resolution Preserved", "Your original image is already at a higher resolution than the AI output. No changes were made.", "info");
                    return;
                }
                window.checkDPI(newImg);
                if (art.customFilterStr) { newImg.customFilterStr = art.customFilterStr; newImg._render = art._render; }
                newImg.set({ name: 'art', originX: 'center', originY: 'center' });
                targetCanvas.remove(art); targetCanvas.add(newImg).sendToBack(newImg);
                if (isAdv) {
                    APP.baseArtScale = Math.max(APP.canvasW / newImg.width, APP.canvasH / newImg.height);
                    newImg.scale(APP.baseArtScale).set({ left: APP.canvasW/2, top: APP.canvasH/2, angle:0, flipX:false, flipY:false });
                    document.getElementById('zoom-in').value = 1;
                    document.getElementById('transform-rotation').value = 0; document.getElementById('rotation-val').innerText = '0°';
                    targetCanvas.renderAll(); window.updateFilters();
                    if (APP.aiFgImg) window.renderForeground();
                    window.toggleAcc('acc-size', true);
                } else {
                    APP.s_baseArtScale = Math.max(APP.canvasW / newImg.width, APP.canvasH / newImg.height);
                    newImg.scale(APP.s_baseArtScale).set({ left: APP.canvasW/2, top: APP.canvasH/2, angle:0 });
                    document.getElementById('s-zoom-in').value = 1;
                    window.applySimpleFiltersCore();
                }
                window.updateBleedWarnings(targetCanvas);
                btn.innerHTML = '✨ ENHANCE QUALITY <span class="beta-badge">BETA</span>'; btn.disabled = false;
                document.getElementById('ai-success-modal').style.display = 'flex';
            }, { crossOrigin: 'anonymous' });

        } catch (err) {
            console.error('Upscale Error:', err);
            window.showAppAlert("Enhancement Failed", "An unexpected error occurred. Please contact support if this continues.", "error");
            btn.innerHTML = '✨ ENHANCE QUALITY <span class="beta-badge">BETA</span>'; btn.disabled = false;
        }
    };

    // --- SIMPLE CANVAS ---
    window.handleSimpleUpload = (input) => {
        if (!input.files[0]) return;
        document.getElementById('landing-ui').style.display      = 'none';
        window._applyNavOffsetToSimple(); document.getElementById('simple-backdrop').style.display = 'flex';
        window.initSimpleCanvas();
        const r = new FileReader();
        r.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                window.resetFilters(); window.checkDPI(img);
                img.set({ name: 'art', originX: 'center', originY: 'center' });
                window.sCanvas.getObjects().forEach(o => { if (o.name === 'art') window.sCanvas.remove(o); });
                window.sCanvas.add(img).sendToBack(img);
                const el = img.getElement();
                const srcW = (el && el.naturalWidth)  || img.width;
                const srcH = (el && el.naturalHeight) || img.height;
                APP.s_baseArtScale = Math.max(APP.canvasW / srcW, APP.canvasH / srcH);
                img.scale(APP.s_baseArtScale).set({ left: APP.canvasW/2, top: APP.canvasH/2 });
                document.getElementById('s-zoom-in').value = 1;
                window.sCanvas.renderAll();
                window.updateBleedWarnings(window.sCanvas);
            });
        };
        r.readAsDataURL(input.files[0]);
    };

    window.initSimpleCanvas = () => {
        if (!window.sCanvas) {
            window.sCanvas = new fabric.Canvas('s-main-canvas', { backgroundColor: '#000', preserveObjectStacking: true });
            window.sCanvas.on('selection:created', window.handleSimpleSelection);
            window.sCanvas.on('selection:updated', window.handleSimpleSelection);
            window.sCanvas.on('selection:cleared', () => {
                // FIX 10: was referencing non-existent 's-text-tools' element — now safely guarded
                const el = document.getElementById('s-text-tools');
                if (el) el.classList.add('hidden-field');
            });
            window.sCanvas.on('object:modified', function(){ window.updateBleedWarnings(window.sCanvas); });
            window.sCanvas.on('object:added',    function(){ window.updateBleedWarnings(window.sCanvas); });
        }
        const conf = SIZE_DB[APP.activeSizeKey];
        const wrap = document.getElementById('simple-canvas-wrap');
        const maxW = wrap.clientWidth - 40;
        const modalMaxH = window.innerHeight * 0.95;
        const headerH   = document.getElementById('simple-header').getBoundingClientRect().height || 50;
        const toolsH    = document.getElementById('simple-tools').getBoundingClientRect().height  || 250;
        const maxH      = modalMaxH - headerH - toolsH - 40;
        let cW = maxW, cH = cW / (conf.w / conf.h);
        if (cH > maxH && maxH > 100) { cH = maxH; cW = cH * (conf.w / conf.h); }
        APP.canvasW = cW; APP.canvasH = cH;
        window.sCanvas.setDimensions({ width: APP.canvasW, height: APP.canvasH });
        document.getElementById('simple-canvas-inner').style.width  = APP.canvasW + 'px';
        document.getElementById('simple-canvas-inner').style.height = APP.canvasH + 'px';
        window.drawSimpleGuides(APP.canvasW, APP.canvasH, conf.w);
    };

    window.drawSimpleGuides = function(w, h, inches) {
        window.sCanvas.getObjects().forEach(o => { if (o.name === 'guides') window.sCanvas.remove(o); });
        const ppi = w / inches, bleed = 0.25 * ppi, safe = 0.75 * ppi;
        const bleedFrame = new fabric.Path(`M 0 0 H ${w} V ${h} H 0 Z M ${bleed} ${bleed} V ${h-bleed} H ${w-bleed} V ${bleed} Z`, { fill:'rgba(255,0,0,0.25)', selectable:false, evented:false, fillRule:'evenodd' });
        const safeFrame  = new fabric.Path(`M ${bleed} ${bleed} H ${w-bleed} V ${h-bleed} H ${bleed} Z M ${safe} ${safe} V ${h-safe} H ${w-safe} V ${safe} Z`, { fill:'rgba(255,255,0,0.15)', selectable:false, evented:false, fillRule:'evenodd' });
        const g = new fabric.Group([bleedFrame, safeFrame], { name:'guides', selectable:false, evented:false });
        window.sCanvas.add(g); g.bringToFront();
    };

    window.toggleSimpleGuides = () => { const g = window.sCanvas.getObjects().find(o => o.name==='guides'); if(g) { g.visible = !g.visible; window.sCanvas.renderAll(); } };
    window.handleSimpleZoom    = (v)  => { const img = window.sCanvas.getObjects().find(o=>o.name==='art'); if(img && APP.s_baseArtScale) { img.scale(APP.s_baseArtScale * parseFloat(v)); window.sCanvas.renderAll(); } if(window.sCanvas) window.updateBleedWarnings(window.sCanvas); };
    window.forceSimpleFit      = ()   => { const img = window.sCanvas.getObjects().find(o=>o.name==='art'); if(!img) return; const el=img.getElement(); const srcW=(el&&el.naturalWidth)||img.width; const srcH=(el&&el.naturalHeight)||img.height; APP.s_baseArtScale = Math.max(APP.canvasW/srcW, APP.canvasH/srcH); img.scale(APP.s_baseArtScale).set({ left:APP.canvasW/2, top:APP.canvasH/2, angle:0 }); document.getElementById('s-zoom-in').value=1; window.sCanvas.renderAll(); window.updateBleedWarnings(window.sCanvas); };
    window.triggerUpload       = ()   => { document.getElementById('adv-file-in').click(); };

    window.toggleFullScreen = function() {
        const root = document.getElementById('playmat-tool-root');
        const btn  = document.getElementById('fs-toggle-btn');
        const bd   = document.getElementById('fs-backdrop');
        root.classList.toggle('app-fullscreen-mode');
        if (root.classList.contains('app-fullscreen-mode')) { bd.style.display='block'; btn.innerText='EXIT FULL SCREEN'; btn.style.background='var(--danger-red)'; }
        else { bd.style.display='none'; btn.innerText='FULL SCREEN'; btn.style.background='var(--brand-hover)'; }
        setTimeout(() => window.changeSize(), 350);
    };

    window.workspaceZoom = (amt) => {
        if (amt === 0) APP.currentZoom = 1; else APP.currentZoom += amt;
        APP.currentZoom = Math.max(0.5, Math.min(APP.currentZoom, 3));
        document.getElementById('canvas-wrapper').style.transform = `scale(${APP.currentZoom})`;
        window.updateCursorStyle();
    };

    window.initCanvas = function() {
        window.canvas  = new fabric.Canvas('main-canvas',    { backgroundColor:'#000', preserveObjectStacking:true });
        window.rCanvas = new fabric.Canvas('recolor-canvas', { backgroundColor:null });
        window.rCanvas.freeDrawingCursor = 'none';
        window.rCanvas.on('mouse:move', (o) => { if(o.e) trackCursor(o.e); });
        window.canvas.on('selection:created', window.handleSelection);
        window.canvas.on('selection:updated', window.handleSelection);
        window.canvas.on('selection:cleared', () => {
            document.getElementById('adv-text-tools').classList.add('hidden-field');
            window.syncTransformUI();
        });
        window.canvas.on('object:modified', function(){ window.updateBleedWarnings(window.canvas); });
        window.canvas.on('object:added',    function(){ window.updateBleedWarnings(window.canvas); });
        window.initEraserInteraction();
        window.changeSize();
    };

    window.transformActive = function(action, val) {
        const obj = window.canvas.getActiveObject() || window.canvas.getObjects().find(o => o.name==='art');
        if (!obj) return;
        if (obj.originX !== 'center' || obj.originY !== 'center') {
            const c = obj.getCenterPoint(); obj.set({ originX:'center', originY:'center', left:c.x, top:c.y });
        }
        if      (action==='rotate') obj.rotate((obj.angle||0)+90);
        else if (action==='flipX')  obj.set('flipX', !obj.flipX);
        else if (action==='flipY')  obj.set('flipY', !obj.flipY);
        else if (action==='angle')  obj.set('angle', parseFloat(val));
        let angle = Math.round(obj.angle||0) % 360;
        if (angle > 180) angle -= 360; if (angle <= -180) angle += 360;
        document.getElementById('transform-rotation').value = angle;
        document.getElementById('rotation-val').innerText   = angle + '°';
        window.canvas.requestRenderAll(); window.renderForeground();
        window.updateBleedWarnings(window.canvas);
    };

    window.syncTransformUI = function() {
        const obj = window.canvas.getActiveObject() || window.canvas.getObjects().find(o => o.name==='art');
        if (obj) {
            let angle = Math.round(obj.angle||0) % 360; if(angle>180) angle-=360; if(angle<=-180) angle+=360;
            document.getElementById('transform-rotation').value = angle; document.getElementById('rotation-val').innerText = angle+'°';
        } else { document.getElementById('transform-rotation').value=0; document.getElementById('rotation-val').innerText='0°'; }
    };

    window.initEraserInteraction = function() {
        const eraserEl = document.getElementById('eraser-interaction');
        let isErasing = false, currentErasure = null;
        const getCoords = (e) => {
            const rect = eraserEl.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return { x:(clientX-rect.left)/APP.currentZoom, y:(clientY-rect.top)/APP.currentZoom };
        };
        const startErase = (e) => {
            if (!APP.isMaskMode) return; if(e.type==='touchstart') e.preventDefault();
            isErasing = true;
            const pt = getCoords(e);
            currentErasure = { size:parseInt(document.getElementById('brush-size').value,10), shape:APP.currentBrushShape, points:[pt] };
            const ctx = document.getElementById('layout-canvas').getContext('2d');
            ctx.globalCompositeOperation='destination-out'; ctx.lineWidth=currentErasure.size; ctx.lineCap=currentErasure.shape; ctx.lineJoin=currentErasure.shape==='round'?'round':'miter';
            ctx.beginPath(); ctx.moveTo(pt.x,pt.y); ctx.lineTo(pt.x+0.01,pt.y); ctx.stroke();
        };
        const moveErase = (e) => {
            if (!isErasing) return; if(e.type==='touchmove') e.preventDefault();
            const pt = getCoords(e); currentErasure.points.push(pt);
            const ctx = document.getElementById('layout-canvas').getContext('2d');
            ctx.lineTo(pt.x,pt.y); ctx.stroke();
        };
        const endErase = () => { if(isErasing) { isErasing=false; APP.erasedPaths.push(currentErasure); window.updateRecolorMask(); } };
        eraserEl.addEventListener('mousedown',  startErase);
        eraserEl.addEventListener('touchstart', startErase, {passive:false});
        window.addEventListener('mousemove',  moveErase);
        window.addEventListener('touchmove',  moveErase, {passive:false});
        window.addEventListener('mouseup',    endErase);
        window.addEventListener('touchend',   endErase);
    };

    window.toggleMaskMode = function() {
        if (APP.isRecolorMode) window.toggleRecolorMode();
        APP.isMaskMode = !APP.isMaskMode;
        const btn = document.getElementById('mask-toggle-btn'), ctrl = document.getElementById('mask-controls'), interaction = document.getElementById('eraser-interaction');
        if (APP.isMaskMode) { btn.innerText='EXIT ERASER'; btn.classList.add('active'); ctrl.classList.remove('hidden-field'); interaction.style.pointerEvents='auto'; window.updateCursorStyle(); }
        else { btn.innerText='ENABLE MANUAL ERASER'; btn.classList.remove('active'); ctrl.classList.add('hidden-field'); interaction.style.pointerEvents='none'; const c=document.getElementById('brush-cursor'); if(c) c.style.display='none'; }
    };

    window.undoMask  = () => { if(APP.erasedPaths.length>0) { APP.erasedPaths.pop(); window.renderLayout(); } };
    window.resetMask = () => { APP.erasedPaths=[]; window.renderLayout(); };
    window.updateRecolorMask = () => { const lCanvas=document.getElementById('layout-canvas'); const url=`url(${lCanvas.toDataURL()})`; document.getElementById('recolor-container').style.setProperty('mask-image',url); document.getElementById('recolor-container').style.setProperty('-webkit-mask-image',url); };

    window.toggleRecolorMode = function() {
        if (APP.isMaskMode) window.toggleMaskMode();
        APP.isRecolorMode = !APP.isRecolorMode;
        const btn=document.getElementById('recolor-toggle-btn'), ctrl=document.getElementById('recolor-controls'), rContainer=document.getElementById('recolor-container');
        if (APP.isRecolorMode) { btn.innerText='EXIT RECOLOR'; btn.classList.add('active'); ctrl.classList.remove('hidden-field'); rContainer.style.pointerEvents='auto'; window.rCanvas.isDrawingMode=true; window.rCanvas.freeDrawingBrush=new fabric.PencilBrush(window.rCanvas); window.updateRecolorBrush(); }
        else { btn.innerText='ENABLE RECOLOR BRUSH'; btn.classList.remove('active'); ctrl.classList.add('hidden-field'); rContainer.style.pointerEvents='none'; window.rCanvas.isDrawingMode=false; const c=document.getElementById('brush-cursor'); if(c) c.style.display='none'; }
    };

    window.updateRecolorBrush = () => { if(window.rCanvas.freeDrawingBrush) { window.rCanvas.freeDrawingBrush.width=parseInt(document.getElementById('recolor-size').value,10); window.rCanvas.freeDrawingBrush.color=document.getElementById('recolor-color').value; window.rCanvas.freeDrawingBrush.strokeLineCap=APP.currentBrushShape; window.rCanvas.freeDrawingBrush.strokeLineJoin=APP.currentBrushShape==='round'?'round':'miter'; window.updateCursorStyle(); } };
    window.undoRecolor  = () => { const objs=window.rCanvas.getObjects(); if(objs.length>0) { window.rCanvas.remove(objs[objs.length-1]); window.rCanvas.renderAll(); } };
    window.resetRecolor = () => { window.rCanvas.clear(); };

    window.addAdvText = () => {
        const t = new fabric.IText("Double Click", { left:APP.canvasW/2, top:APP.canvasH/2, originX:'center', originY:'center', fill:'#ffffff', stroke:'#000000', strokeWidth:2, fontSize:40, fontFamily:'Rubik' });
        window.canvas.add(t); window.canvas.bringToFront(t); window.canvas.setActiveObject(t); window.canvas.renderAll();
    };

    window.handleSelection = (e) => {
        window.syncTransformUI();
        if (e.selected && e.selected[0].type==='i-text') {
            document.getElementById('adv-text-tools').classList.remove('hidden-field');
            document.getElementById('adv-font-family').value    = e.selected[0].fontFamily||'Rubik';
            document.getElementById('adv-text-size-in').value   = e.selected[0].fontSize||40;
            document.getElementById('adv-text-col').value       = e.selected[0].fill||'#ffffff';
            document.getElementById('adv-text-stroke').value    = e.selected[0].stroke||'#000000';
        } else { document.getElementById('adv-text-tools').classList.add('hidden-field'); }
    };
    window.updateAdvTextAttr = (attr, val) => { const obj=window.canvas.getActiveObject(); if(obj) { obj.set(attr,val); window.canvas.requestRenderAll(); if(attr==='fontFamily') setTimeout(()=>window.canvas.requestRenderAll(),150); } };
    window.removeAdvActive   = () => { window.canvas.remove(window.canvas.getActiveObject()); document.getElementById('adv-text-tools').classList.add('hidden-field'); window.canvas.renderAll(); };

    window.changeSize = function() {
        const conf=SIZE_DB[APP.activeSizeKey], col=document.getElementById('canvas-column');
        const isMobile=window.innerWidth<=900, padding=isMobile?20:80;
        const measuredW = col.clientWidth - padding;
        // If the column hasn't painted yet (clientWidth===0), defer one frame so we
        // get a real measurement rather than falling back to the 250px minimum,
        // which would make forceFit calculate the wrong scale and crop the image.
        if (measuredW <= 0) { requestAnimationFrame(() => window.changeSize()); return; }
        APP.canvasW = Math.max(measuredW, 250);
        APP.canvasH = APP.canvasW / (conf.w / conf.h);
        window.canvas.setDimensions({ width:APP.canvasW, height:APP.canvasH });
        window.rCanvas.setDimensions({ width:APP.canvasW, height:APP.canvasH });
        document.getElementById('canvas-wrapper').style.width  = APP.canvasW + 'px';
        document.getElementById('canvas-wrapper').style.height = APP.canvasH + 'px';
        window.drawAdvGuides(APP.canvasW, APP.canvasH, conf.w);
        window.forceFit(); if(APP.activeLayoutUrl) window.renderLayout(); window.renderForeground();
    };

    window.toggleAdvGuides = () => { const g=window.canvas.getObjects().find(o=>o.name==='guides'); if(g) { g.visible=!g.visible; window.canvas.renderAll(); } };

    window.changeRbPoints = function() {
        const isAdv = document.getElementById('adv-backdrop').style.display==='flex';
        const val   = isAdv ? document.getElementById('rb-points-sel').value : (document.getElementById('s-rb-points-sel')?.value||'none');
        const url   = window.RB_POINTS_DB[val];
        if (!url) { APP.activePointsUrl=null; isAdv?window.renderLayout():window.renderSimpleLayout(); return; }
        if (APP.activePointsUrl !== url) {
            APP.activePointsUrl = url;
            // Use fabric.Image.fromURL so ibb.co CORS headers are handled correctly
            fabric.Image.fromURL(url, (fabricImg, isError) => {
                if (isError) { console.error('Failed to load points overlay:', url); return; }
                window.rbPointsImg = fabricImg.getElement();
                isAdv ? window.renderLayout() : window.renderSimpleLayout();
            }, { crossOrigin: 'anonymous' });
        } else { isAdv?window.renderLayout():window.renderSimpleLayout(); }
    };

    window.setSolidBackground = (color) => { window.canvas.backgroundColor=String(color); window.canvas.renderAll(); };
    window.clearArtwork = () => { const a=window.canvas.getObjects().find(o=>o.name==='art'); if(a) { window.canvas.remove(a); window.canvas.renderAll(); window.clearAutoFrameBreak(); } };

    window.drawAdvGuides = function(w, h, inches) {
        window.canvas.getObjects().forEach(o => { if(o.name==='guides') window.canvas.remove(o); });
        const ppi=w/inches, bleed=0.25*ppi, safe=0.75*ppi;
        const bleedFrame=new fabric.Path(`M 0 0 H ${w} V ${h} H 0 Z M ${bleed} ${bleed} V ${h-bleed} H ${w-bleed} V ${bleed} Z`,{fill:'rgba(255,0,0,0.25)',selectable:false,evented:false,fillRule:'evenodd'});
        const safeFrame =new fabric.Path(`M ${bleed} ${bleed} H ${w-bleed} V ${h-bleed} H ${bleed} Z M ${safe} ${safe} V ${h-safe} H ${w-safe} V ${safe} Z`,{fill:'rgba(255,255,0,0.15)',selectable:false,evented:false,fillRule:'evenodd'});
        const g=new fabric.Group([bleedFrame,safeFrame],{name:'guides',selectable:false,evented:false});
        window.canvas.add(g); g.bringToFront();
    };

    window.handleUpload = function(input) {
        if (!input.files[0]) return;
        const r = new FileReader();
        r.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                window.resetFilters(); window.checkDPI(img);
                img.set({ name:'art', originX:'center', originY:'center' });
                window.canvas.getObjects().forEach(o => { if(o.name==='art') window.canvas.remove(o); });
                window.canvas.add(img).sendToBack(img);
                window.clearAutoFrameBreak(); window.forceFit(); window.toggleAcc('acc-size', true);
                window.updateBleedWarnings(window.canvas);
            });
        };
        r.readAsDataURL(input.files[0]);
    };

    window.forceFit = function() {
        const img = window.canvas.getObjects().find(o => o.name==='art'); if(!img) return;
        // Use naturalWidth/naturalHeight from the underlying element so EXIF-rotated
        // images (where img.width/height may be swapped or incorrect) scale correctly.
        const el = img.getElement();
        const srcW = (el && el.naturalWidth)  || img.width;
        const srcH = (el && el.naturalHeight) || img.height;
        APP.baseArtScale = Math.max(APP.canvasW/srcW, APP.canvasH/srcH);
        img.scale(APP.baseArtScale).set({ left:APP.canvasW/2, top:APP.canvasH/2, angle:0, flipX:false, flipY:false });
        document.getElementById('zoom-in').value=1; document.getElementById('transform-rotation').value=0; document.getElementById('rotation-val').innerText='0°';
        window.canvas.renderAll(); window.renderForeground();
        window.updateBleedWarnings(window.canvas);
    };

    window.handleZoom = (v) => { const img=window.canvas.getObjects().find(o=>o.name==='art'); if(img&&APP.baseArtScale) { img.scale(APP.baseArtScale*parseFloat(v)); window.canvas.renderAll(); window.renderForeground(); } if(window.canvas) window.updateBleedWarnings(window.canvas); };

    // --- AI FRAME BREAK ---
    window.confirmAutoFrameBreak = () => {
        const art = window.canvas.getObjects().find(o => o.name==='art');
        if (!art) { window.showAppAlert("Missing Artwork", "Please upload artwork first.", "error"); return; }
        document.getElementById('ai-warning-modal').style.display = 'flex';
    };

    window.runAutoFrameBreak = async () => {
        document.getElementById('ai-warning-modal').style.display = 'none';
        const btn = document.getElementById('ai-fb-btn');
        btn.innerHTML = 'UPLOADING...<br><span style="font-size:10px;font-weight:normal;">(Please wait)</span>'; btn.disabled = true;
        try {
            const art   = window.canvas.getObjects().find(o => o.name==='art'); if(!art) throw new Error('No artwork found.');
            const imgEl = art.getElement();
            let targetW = imgEl.naturalWidth||imgEl.width, targetH = imgEl.naturalHeight||imgEl.height;
            const maxPx = 2500000;
            if ((targetW*targetH) > maxPx) { const r=Math.sqrt(maxPx/(targetW*targetH)); targetW=Math.round(targetW*r); targetH=Math.round(targetH*r); }
            const tempC = document.createElement('canvas'); tempC.width=targetW; tempC.height=targetH;
            tempC.getContext('2d').drawImage(imgEl,0,0,targetW,targetH);
            const blob = await new Promise(res => tempC.toBlob(res,'image/jpeg',0.85));

            // FIX 1 in action: uses shared worker upload helper
            const tinyImgUrl = await uploadImageToStaging(blob, 'bg-temp.jpg', 300);
            btn.innerHTML = 'EXTRACTING CHARACTER...<br><span style="font-size:10px;font-weight:normal;">(Can take 15s)</span>';

            const startRes = await fetch(window.CLOUDFLARE_BG_WORKER_URL, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ image: tinyImgUrl })
            });
            if (!startRes.ok) throw new Error('Failed to contact background removal bridge.');
            let prediction = await startRes.json();
            if (prediction.detail || prediction.error || !prediction.id) throw new Error('Internal AI Server Error');

            let attempts = 0;
            while (!['succeeded','failed','canceled'].includes(prediction.status)) {
                if (attempts++ > 30) throw new Error('AI Server timed out.');
                await new Promise(r => setTimeout(r,2000));
                const pollRes = await fetch(`${window.CLOUDFLARE_BG_WORKER_URL}?id=${prediction.id}`);
                if (!pollRes.ok) throw new Error('Failed to poll AI status.');
                prediction = await pollRes.json();
            }
            if (prediction.status !== 'succeeded') throw new Error('AI Cloud processing failed.');

            const fgImg = new Image(); fgImg.crossOrigin='anonymous';
            fgImg.onload = () => {
                APP.aiFgImg = fgImg; window.renderForeground();
                btn.classList.add('hidden-field');
                document.getElementById('ai-fb-clear-btn').classList.remove('hidden-field');
                btn.innerHTML='✨ AUTO FRAME BREAK<br><span style="font-size:10px;font-weight:normal;">(experimental)</span>'; btn.disabled=false;
            };
            fgImg.onerror = () => {
                // onerror fires in a callback — can't throw into the outer try/catch,
                // so handle the failure directly here instead.
                console.error('Failed to load extracted foreground image.');
                window.showAppAlert("Frame Break Failed", "The AI extracted the subject but the result could not be loaded. Please try again.", "error");
                btn.innerHTML='✨ AUTO FRAME BREAK<br><span style="font-size:10px;font-weight:normal;">(experimental)</span>'; btn.disabled=false;
            };
            fgImg.src = prediction.output;
        } catch(err) {
            console.error(err);
            window.showAppAlert("Frame Break Failed", "An unexpected error occurred. Please try again or contact support.", "error");
            btn.innerHTML='✨ AUTO FRAME BREAK<br><span style="font-size:10px;font-weight:normal;">(experimental)</span>'; btn.disabled=false;
        }
    };

    window.clearAutoFrameBreak = () => {
        APP.aiFgImg = null; window.renderForeground();
        document.getElementById('ai-fb-clear-btn').classList.add('hidden-field');
        document.getElementById('ai-fb-btn').classList.remove('hidden-field');
    };

    window.renderForeground = function() {
        const fgCanvas = document.getElementById('fg-canvas'); if(!fgCanvas) return;
        const ctx = fgCanvas.getContext('2d'), ratio = window.devicePixelRatio||1;
        fgCanvas.width=APP.canvasW*ratio; fgCanvas.height=APP.canvasH*ratio;
        fgCanvas.style.width=APP.canvasW+'px'; fgCanvas.style.height=APP.canvasH+'px';
        ctx.scale(ratio,ratio); ctx.clearRect(0,0,APP.canvasW,APP.canvasH);
        if (!APP.aiFgImg) return;
        const art = window.canvas.getObjects().find(o => o.name==='art');
        if (art) {
            // art.left/top is the centre point (originX/Y = 'center').
            // getScaledWidth/Height() returns the correctly scaled display size.
            // Translate to centre, rotate, flip, then draw centred on that point.
            const w = art.getScaledWidth();
            const h = art.getScaledHeight();
            ctx.save();
            if (art.customFilterStr) ctx.filter = art.customFilterStr;
            ctx.translate(art.left, art.top);
            ctx.rotate(art.angle * Math.PI / 180);
            if (art.flipX) ctx.scale(-1, 1);
            if (art.flipY) ctx.scale(1, -1);
            ctx.drawImage(APP.aiFgImg, -w / 2, -h / 2, w, h);
            ctx.restore();
        }
    };

    window.filterFormats = function() {
        const game=document.getElementById('game-sel').value, activeSize=APP.activeSizeKey==='standard'?'Standard':'Extended';
        const fSel=document.getElementById('format-sel'), hSel=document.getElementById('hand-sel');
        if(game==='Riftbound') document.getElementById('rb-extras-wrap').classList.remove('hidden-field');
        else                   document.getElementById('rb-extras-wrap').classList.add('hidden-field');
        if (!game) { document.getElementById('zone-style-wrap').classList.add('hidden-field'); fSel.classList.add('hidden-field'); hSel.classList.add('hidden-field'); fSel.value=''; hSel.value=''; APP.activeLayoutUrl=null; window.renderLayout(); return; }
        const formats=[...new Set(LAYOUT_RAW.filter(i=>i.game===game&&i.size===activeSize&&i.format!=='').map(i=>i.format))];
        if(game==='Riftbound') { const order=["Bounded","Unbounded","Rubicon Mod","Regional Solo Mod","Gen Con Solo","Houston Regional","Houston Regional w/ Points"]; formats.sort((a,b)=>{ let ia=order.indexOf(a),ib=order.indexOf(b); return (ia===-1?99:ia)-(ib===-1?99:ib); }); }
        fSel.value=''; hSel.value='';
        if (formats.length===0) { fSel.classList.add('hidden-field'); window.filterHands(); }
        else { fSel.classList.remove('hidden-field'); fSel.innerHTML='<option value="">-- Select Format / Style --</option>'; formats.forEach(f=>fSel.innerHTML+=`<option value="${f}">${f}</option>`); hSel.classList.add('hidden-field'); }
    };

    window.filterHands = function() {
        const game=document.getElementById('game-sel').value, format=document.getElementById('format-sel').value, activeSize=APP.activeSizeKey==='standard'?'Standard':'Extended';
        const hSel=document.getElementById('hand-sel');
        const formats=[...new Set(LAYOUT_RAW.filter(i=>i.game===game&&i.size===activeSize&&i.format!=='').map(i=>i.format))];
        if(formats.length>0&&format==='') { hSel.classList.add('hidden-field'); hSel.value=''; APP.activeLayoutUrl=null; window.renderLayout(); return; }
        const hands=[...new Set(LAYOUT_RAW.filter(i=>i.game===game&&i.size===activeSize&&i.format===format&&i.hand!=='').map(i=>i.hand))];
        hSel.value='';
        if(hands.length===0) { hSel.classList.add('hidden-field'); window.applyFinalLayout(); }
        else { hSel.classList.remove('hidden-field'); hSel.innerHTML='<option value="">-- Select Handedness --</option>'; hands.forEach(h=>hSel.innerHTML+=`<option value="${h}">${h}</option>`); }
    };

    window.applyFinalLayout = function() {
        const game=document.getElementById('game-sel').value, format=document.getElementById('format-sel').value, hand=document.getElementById('hand-sel').value, activeSize=APP.activeSizeKey==='standard'?'Standard':'Extended';
        const hands=[...new Set(LAYOUT_RAW.filter(i=>i.game===game&&i.size===activeSize&&i.format===format&&i.hand!=='').map(i=>i.hand))];
        if(hands.length>0&&hand==='') { APP.activeLayoutUrl=null; window.renderLayout(); return; }
        const match=LAYOUT_RAW.find(i=>i.game===game&&i.format===format&&i.hand===hand&&i.size===activeSize);
        if(match) { APP.activeLayoutUrl=match.url ?? ''; APP.erasedPaths=[]; window.resetRecolor(); document.getElementById('zone-style-wrap').classList.remove('hidden-field'); window.renderLayout(); }
    };

    window.updateOpacity = () => {
        const hide = document.getElementById('opacity-toggle')?.checked;
        document.getElementById('layout-canvas').style.opacity = hide ? '0' : '1';
    };

    window.toggleGradient = function() {
        const checked = document.getElementById('gradient-toggle')?.checked;
        document.getElementById('gradient-wrap')?.classList.toggle('hidden-field', !checked);
        window.renderLayout();
    };

    window.toggleZoneOpacity = function() {
        window.updateOpacity();
    };

    window.renderLayout = function() {
        const gradToggle = document.getElementById('gradient-toggle');
        const mode = (gradToggle && gradToggle.checked) ? 'gradient' : 'solid';
        if (mode === 'gradient') {
            const deg = parseInt(document.getElementById('gradient-angle')?.value, 10) || 0;
            document.getElementById('gradient-wrap')?.classList.remove('hidden-field');
            const angleVal = document.getElementById('gradient-angle-val');
            if (angleVal) angleVal.innerText = deg + '°';
        } else {
            document.getElementById('gradient-wrap')?.classList.add('hidden-field');
        }
        const lCanvas=document.getElementById('layout-canvas'); if(!lCanvas) return; window.updateOpacity();
        // null = no layout selected at all → clear canvas and bail
        // ''   = Points Only format → fall through to drawFn(null) below
        if (APP.activeLayoutUrl === null || APP.activeLayoutUrl === undefined) {
            const ctx=lCanvas.getContext('2d'); ctx.clearRect(0,0,lCanvas.width,lCanvas.height);
            document.getElementById('recolor-container').style.setProperty('mask-image','none');
            document.getElementById('recolor-container').style.setProperty('-webkit-mask-image','none'); return;
        }
        const isRiftbound=document.getElementById('game-sel').value==='Riftbound';
        const rbPointsVal=isRiftbound?document.getElementById('rb-points-sel').value:'none';
        const hand=document.getElementById('hand-sel').value, format=document.getElementById('format-sel').value;
        const c1 = document.getElementById('zone-col')?.value || '#ffffff';

        const drawFn = (img) => window.drawLayoutCanvasCore(lCanvas.getContext('2d'), img, lCanvas, c1, mode, true, isRiftbound, rbPointsVal, hand, format);
        // Points Only format has an empty URL — draw with null image (points strip only)
        if (APP.activeLayoutUrl === '') { drawFn(null); return; }
        if (APP.cachedLayoutUrl===APP.activeLayoutUrl && APP.cachedLayoutImg) { drawFn(APP.cachedLayoutImg); }
        else {
            // Use fabric.Image.fromURL so ibb.co CORS headers are handled correctly
            fabric.Image.fromURL(APP.activeLayoutUrl, (fabricImg, isError) => {
                if (isError) { console.error('Failed to load layout image:', APP.activeLayoutUrl); return; }
                const img = fabricImg.getElement();
                APP.cachedLayoutImg = img; APP.cachedLayoutUrl = APP.activeLayoutUrl;
                drawFn(img);
            }, { crossOrigin: 'anonymous' });
        }
    };

    // FIX 4 in action: drawLayoutCanvasCore now delegates to shared helpers
    window.drawLayoutCanvasCore = function(ctx, img, lCanvas, c1, mode, isAdv, isRiftbound, rbPointsVal, hand, format) {
        // Points Only: img will be null — pass a blank 1x1 image so the rest of the
        // pipeline (points draw, source-in fill) still runs correctly.
        if (!img) { img = document.createElement('canvas'); img.width = 1; img.height = 1; }
        const ratio=window.devicePixelRatio||1;
        lCanvas.width=APP.canvasW*ratio; lCanvas.height=APP.canvasH*ratio;
        lCanvas.style.width=APP.canvasW+'px'; lCanvas.style.height=APP.canvasH+'px';
        ctx.scale(ratio,ratio); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
        ctx.clearRect(0,0,APP.canvasW,APP.canvasH); ctx.globalAlpha=1.0; ctx.globalCompositeOperation='source-over';

        if (isRiftbound) {
            // Clip to safe area in CSS pixel space (after ratio scale).
            // Safe inset = 225 native units; s converts native→CSS pixels.
            const nativeW = Math.round(SIZE_DB[APP.activeSizeKey]?.w * 300) || Math.round(24.5 * 300);
        const s = APP.canvasW / nativeW;
            const sx = 225*s, sy = 225*s, sw = 6900*s, sh = 3900*s;
            ctx.save();
            ctx.beginPath();
            ctx.rect(sx, sy, sw, sh);
            ctx.clip();
            drawRiftboundLayout(ctx, img, APP.canvasW, APP.canvasH, hand, format, rbPointsVal);
            ctx.globalCompositeOperation = 'source-in';
            applyGradientOrSolidFill(ctx, APP.canvasW, APP.canvasH, isAdv ? mode : 'solid', c1);
            ctx.restore();
        } else {
            ctx.drawImage(img, 0, 0, APP.canvasW, APP.canvasH);
            ctx.globalCompositeOperation = 'source-in';
            applyGradientOrSolidFill(ctx, APP.canvasW, APP.canvasH, isAdv ? mode : 'solid', c1);
        }

        if (isAdv && APP.erasedPaths.length>0) {
            ctx.globalCompositeOperation='destination-out';
            APP.erasedPaths.forEach(path => {
                ctx.lineWidth=path.size; ctx.lineCap=path.shape; ctx.lineJoin=path.shape==='round'?'round':'miter';
                ctx.beginPath(); ctx.moveTo(path.points[0].x,path.points[0].y);
                path.points.forEach(pt=>ctx.lineTo(pt.x,pt.y)); ctx.stroke();
            });
        }
        if (isAdv) window.updateRecolorMask(); else ctx.globalCompositeOperation='source-over';
    };

    // ============================================================
    // FIX 3 (CODE QUALITY): submitToCart broken into named steps
    // ============================================================
    window.submitSimpleCart = () => window.submitToCart('simple');

    window.submitToCart = async function(mode) {
        const isAdv        = (mode==='adv');
        const btn          = isAdv ? document.getElementById('sidebar-atc') : document.getElementById('simple-atc');
        const activeCanvas = isAdv ? window.canvas : window.sCanvas;

        const varId = getPageVariant();
        const qty   = getPageQty();

        if (!varId) { window.showAppAlert("Missing Selection", "Please select your edge style on the product page before adding to cart.", "error"); return; }
        if (!activeCanvas.getObjects().find(o=>o.name==='art') && !activeCanvas.backgroundColor) {
            window.showAppAlert("Missing Artwork","Please upload artwork before adding to cart.","error"); return;
        }

        // BLEED COVERAGE GATE: if art doesn't fill canvas, show confirm modal.
        if (!window.checkArtCoverage(activeCanvas)) {
            APP._bleedConfirmCallback = function() { window._executeCart(mode, btn, activeCanvas, varId, qty); };
            document.getElementById('bleed-confirm-modal').style.display = 'flex';
            return;
        }

        await window._executeCart(mode, btn, activeCanvas, varId, qty);
    };

    // Extracted cart execution — called directly or via bleed confirm callback.
    window._executeCart = async function(mode, btn, activeCanvas, varId, qty) {
        const isAdv = (mode === 'adv');
        btn.innerText='ADDING TO CART...'; btn.disabled=true;
        try {
            const blob          = await buildPrintCanvas(isAdv, activeCanvas);
            const printFilename = window.buildPrintFilename(varId);
            const fileUrl       = await uploadImageToStaging(blob, printFilename);
            await pushToShopifyCart(fileUrl, varId, qty, isAdv);
            btn.innerText='ADDED TO CART! ✓'; btn.style.background='var(--success-green)';
            setTimeout(function(){ window.location.href='/cart'; },1000);
        } catch(err) {
            console.error(err);
            window.showAppAlert("Cart Error", err.message, "error");
            btn.innerText='ADD TO CART'; btn.style.background='var(--brand-primary)'; btn.disabled=false;
        }
    };

    // Injects 300 DPI metadata into a JPEG blob so it opens correctly in
    // Photoshop, Photopea, Windows Explorer, etc.
    // Strategy: always prepend a fresh JFIF APP0 segment with DPI=300 right
    // after the SOI marker, replacing any existing APP0/APP1 density info.
    async function injectJpegDpi(blob, dpi) {
        const buf   = await blob.arrayBuffer();
        const src   = new Uint8Array(buf);
        if (src[0] !== 0xFF || src[1] !== 0xD8) return blob; // not a valid JPEG

        // Build a 18-byte JFIF APP0 segment with the desired DPI
        // FF E0 | len=0x0010 | "JFIF\0" | ver=1.1 | units=1(inch) | Xdpi | Ydpi | 0 0
        const app0 = new Uint8Array([
            0xFF, 0xE0,               // APP0 marker
            0x00, 0x10,               // segment length = 16
            0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
            0x01, 0x01,               // version 1.1
            0x01,                     // units: 1 = dots per inch
            (dpi >> 8) & 0xFF, dpi & 0xFF, // Xdensity
            (dpi >> 8) & 0xFF, dpi & 0xFF, // Ydensity
            0x00, 0x00               // no thumbnail
        ]);

        // Skip the SOI (FF D8), then skip any existing APP0 (FF E0) or APP1 (FF E1)
        // segments so we don't stack multiple conflicting density markers.
        let skip = 2;
        while (skip < src.length - 3) {
            if (src[skip] !== 0xFF) break;
            const m = src[skip + 1];
            if (m !== 0xE0 && m !== 0xE1) break; // stop at first non-APP segment
            const segLen = (src[skip + 2] << 8) | src[skip + 3];
            skip += 2 + segLen;
        }

        // Reassemble: SOI + new APP0 + remainder (skipping old APP0/APP1)
        const out = new Uint8Array(2 + app0.length + (src.length - skip));
        out.set(src.slice(0, 2));          // FF D8
        out.set(app0, 2);                  // new JFIF APP0
        out.set(src.slice(skip), 2 + app0.length); // rest of original JPEG
        return new Blob([out], { type: 'image/jpeg' });
    }

    async function buildPrintCanvas(isAdv, activeCanvas) {
        const sizeSel   = APP.activeSizeKey||'standard';
        const dpi       = 300;
        const printW    = Math.round(SIZE_DB[sizeSel].w * dpi);
        const printH    = Math.round(SIZE_DB[sizeSel].h * dpi);
        const scale     = printW / APP.canvasW;

        const layoutImg   = isAdv ? APP.cachedLayoutImg : APP.s_cachedLayoutImg;
        const layoutColor = isAdv ? (document.getElementById('zone-col')?.value||'#ffffff') : (document.getElementById('s-col')?.value||'#ffffff');
        const gameVal     = isAdv ? document.getElementById('game-sel').value   : (document.getElementById('s-game-sel')?.value||'None');
        const handVal     = isAdv ? document.getElementById('hand-sel').value   : (document.getElementById('s-hand-sel')?.value||'N/A');
        const formatVal   = isAdv ? document.getElementById('format-sel').value : (document.getElementById('s-format-sel')?.value||'N/A');
        const isRiftbound = gameVal==='Riftbound';
        const rbPointsVal = isRiftbound ? (isAdv ? document.getElementById('rb-points-sel').value : (document.getElementById('s-rb-points-sel')?.value||'none')) : 'none';

        // Hide guides temporarily
        const g=activeCanvas.getObjects().find(o=>o.name==='guides'), wasVisible=g?g.visible:false;
        if(g) g.visible=false; activeCanvas.renderAll();

        const mCanvas=document.createElement('canvas'); mCanvas.width=printW; mCanvas.height=printH;
        const mCtx=mCanvas.getContext('2d');
        if(!mCtx) throw new Error('Memory error: Please try from a desktop computer.');
        mCtx.imageSmoothingEnabled=true; mCtx.imageSmoothingQuality='high';
        if(activeCanvas.backgroundColor) { mCtx.fillStyle=activeCanvas.backgroundColor; mCtx.fillRect(0,0,printW,printH); }

        // Draw artwork at print resolution.
        // Fabric's setZoom() only scales the viewport — art object left/top stay in
        // display-pixel space, so the rendered image gets clipped to the top-left corner.
        // Fix: draw the raw art image directly using display-space transform props
        // scaled up by the print/display ratio. Then use Fabric zoom only for extras
        // (text layers etc.) with the art hidden so it isn't double-rendered.
        const art = activeCanvas.getObjects().find(o => o.name === 'art');
        const origW=activeCanvas.width, origH=activeCanvas.height, origZoom=activeCanvas.getZoom();

        // 1. Draw art directly at print resolution
        if (art) {
            const el   = art.getElement();
            const srcW = (el && el.naturalWidth)  || el.width  || art.width;
            const srcH = (el && el.naturalHeight) || el.height || art.height;
            const pW   = srcW * art.scaleX * scale;
            const pH   = srcH * art.scaleY * scale;
            const pCx  = art.left * scale;   // left/top = centre point (originX/Y:'center')
            const pCy  = art.top  * scale;
            mCtx.save();
            if (art.customFilterStr) mCtx.filter = art.customFilterStr;
            mCtx.translate(pCx, pCy);
            mCtx.rotate((art.angle || 0) * Math.PI / 180);
            if (art.flipX) mCtx.scale(-1, 1);
            if (art.flipY) mCtx.scale(1, -1);
            mCtx.drawImage(el, -pW / 2, -pH / 2, pW, pH);
            mCtx.restore();
            mCtx.filter = 'none';
        }

        // 2. Draw non-art objects (text, shapes) via Fabric zoom with art hidden
        const extras = activeCanvas.getObjects().filter(o => o.name !== 'art' && o.name !== 'guides');
        if (extras.length > 0) {
            if (art) art.visible = false;
            activeCanvas.setDimensions({width:printW,height:printH}); activeCanvas.setZoom(scale); activeCanvas.renderAll();
            mCtx.drawImage(activeCanvas.getElement(), 0, 0);
            activeCanvas.setDimensions({width:origW,height:origH}); activeCanvas.setZoom(origZoom);
            if (art) { art.visible = true; activeCanvas.renderAll(); }
        }

        // Draw layout overlay — only if the user has actively selected a layout in this session.
        // Guard against stale cachedLayoutImg persisting from a previous session without restart.
        const activeUrl = isAdv ? APP.activeLayoutUrl : APP.s_activeLayoutUrl;
        if (layoutImg && activeUrl !== null && activeUrl !== undefined) {
            const tCanvas=document.createElement('canvas'); tCanvas.width=printW; tCanvas.height=printH;
            const tCtx=tCanvas.getContext('2d');
            if (isRiftbound) {
                // Clip to safe area in print pixel space.
                // At 300dpi: safe inset = 225px (0.75" × 300).
                // Scale factor: printW maps to the product's native canvas width.
                const nativePrintW = Math.round(SIZE_DB[sizeSel]?.w * 300) || Math.round(24.5 * 300);
                const ps = printW / nativePrintW;
                const px = 225*ps, py = 225*ps, pw = 6900*ps, ph = 3900*ps;
                tCtx.save();
                tCtx.rect(px, py, pw, ph);
                tCtx.clip();
                drawRiftboundLayout(tCtx, layoutImg, printW, printH, handVal, formatVal, rbPointsVal);
                tCtx.globalCompositeOperation='source-in';
                const gradTog = document.getElementById('gradient-toggle');
                const fillMode = isAdv ? ((gradTog && gradTog.checked) ? 'gradient' : 'solid') : 'solid';
                applyGradientOrSolidFill(tCtx, printW, printH, fillMode, layoutColor);
                tCtx.restore();
            } else {
                tCtx.drawImage(layoutImg,0,0,printW,printH);
                tCtx.globalCompositeOperation='source-in';
                const gradTog = document.getElementById('gradient-toggle');
                const fillMode = isAdv ? ((gradTog && gradTog.checked) ? 'gradient' : 'solid') : 'solid';
                applyGradientOrSolidFill(tCtx, printW, printH, fillMode, layoutColor);
            }

            if (isAdv && APP.erasedPaths.length>0) {
                tCtx.globalCompositeOperation='destination-out';
                APP.erasedPaths.forEach(path => {
                    tCtx.lineWidth=path.size*scale; tCtx.lineCap=path.shape; tCtx.lineJoin=path.shape==='round'?'round':'miter';
                    tCtx.beginPath(); tCtx.moveTo(path.points[0].x*scale,path.points[0].y*scale);
                    path.points.forEach(pt=>tCtx.lineTo(pt.x*scale,pt.y*scale)); tCtx.stroke();
                });
            }
            const opHide = isAdv && document.getElementById('opacity-toggle')?.checked;
            mCtx.save(); mCtx.globalAlpha = opHide ? 0 : 1.0;
            mCtx.drawImage(tCanvas,0,0,printW,printH); mCtx.restore();
        }

        // Draw recolor layer
        if (isAdv && window.rCanvas) {
            window.rCanvas.setDimensions({width:printW,height:printH}); window.rCanvas.setZoom(scale); window.rCanvas.renderAll();
            mCtx.drawImage(window.rCanvas.getElement(),0,0);
            window.rCanvas.setDimensions({width:origW,height:origH}); window.rCanvas.setZoom(origZoom);
        }

        // Draw AI foreground layer at print resolution.
        // Mirror renderForeground: use getScaledWidth/Height scaled to print res,
        // centred on art.left/top (which is the centre point, originX/Y = 'center').
        if (isAdv && APP.aiFgImg) {
            const art=activeCanvas.getObjects().find(o=>o.name==='art');
            if(art) {
                const w = art.getScaledWidth()  * scale;
                const h = art.getScaledHeight() * scale;
                const cx = art.left * scale;
                const cy = art.top  * scale;
                mCtx.save();
                if(art.customFilterStr) mCtx.filter=art.customFilterStr;
                mCtx.translate(cx, cy);
                mCtx.rotate(art.angle*Math.PI/180);
                if(art.flipX) mCtx.scale(-1,1);
                if(art.flipY) mCtx.scale(1,-1);
                mCtx.drawImage(APP.aiFgImg, -w/2, -h/2, w, h);
                mCtx.restore();
            }
        }

        if(g) g.visible=wasVisible; activeCanvas.renderAll();

        return new Promise((resolve,reject) => {
            mCanvas.toBlob(async b => {
                if (!b) { reject(new Error('Canvas export failed.')); return; }
                try { resolve(await injectJpegDpi(b, 300)); }
                catch(e) { resolve(b); } // if injection fails, fall back to original blob
            },'image/jpeg',0.98);
        });
    }

    async function pushToShopifyCart(fileUrl, varId, qty, isAdv) {
        const gameVal   = isAdv ? document.getElementById('game-sel').value   : (document.getElementById('s-game-sel')?.value  ||'None');
        const formatVal = isAdv ? document.getElementById('format-sel').value : (document.getElementById('s-format-sel')?.value||'N/A');
        const handVal   = isAdv ? document.getElementById('hand-sel').value   : (document.getElementById('s-hand-sel')?.value  ||'N/A');

        // Add the playmat line item with the print file URL as a line item property.
        // Appstle will associate this with the bundle based on its own configuration.
        const cartItems = [{
            id: parseInt(varId, 10), quantity: qty,
            properties: {
                'Game Layout':    gameVal  || 'None',
                'Format':         formatVal || 'N/A',
                'Handedness':     handVal  || 'N/A',
                'Image Upload':   'Successful ✓',
                '_Print_File_URL': fileUrl,
                '_File_ID':        fileUrl.split('/').pop().replace('.jpg', '')
            }
        }];
        const cartRes = await fetch((window.Shopify?.routes?.root || '/') + 'cart/add.js', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cartItems })
        });
        if (!cartRes.ok) throw new Error('Failed to add to Shopify Cart');
    }

    // --- COLOR SYNC HELPERS (hex input ↔ color picker) ---
    window.syncHex = function(pickerId, hexId) {
        const picker = document.getElementById(pickerId);
        const hex    = document.getElementById(hexId);
        if (picker && hex) hex.value = picker.value;
    };

    window.syncColor = function(hexId, pickerId) {
        const hex    = document.getElementById(hexId);
        const picker = document.getElementById(pickerId);
        if (!hex || !picker) return;
        const val = hex.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) picker.value = val;
    };

    window.hexToRgba = function(hex, alpha) {
        const r = parseInt(hex.slice(1,3),16);
        const g = parseInt(hex.slice(3,5),16);
        const b = parseInt(hex.slice(5,7),16);
        return `rgba(${r},${g},${b},${alpha})`;
    };

    // --- BRUSH CURSOR STYLE ---
    window.updateCursorStyle = function() {
        const cursor = document.getElementById('brush-cursor');
        if (!cursor) return;
        const isRecolor = APP.isRecolorMode;
        const size = parseInt(document.getElementById(isRecolor ? 'recolor-size' : 'brush-size')?.value || 40, 10);
        const scaled = size * APP.currentZoom;
        cursor.style.width        = scaled + 'px';
        cursor.style.height       = scaled + 'px';
        cursor.style.borderRadius = APP.currentBrushShape === 'round' ? '50%' : '0';
    };

    // --- SIMPLE EDITOR LAYOUT DROPDOWNS ---
    window.filterSimpleFormats = function() {
        const game       = document.getElementById('s-game-sel').value;
        const activeSize = APP.activeSizeKey === 'standard' ? 'Standard' : APP.activeSizeKey === 'extended' ? 'Extended' : APP.activeSizeKey;
        const fSel       = document.getElementById('s-format-sel');
        const hSel       = document.getElementById('s-hand-sel');
        const colorWrap  = document.getElementById('s-color-wrap');

        const rbExtras = document.getElementById('s-rb-extras-wrap');
        if (rbExtras) {
            if (game === 'Riftbound') rbExtras.classList.remove('hidden-field');
            else                      rbExtras.classList.add('hidden-field');
        }

        if (!game) {
            fSel.classList.add('hidden-field'); hSel.classList.add('hidden-field');
            if (colorWrap) colorWrap.classList.add('hidden-field');
            fSel.value = ''; hSel.value = '';
            APP.s_activeLayoutUrl = null; window.renderSimpleLayout(); return;
        }

        const formats = [...new Set(LAYOUT_RAW.filter(i => i.game===game && i.size===activeSize && i.format!=='').map(i => i.format))];
        fSel.value = ''; hSel.value = '';
        if (formats.length === 0) { fSel.classList.add('hidden-field'); window.filterSimpleHands(); }
        else {
            fSel.classList.remove('hidden-field');
            fSel.innerHTML = '<option value="">-- Select Format / Style --</option>';
            formats.forEach(f => fSel.innerHTML += `<option value="${f}">${f}</option>`);
            hSel.classList.add('hidden-field');
        }
    };

    window.filterSimpleHands = function() {
        const game       = document.getElementById('s-game-sel').value;
        const format     = document.getElementById('s-format-sel').value;
        const activeSize = APP.activeSizeKey === 'standard' ? 'Standard' : APP.activeSizeKey === 'extended' ? 'Extended' : APP.activeSizeKey;
        const hSel       = document.getElementById('s-hand-sel');
        const colorWrap  = document.getElementById('s-color-wrap');

        const formats = [...new Set(LAYOUT_RAW.filter(i => i.game===game && i.size===activeSize && i.format!=='').map(i => i.format))];
        if (formats.length > 0 && format === '') {
            hSel.classList.add('hidden-field'); hSel.value = '';
            APP.s_activeLayoutUrl = null; window.renderSimpleLayout(); return;
        }

        const hands = [...new Set(LAYOUT_RAW.filter(i => i.game===game && i.size===activeSize && i.format===format && i.hand!=='').map(i => i.hand))];
        hSel.value = '';
        if (hands.length === 0) { hSel.classList.add('hidden-field'); window.applySimpleLayout(); }
        else {
            hSel.classList.remove('hidden-field');
            hSel.innerHTML = '<option value="">-- Select Handedness --</option>';
            hands.forEach(h => hSel.innerHTML += `<option value="${h}">${h}</option>`);
        }
    };

    window.applySimpleLayout = function() {
        const game       = document.getElementById('s-game-sel').value;
        const format     = document.getElementById('s-format-sel').value;
        const hand       = document.getElementById('s-hand-sel').value;
        const activeSize = APP.activeSizeKey === 'standard' ? 'Standard' : APP.activeSizeKey === 'extended' ? 'Extended' : APP.activeSizeKey;
        const colorWrap  = document.getElementById('s-color-wrap');

        const hands = [...new Set(LAYOUT_RAW.filter(i => i.game===game && i.size===activeSize && i.format===format && i.hand!=='').map(i => i.hand))];
        if (hands.length > 0 && hand === '') { APP.s_activeLayoutUrl = null; window.renderSimpleLayout(); return; }

        const match = LAYOUT_RAW.find(i => i.game===game && i.format===format && i.hand===hand && i.size===activeSize);
        if (match) {
            APP.s_activeLayoutUrl = match.url ?? '';
            if (colorWrap) colorWrap.classList.remove('hidden-field');
            window.renderSimpleLayout();
        }
    };

    window.renderSimpleLayout = function() {
        const lCanvas = document.getElementById('s-layout-canvas'); if (!lCanvas) return;
        if (APP.s_activeLayoutUrl === null || APP.s_activeLayoutUrl === undefined) {
            const ctx = lCanvas.getContext('2d'); ctx.clearRect(0, 0, lCanvas.width, lCanvas.height); return;
        }
        const isRiftbound = document.getElementById('s-game-sel').value === 'Riftbound';
        const rbPointsVal = isRiftbound ? (document.getElementById('s-rb-points-sel')?.value || 'none') : 'none';
        const hand        = document.getElementById('s-hand-sel').value;
        const format      = document.getElementById('s-format-sel').value;
        const c1          = document.getElementById('s-col')?.value || '#ffffff';

        const drawFn = (img) => {
            APP.s_cachedLayoutImg = img;
            window.drawLayoutCanvasCore(lCanvas.getContext('2d'), img, lCanvas, c1, 'solid', false, isRiftbound, rbPointsVal, hand, format);
        };

        // Points Only: empty URL — draw with null so only the points strip renders
        if (APP.s_activeLayoutUrl === '') { drawFn(null); return; }

        if (APP.s_cachedLayoutImg && APP.s_activeLayoutUrl === lCanvas.dataset.lastUrl) {
            drawFn(APP.s_cachedLayoutImg);
        } else {
            // Use fabric.Image.fromURL so ibb.co CORS headers are handled correctly
            fabric.Image.fromURL(APP.s_activeLayoutUrl, (fabricImg, isError) => {
                if (isError) { console.error('Failed to load simple layout image:', APP.s_activeLayoutUrl); return; }
                const img = fabricImg.getElement();
                lCanvas.dataset.lastUrl = APP.s_activeLayoutUrl;
                drawFn(img);
            }, { crossOrigin: 'anonymous' });
        }
    };

    // --- SIMPLE EDITOR SELECTION HANDLER ---
    window.handleSimpleSelection = function(e) {
        // Simple editor has no text tools panel — nothing to sync
    };
