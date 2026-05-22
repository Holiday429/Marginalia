/* ==========================================================================
   Marginalia · Reading Map view
   Globe projection (geoOrthographic) — spin in any direction, click to highlight.
   ========================================================================== */

import { logError } from '../services/analytics.ts';
import { BooksStore } from '../store/books-store.ts';
import { renderUnifiedPanelHeader, renderToolPageShell } from '../core/app.js';
import { loadProfile, prefetchProfiles, getCachedProfile, buildFallbackProfile } from './geo-profiles.js';

let __mapChart       = null;
let __mapBooted      = false;
let __mapWorldSeries = null;
let __mapChinaSeries = null;
let __mapInChina     = false;
let __mapFocusedCountryId = null;
let __mapActivePoly  = null;
let __mapRoot        = null;
let __mapGoWorldFn   = null;
let __mapPanelState  = null;
let __mapHoverCountryId = null;
let __mapPointer    = { x: 0, y: 0 };
let __mapGeoMode    = 'all';

/* ── Book data ──────────────────────────────────────────────────────────── */
// MAP_BOOKS static array removed — map now reads from BooksStore reactively.

const MAP_MODE_META = {
  authorOrigin: {
    label: 'Author Origin',
    short: 'Author',
    empty: 'No author-origin books in this region yet.',
  },
  contentLocation: {
    label: 'Content Location',
    short: 'Content',
    empty: 'No content-location books in this region yet.',
  },
  readerLocation: {
    label: 'Reader Anchor',
    short: 'Reader',
    empty: 'No reader-anchor books in this region yet.',
  }
};

const MAP_TAB_META = [
  { id: 'books',    label: 'Books' },
  { id: 'culture',  label: 'Culture' },
  { id: 'history',  label: 'History' },
  { id: 'keywords', label: 'Keywords' },
  { id: 'starter',  label: 'Starter' },
];

function deriveMapGeo(book) {
  // Prefer the book's own geo block (set by new-entry or AI), then fall back
  // to location.country if only the simple field is present.
  const bookGeo = book.geo || {};
  const loc = book.location?.country || book.loc || null;
  const province = book.location?.province || book.province || null;
  const city = book.location?.city || book.city || null;

  return {
    authorOrigin: bookGeo.authorOrigin || (loc ? { country: loc, province, city } : null),
    contentLocation: bookGeo.contentLocation || (loc ? { country: loc, province, city } : null),
    readerLocation: bookGeo.readerLocation || null,
  };
}

function buildMapLibrary(books) {
  return books.map(book => ({
    id:         book.id,
    title:      book.title ?? book.meta?.title ?? String(book.id),
    author:     book.author ?? book.meta?.author ?? '',
    bg:         book.spine ?? book.cover?.bg ?? '#3a3a3a',
    text:       book.text ?? book.cover?.text ?? '#e8dfc8',
    coverImage: book.cover?.image ?? null,
    tags:       book.tags ?? [],
    year:       book.year ?? null,
    loc:        book.location?.country ?? book.loc ?? null,
    province:   book.location?.province ?? book.province ?? null,
    city:       book.location?.city ?? book.city ?? null,
    geo:        deriveMapGeo(book),
  }));
}

function buildGeoBuckets(books) {
  const buckets = {
    authorOrigin: { countries: {}, provinces: {} },
    contentLocation: { countries: {}, provinces: {} },
    readerLocation: { countries: {}, provinces: {} },
    allCountries: new Set(),
  };

  books.forEach(book => {
    Object.keys(MAP_MODE_META).forEach(mode => {
      const geo = book.geo?.[mode];
      if (!geo?.country) return;
      (buckets[mode].countries[geo.country] = buckets[mode].countries[geo.country] || []).push(book);
      buckets.allCountries.add(geo.country);
      if (geo.province) {
        (buckets[mode].provinces[geo.province] = buckets[mode].provinces[geo.province] || []).push(book);
      }
    });
  });

  return buckets;
}

// Mutable — rebuilt on every BooksStore change.
let MAP_LIBRARY = buildMapLibrary(BooksStore.getAll());
let MAP_GEO = buildGeoBuckets(MAP_LIBRARY);
let setMapGeoMode = null;

function rebuildLibrary() {
  MAP_LIBRARY = buildMapLibrary(BooksStore.getAll());
  MAP_GEO = buildGeoBuckets(MAP_LIBRARY);
}

function activeCountryMap() {
  if (__mapGeoMode === 'all') return mergedCountryMap();
  return MAP_GEO[__mapGeoMode].countries;
}

function activeProvinceMap() {
  if (__mapGeoMode === 'all') return mergedProvinceMap();
  return MAP_GEO[__mapGeoMode].provinces;
}

function activeCountries() {
  return new Set(Object.keys(activeCountryMap()));
}

function activeCountryBooks(countryId) {
  return activeCountryMap()[countryId] || [];
}

function activeProvinceBooks(provinceId) {
  return activeProvinceMap()[provinceId] || [];
}

function allCountryBooks(countryId) {
  const map = new Map();
  Object.keys(MAP_MODE_META).forEach(mode => {
    const list = MAP_GEO[mode].countries[countryId] || [];
    list.forEach(book => map.set(book.id, book));
  });
  return Array.from(map.values());
}

function allProvinceBooks(provinceId) {
  const map = new Map();
  Object.keys(MAP_MODE_META).forEach(mode => {
    const list = MAP_GEO[mode].provinces[provinceId] || [];
    list.forEach(book => map.set(book.id, book));
  });
  return Array.from(map.values());
}

function modeMaxCount(kind = 'country') {
  const scope = kind === 'province' ? activeProvinceMap() : activeCountryMap();
  const counts = Object.values(scope).map(list => list.length);
  return Math.max(1, ...counts, 0);
}

function mergedCountryMap() {
  const merged = {};
  Object.keys(MAP_MODE_META).forEach(mode => {
    Object.entries(MAP_GEO[mode].countries).forEach(([countryId, books]) => {
      const map = (merged[countryId] = merged[countryId] || new Map());
      books.forEach(book => map.set(book.id, book));
    });
  });
  return Object.fromEntries(Object.entries(merged).map(([k, map]) => [k, Array.from(map.values())]));
}

function mergedProvinceMap() {
  const merged = {};
  Object.keys(MAP_MODE_META).forEach(mode => {
    Object.entries(MAP_GEO[mode].provinces).forEach(([provinceId, books]) => {
      const map = (merged[provinceId] = merged[provinceId] || new Map());
      books.forEach(book => map.set(book.id, book));
    });
  });
  return Object.fromEntries(Object.entries(merged).map(([k, map]) => [k, Array.from(map.values())]));
}

/* ── Country colour palette ─────────────────────────────────────────────── */

// Muted vintage palette — 14 distinct hue families kept inside one HSL
// envelope (saturation ~28-40%, lightness ~52-64%) so neighbours stay
// chromatically distinct without any one tone "jumping" against the dark
// background. Hues span warm-yellow → amber → terracotta → red-rose →
// mauve → violet → periwinkle → teal → green → olive → tan → steel-blue →
// pale-sage → coral. Harmony comes from the shared sat/lightness, not from
// reducing the colour count.
const PALETTE = [
  '#d8b878', '#c79a63', '#bf8466', '#b56e72', '#ab7383',
  '#94809f', '#7585a0', '#6c8e93', '#7fa285', '#94a06a',
  '#c2a079', '#8593a3', '#9fb09a', '#c08775',
];

const COUNTRY_COLOR = {
  US:'#eec86f', CA:'#7fae8a', MX:'#c75d68',
  GT:'#a385b5', BZ:'#5f8a96', HN:'#d5944f', SV:'#6f7fa8',
  NI:'#9caa4f', CR:'#d98f7a', PA:'#a385b5',
  CU:'#d5944f', JM:'#6f7fa8', HT:'#c75d68', DO:'#5f8a96',
  CO:'#eec86f', VE:'#a385b5', GY:'#cf7a52', SR:'#5f8a96',
  EC:'#c75d68', PE:'#5f8a96', BR:'#d5944f', BO:'#a385b5',
  PY:'#7fae8a', CL:'#9caa4f', AR:'#6f7fa8', UY:'#cf7a52',
  PT:'#d5944f', ES:'#eec86f', FR:'#5f8a96', GB:'#cf7a52',
  IE:'#9caa4f', NL:'#c75d68', BE:'#a385b5', LU:'#d2a878',
  CH:'#6f7fa8', DE:'#eec86f', AT:'#d98f7a', DK:'#5f8a96',
  SE:'#cf7a52', NO:'#a385b5', FI:'#d2a878',
  IT:'#bf7185', GR:'#d5944f', AL:'#5f8a96', RS:'#eec86f',
  HR:'#a385b5', BA:'#cf7a52', SI:'#7fae8a', ME:'#9caa4f',
  MK:'#c75d68', BG:'#6f7fa8', RO:'#d2a878',
  PL:'#cf7a52', CZ:'#c75d68', SK:'#5f8a96', HU:'#c75d68',
  UA:'#7fae8a', BY:'#d5944f', MD:'#a385b5',
  LT:'#a385b5', LV:'#9caa4f', EE:'#eec86f',
  RU:'#b0c4a6', KZ:'#c75d68', UZ:'#eec86f', TM:'#a385b5',
  KG:'#7fae8a', TJ:'#6f7fa8', AF:'#5f8a96',
  TR:'#eec86f', SY:'#c75d68', LB:'#5f8a96', IL:'#d5944f',
  JO:'#a385b5', IQ:'#7fae8a', IR:'#cf7a52', SA:'#eec86f',
  YE:'#c75d68', OM:'#5f8a96', AE:'#a385b5', QA:'#d5944f',
  KW:'#9caa4f', BH:'#d2a878',
  PK:'#c75d68', IN:'#eec86f', BD:'#a385b5', NP:'#9caa4f',
  LK:'#cf7a52', MM:'#5f8a96', TH:'#c75d68',
  VN:'#eec86f', KH:'#d5944f', LA:'#a385b5', MY:'#6f7fa8',
  SG:'#cf7a52', ID:'#eec86f', PH:'#5f8a96', TL:'#c75d68',
  CN:'#d5944f', MN:'#6f7fa8', KP:'#a385b5', KR:'#c75d68',
  JP:'#5f8a96', TW:'#9caa4f',
  NG:'#eec86f', GH:'#c75d68', CI:'#a385b5', SN:'#d5944f',
  ML:'#5f8a96', BF:'#cf7a52', NE:'#7fae8a', CM:'#9caa4f',
  TD:'#c75d68', SD:'#eec86f', SS:'#a385b5', ET:'#d5944f',
  SO:'#5f8a96', KE:'#c75d68', TZ:'#eec86f', UG:'#d2a878',
  RW:'#cf7a52', BI:'#a385b5', CD:'#6f7fa8', CG:'#eec86f',
  GA:'#c75d68', AO:'#d5944f', ZM:'#a385b5', ZW:'#5f8a96',
  MZ:'#cf7a52', MW:'#eec86f', MG:'#c75d68', ZA:'#9caa4f',
  NA:'#eec86f', BW:'#d5944f', LS:'#c75d68', SZ:'#a385b5',
  MA:'#eec86f', DZ:'#c75d68', TN:'#a385b5', LY:'#d5944f',
  EG:'#5f8a96', MR:'#cf7a52',
  AU:'#eec86f', NZ:'#c75d68', PG:'#a385b5', FJ:'#5f8a96',
};

// Book-holding countries get a lift in lightness within their own hue family
// (not a switch to a louder colour), so they read brighter than dimmed
// neighbours while staying inside the muted envelope above.
const BOOK_COLOR_BOOST = {
  CN:'#e0b478', GB:'#cf977e', FR:'#92b39a', RU:'#aebfa9',
  JP:'#83a3a8', US:'#e6c98a', IN:'#e6c98a', CO:'#e6c98a',
  GR:'#e0b478', NG:'#e6c98a', CZ:'#c98591', PT:'#e0b478',
  IT:'#c79aa6', CL:'#a8b47e',
};
const REGION_NAME_FORMATTER = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const DIMMED_FILL        = '#3a342c';
const HOVER_STROKE       = '#d8b878';
const HOVER_STROKE_WIDTH = 1.5;
const HEAT_MODE_COLORS = {
  authorOrigin: {
    low: '#6e7c8b',
    high: '#aabccf',
  },
  contentLocation: {
    low: '#9a7456',
    high: '#eec86f',
  },
  readerLocation: {
    low: '#6f8076',
    high: '#aabcaf',
  },
};

function countryFill(id) {
  if (__mapGeoMode === 'all') {
    const hasBooks = activeCountryBooks(id).length > 0;
    if (hasBooks && BOOK_COLOR_BOOST[id]) return BOOK_COLOR_BOOST[id];
    return PALETTE[Math.abs(hashStr(id)) % PALETTE.length];
  }
  const count = activeCountryBooks(id).length;
  const max = modeMaxCount('country');
  return heatColorForCount(count, max);
}

function provinceFill(id) {
  if (__mapGeoMode === 'all') {
    const base = PALETTE[Math.abs(hashStr(id)) % PALETTE.length];
    return activeProvinceBooks(id).length ? brighten(base, 8) : base;
  }
  const count = activeProvinceBooks(id).length;
  const max = modeMaxCount('province');
  return heatColorForCount(count, max, 0.7);
}

function heatColorForCount(count, maxCount, minT = 0.42) {
  if (count <= 0) return DIMMED_FILL;
  const scale = Math.max(0, Math.min(1, count / Math.max(1, maxCount)));
  const tone = minT + (1 - minT) * Math.pow(scale, 0.75);
  const palette = HEAT_MODE_COLORS[__mapGeoMode] || HEAT_MODE_COLORS.contentLocation;
  return mixHexColor(palette.low, palette.high, tone);
}

function mixHexColor(fromHex, toHex, t) {
  const a = hexToRgb(fromHex);
  const b = hexToRgb(toHex);
  const mix = (x, y) => Math.round(x + (y - x) * t);
  return rgbToHex(mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b));
}

function hexToRgb(hex) {
  const s = hex.replace('#', '');
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function mapTopPadding(forChina = false) {
  const isMobile = window.innerWidth <= 980;
  if (forChina) return isMobile ? 12 : 8;
  return isMobile ? 18 : 10;
}

function mapBottomPadding(forChina = false) {
  const isMobile = window.innerWidth <= 980;
  if (forChina) return isMobile ? 18 : 14;
  return isMobile ? 24 : 18;
}

function applyMapTopPadding(forChina = __mapInChina) {
  if (!__mapChart) return;
  __mapChart.set('paddingTop', mapTopPadding(forChina));
  __mapChart.set('paddingBottom', mapBottomPadding(forChina));
}

function setMapInteractionMode(mode = 'world') {
  if (!__mapChart) return;
  if (mode === 'world') {
    __mapChart.setAll({
      panX: 'rotateX',
      panY: 'translateY',
    });
    return;
  }
  __mapChart.setAll({
    panX: 'translateX',
    panY: 'translateY',
  });
}

/* ── Lifecycle ─────────────────────────────────────────────────────────── */

function initMap() {
  document.getElementById('panel-map').innerHTML = mapShellHTML();
  bindMapShellEvents();

  // Pre-warm profiles for the most-clicked countries.
  prefetchProfiles(['CN', 'US', 'RU']);

  window.addEventListener('marginalia:books-changed', () => {
    rebuildLibrary();
    updateSubheaderCounts();
    renderMapStats();
    if (__mapBooted) {
      repaintWorldFills();
      repaintChinaFills();
    }
  });
}

// Set when the map is entered via the 3D-room globe transition, so the first
// boot reveals continents one batch at a time instead of all at once.
let __mapStagedEntry = false;

function enterMap(params = {}) {
  // Run the continent-by-continent reveal whenever the map is entered via the
  // room globe transition — regardless of whether the chart was already booted
  // on a prior visit. (The globe fly-in is the cue; the reveal replays the map.)
  const fromGlobe = params?.__roomTransition?.source === 'room';

  mountGlobeWidget();

  if (!__mapBooted) {
    __mapStagedEntry = fromGlobe;   // stage on first paint via datavalidated
    if (typeof am5 === 'undefined' || typeof am5map === 'undefined') {
      waitForAmCharts(bootMap);
    } else {
      bootMap();
    }
    return;
  }

  // Already booted: replay the staged reveal on the live series.
  if (fromGlobe && __mapWorldSeries) {
    runContinentStagger(__mapWorldSeries);
  }
}

let __mapGlobeMounted = false;
// Lazy-load the decorative globe so Three.js never blocks the map's first
// paint. Skipped on small screens (no room for it) and if WebGL is unusable.
function mountGlobeWidget() {
  if (__mapGlobeMounted) return;
  if (window.innerWidth <= 980) return;
  const container = document.getElementById('mapGlobe');
  if (!container) return;
  __mapGlobeMounted = true;
  import('./map-globe.js')
    .then(({ mountMapGlobe }) => mountMapGlobe(container))
    .catch(err => {
      __mapGlobeMounted = false;
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'map globe import' });
    });
}

function waitForAmCharts(cb, attempt = 0) {
  if (typeof am5 !== 'undefined' && typeof am5map !== 'undefined' &&
      typeof am5geodata_worldLow !== 'undefined' &&
      typeof am5geodata_chinaHigh !== 'undefined') {
    cb(); return;
  }
  if (attempt > 100) { logError(new Error('[map] amCharts failed to load'), { context: 'map init' }); return; }
  setTimeout(() => waitForAmCharts(cb, attempt + 1), 80);
}

/* ── DOM scaffold ──────────────────────────────────────────────────────── */

function mapShellHTML() {
  const located   = MAP_LIBRARY.filter(b => b.loc).length;
  const unlocated = MAP_LIBRARY.filter(b => !b.loc).length;
  const countries = activeCountries().size;
  const sharedHeader = renderUnifiedPanelHeader('map');
  const content = `
    ${sharedHeader}

    <div class="map-subheader">
      <div class="map-geo-filters" id="mapGeoFilters"></div>
      <div class="map-header-right">
        <div class="map-chip"><strong id="mapBooksCount">${located}</strong> books mapped</div>
        <div class="map-chip"><strong id="mapCountriesCount">${countries}</strong> countries</div>
        <div class="map-chip map-chip--dim" id="mapUnlocatedBadge" ${unlocated === 0 ? 'hidden' : ''}>${unlocated} book${unlocated === 1 ? '' : 's'} not yet located</div>
      </div>
      <div class="map-breadcrumb" id="mapBreadcrumb" hidden></div>
    </div>

    <div class="map-stage">
      <div id="mapChart"></div>

      <!-- World-view stats sidebar (hidden once a country is focused) -->
      <aside class="map-stats" id="mapStats"></aside>

      <!-- Decorative globe — same model as the 3D room's Map entry object -->
      <div class="map-globe" id="mapGlobe" aria-hidden="true"></div>

      <div class="map-zoom">
        <div class="map-zoom-btn" id="mapZoomIn">+</div>
        <div class="map-zoom-btn" id="mapZoomOut">−</div>
        <div class="map-zoom-sep"></div>
        <div class="map-zoom-btn map-zoom-fit" id="mapZoomHome">Fit</div>
      </div>

      <div class="map-hint" id="mapHint">Hover for a hint · click to open regional context</div>

      <!-- Hover tooltip -->
      <div class="map-tooltip" id="mapTooltip">
        <span class="map-tooltip-name" id="mapTooltipName"></span>
        <span class="map-tooltip-count" id="mapTooltipCount"></span>
      </div>

      <div class="map-hover-stage" id="mapHoverStage"></div>

      <!-- Side panel -->
      <div class="map-panel" id="mapPanel">
        <div class="map-panel-hero" id="mapPanelHero" hidden></div>
        <div class="map-panel-head">
          <div class="map-panel-place" id="mapPanelPlace">—</div>
          <div class="map-panel-sub" id="mapPanelSub">—</div>
          <div class="map-panel-close" id="mapPanelClose">×</div>
        </div>
        <div class="map-panel-tabs" id="mapPanelTabs"></div>
        <div class="map-panel-body" id="mapPanelBody"></div>
      </div>
    </div>
  `;
  return renderToolPageShell('map', `<div class="map-page">${content}</div>`);
}

function bindMapShellEvents() {
  document.getElementById('mapPanelClose').addEventListener('click', closePanel);
  renderGlobalGeoFilters();
  renderMapStats();
  const worldBtn = document.getElementById('mapWorldBtn');
  if (worldBtn) {
    worldBtn.addEventListener('click', (event) => {
      event.preventDefault();
      setGeoMode('all');
      if (typeof __mapGoWorldFn === 'function') {
        __mapGoWorldFn();
        return;
      }
      if (__mapChart) __mapChart.goHome();
      closePanel();
      resetWorldFills(__mapWorldSeries);
    });
  }

  const tooltip = document.getElementById('mapTooltip');
  document.addEventListener('mousemove', e => {
    __mapPointer = { x: e.clientX, y: e.clientY };
    const tw = 220, th = 44;
    let lx = e.clientX + 16;
    let ly = e.clientY - 12;
    if (lx + tw > window.innerWidth)  lx = e.clientX - tw - 8;
    if (ly + th > window.innerHeight) ly = e.clientY - th - 8;
    tooltip.style.left = lx + 'px';
    tooltip.style.top  = ly + 'px';
  });
}

function renderGlobalGeoFilters() {
  const wrap = document.getElementById('mapGeoFilters');
  if (!wrap) return;
  wrap.innerHTML = '';
  Object.entries(MAP_MODE_META).forEach(([mode, meta]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-geo-btn' + (mode === __mapGeoMode ? ' active' : '');
    button.textContent = meta.label;
    button.addEventListener('click', () => setGeoMode(mode === __mapGeoMode ? 'all' : mode));
    wrap.appendChild(button);
  });
}

function updateSubheaderCounts() {
  const countriesEl = document.getElementById('mapCountriesCount');
  if (countriesEl) countriesEl.textContent = String(activeCountries().size);
  const booksEl = document.getElementById('mapBooksCount');
  if (booksEl) booksEl.textContent = String(MAP_LIBRARY.filter(b => b.loc).length);
  const unlocated = MAP_LIBRARY.filter(b => !b.loc).length;
  const badgeEl = document.getElementById('mapUnlocatedBadge');
  if (badgeEl) {
    badgeEl.textContent = unlocated > 0 ? `${unlocated} book${unlocated === 1 ? '' : 's'} not yet located` : '';
    badgeEl.hidden = unlocated === 0;
  }
}

/* ── Continent-by-continent staged reveal (globe entry) ─────────────────── */

// Reveal order: Eurasia → North America → South America → Africa → Oceania →
// everything else. Each is one solid block that flies in from its own corner.
const CONTINENT_ORDER = ['Eurasia', 'NorthAmerica', 'SouthAmerica', 'Africa', 'Oceania', 'Other'];

// Complete ISO-3166-1 alpha-2 → reveal-block lookup. Eurasia merges Asia +
// Europe into one mass; the Americas split into north and south so they can
// enter from different corners. Built from per-block code lists so every
// country lands in a real batch.
const CONTINENT_OF = (() => {
  const lists = {
    Eurasia: 'AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE '
      + 'AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA',
    NorthAmerica: 'AG AW BS BB BZ CA KY CR CU DM DO SV GL GD GP GT HT HN JM MQ MX NI PA PR BL KN LC PM VC TT TC US VG VI',
    SouthAmerica: 'AR BO BR CL CO EC GY PY PE SR UY VE',
    Africa: 'DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW',
    Oceania: 'AU NZ PG FJ NC SB VU PF GU',
    Other: 'AS CK KI MH FM NR NU MP PW PN WS TK TO TV WF',
  };
  const out = {};
  for (const [block, codes] of Object.entries(lists)) {
    for (const code of codes.split(/\s+/)) if (code) out[code] = block;
  }
  return out;
})();

// amCharts geodata sometimes carries a continent code in feature properties;
// use it as a coarse fallback for any id not in the explicit lookup.
const CONTINENT_CODE_MAP = {
  AS: 'Eurasia', EU: 'Eurasia',
  NA: 'NorthAmerica', SA: 'SouthAmerica',
  AF: 'Africa', OC: 'Oceania', AN: 'Other',
};

function continentOfPolygon(poly) {
  const id = poly?.dataItem?.get?.('id');
  if (id && CONTINENT_OF[id]) return CONTINENT_OF[id];
  const ctx = poly?.dataItem?.dataContext;
  const code = ctx?.continent_code || ctx?.properties?.continent_code;
  if (code && CONTINENT_CODE_MAP[code]) return CONTINENT_CODE_MAP[code];
  return 'Other';
}

// Per-block slide-in direction (pixel offset the batch starts displaced by,
// then animates to zero). Same direction + timing for every country in a block,
// so the whole mass reads as one solid plate flying in from off-screen.
const CONTINENT_SLIDE = {
  Eurasia:      { dx:  420, dy: -300 },  // in from the top-right
  NorthAmerica: { dx: -440, dy: -280 },  // in from the top-left
  SouthAmerica: { dx: -380, dy:  300 },  // in from the bottom-left
  Africa:       { dx:    0, dy:  420 },  // in from below
  Oceania:      { dx:  420, dy:  280 },  // in from the bottom-right
  Other:        { dx:  220, dy:  180 },  // in from bottom-right (fill-in)
};

// Build the ISO-code list per continent block (for temp-series `include`).
function continentCodeLists() {
  const byBlock = Object.fromEntries(CONTINENT_ORDER.map(c => [c, []]));
  for (const [code, block] of Object.entries(CONTINENT_OF)) {
    if (byBlock[block]) byBlock[block].push(code);
  }
  return byBlock;
}

let __mapStaggerTemp = [];   // temp overlay series, torn down after the fly-in

// Reveal the map by flying each continent in as a SOLID BLOCK from its own
// off-screen direction, settling into place. This uses throwaway per-continent
// overlay series (animated at the series level via dx/dy) purely for the
// entrance; the real worldSeries — with all its per-country hover/click/fill
// logic — is hidden during the flight and shown intact at the end. So nothing
// about normal interaction changes; only the entrance is grouped by continent.
function runContinentStagger(worldSeries) {
  const chart = __mapChart;
  const root = __mapRoot;
  if (!chart || !root || !worldSeries) return;

  document.body.classList.add('map-staged-entering');

  // Hide the real map; the temp blocks stand in during the entrance.
  worldSeries.hide(0);

  const codeLists = continentCodeLists();
  const LEAD_IN = 700;       // let the globe settle in the corner first
  const STEP_MS = 440;       // gap between blocks
  const SLIDE_MS = 760;      // slide + fade duration per block

  // Clean up any temp series from a prior run.
  teardownStaggerTemp();

  let lastEnd = LEAD_IN;
  CONTINENT_ORDER.forEach((continent, batchIndex) => {
    const codes = codeLists[continent];
    if (!codes || !codes.length) return;
    const slide = CONTINENT_SLIDE[continent] || CONTINENT_SLIDE.Other;

    // Temp, non-interactive series holding just this continent's countries.
    const temp = chart.series.push(am5map.MapPolygonSeries.new(root, {
      geoJSON: am5geodata_worldLow,
      include: codes,
    }));
    temp.set('interactive', false);
    temp.mapPolygons.template.setAll({
      interactive: false,
      stroke: am5.color('#6a5443'),
      strokeWidth: 0.65,
      nonScalingStroke: true,
    });
    // Start displaced off-screen and transparent; paint to match the real map.
    temp.setAll({ dx: slide.dx, dy: slide.dy, opacity: 0 });
    temp.events.on('datavalidated', () => {
      temp.mapPolygons.each(poly => {
        poly.set('fill', am5.color(countryFill(poly.dataItem.get('id'))));
      });
    });
    __mapStaggerTemp.push(temp);

    const at = LEAD_IN + batchIndex * STEP_MS;
    lastEnd = Math.max(lastEnd, at + SLIDE_MS);
    setTimeout(() => {
      temp.animate({ key: 'dx', to: 0, duration: SLIDE_MS, easing: am5.ease.out(am5.ease.cubic) });
      temp.animate({ key: 'dy', to: 0, duration: SLIDE_MS, easing: am5.ease.out(am5.ease.cubic) });
      temp.animate({ key: 'opacity', to: 1, duration: SLIDE_MS * 0.6, easing: am5.ease.out(am5.ease.cubic) });
    }, at);
  });

  // Hand off to the real map, tear down the temp blocks, reveal the UI.
  setTimeout(() => {
    worldSeries.show(0);
    teardownStaggerTemp();
    document.body.classList.remove('map-staged-entering');
  }, lastEnd + 120);
}

function teardownStaggerTemp() {
  __mapStaggerTemp.forEach(s => { try { s.dispose(); } catch {} });
  __mapStaggerTemp = [];
}

/* ── World-view stats sidebar ──────────────────────────────────────────── */

// Compact region map for the Insight line. Synchronous (does not depend on
// loaded profiles, which only cover a subset). Unmapped codes fall back to
// the country's own name so the line never breaks.
const COUNTRY_REGION = {
  US:'North America', CA:'North America', MX:'North America',
  CO:'Latin America', BR:'Latin America', AR:'Latin America', CL:'Latin America', PE:'Latin America',
  GB:'Western Europe', FR:'Western Europe', DE:'Western Europe', NL:'Western Europe', BE:'Western Europe', AT:'Western Europe', CH:'Western Europe', IE:'Western Europe',
  IT:'Southern Europe', ES:'Southern Europe', PT:'Southern Europe', GR:'Southern Europe',
  SE:'Northern Europe', NO:'Northern Europe', DK:'Northern Europe', FI:'Northern Europe', IS:'Northern Europe',
  PL:'Eastern Europe', CZ:'Eastern Europe', HU:'Eastern Europe', RO:'Eastern Europe', RU:'Eastern Europe', UA:'Eastern Europe',
  CN:'East Asia', JP:'East Asia', KR:'East Asia', TW:'East Asia',
  IN:'South Asia', PK:'South Asia', BD:'South Asia', LK:'South Asia',
  TR:'Middle East', IR:'Middle East', SA:'Middle East', IL:'Middle East', IQ:'Middle East',
  EG:'Africa', NG:'Africa', ZA:'Africa', KE:'Africa', MA:'Africa', ET:'Africa',
  AU:'Oceania', NZ:'Oceania',
};

function regionForCountry(id) {
  return COUNTRY_REGION[id] || countryLabelFromId(id);
}

// ISO-3166 alpha-2 → regional-indicator emoji flag. No asset needed; works
// for any valid two-letter code. Returns '' for non-country ids (e.g. CN-11).
function flagEmoji(id) {
  if (!/^[A-Za-z]{2}$/.test(id)) return '';
  const base = 0x1f1e6;
  const cc = id.toUpperCase();
  return String.fromCodePoint(
    base + cc.charCodeAt(0) - 65,
    base + cc.charCodeAt(1) - 65
  );
}

// Best-available recency signal on a book record. Falls back through the
// common timestamp shapes, then to year, so ordering degrades gracefully.
function bookRecency(book) {
  const raw = book.addedAt ?? book.createdAt ?? book.updatedAt ?? book.finishedAt
    ?? book.meta?.addedAt ?? book.meta?.createdAt ?? null;
  if (raw != null) {
    const t = typeof raw === 'number' ? raw : Date.parse(raw);
    if (Number.isFinite(t)) return t;
  }
  return Number.isFinite(book.year) ? book.year : 0;
}

// Derive everything the sidebar needs from the active buckets — no new data.
function buildMapStats() {
  const countryMap = activeCountryMap();
  const ranked = Object.entries(countryMap)
    .map(([id, books]) => ({ id, name: countryLabelFromId(id), count: books.length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const top = ranked.slice(0, 5);
  const maxCount = top[0]?.count || 1;

  // Aggregate books-per-region to derive the reading-preference insight.
  const regionTotals = {};
  ranked.forEach(({ id, count }) => {
    const r = regionForCountry(id);
    regionTotals[r] = (regionTotals[r] || 0) + count;
  });
  const topRegions = Object.entries(regionTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([r]) => r);

  // Recent exploration: per country, keep the most-recent book's timestamp
  // and the country's book count; order countries by that timestamp desc.
  const recentByCountry = {};
  Object.entries(countryMap).forEach(([id, books]) => {
    if (!books.length) return;
    const newest = Math.max(...books.map(bookRecency));
    recentByCountry[id] = { id, count: books.length, recency: newest };
  });
  const recent = Object.values(recentByCountry)
    .sort((a, b) => b.recency - a.recency)
    .slice(0, 3)
    .map(c => ({
      id: c.id,
      name: countryLabelFromId(c.id),
      flag: flagEmoji(c.id),
      count: c.count,
      label: c.recency > 100000 ? formatRecencyDate(c.recency) : (c.recency ? String(c.recency) : ''),
    }));

  return {
    countries: ranked.length,
    books: MAP_LIBRARY.filter(b => b.loc).length,
    top,
    maxCount,
    topRegions,
    recent,
  };
}

// Compact YYYY.MM label from an epoch-ms timestamp.
function formatRecencyDate(t) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function renderMapStats() {
  const el = document.getElementById('mapStats');
  if (!el) return;

  const stats = buildMapStats();
  const modeLabel = __mapGeoMode === 'all'
    ? 'All locations'
    : (MAP_MODE_META[__mapGeoMode]?.label || 'All locations');

  if (!stats.books) {
    el.innerHTML = `
      <section class="map-stats-card">
        <div class="map-stats-kicker">Reading footprint</div>
        <p class="map-stats-empty">No located books yet. Add a book with a place to start your map.</p>
      </section>`;
    return;
  }

  const topRows = stats.top.map(c => `
    <li class="map-stats-row">
      <span class="map-stats-row-main">
        <span class="map-stats-row-name">${escapeHTML(c.name)}</span>
        <span class="map-stats-bar"><span class="map-stats-bar-fill" style="width:${Math.round((c.count / stats.maxCount) * 100)}%"></span></span>
      </span>
      <span class="map-stats-row-count">${c.count}</span>
    </li>`).join('');

  const insight = stats.topRegions.length
    ? `You read most from <strong>${escapeHTML(stats.topRegions.join(' & '))}</strong>.`
    : 'Your reading map is just beginning.';

  const recentCard = stats.recent.length ? `
    <section class="map-stats-card">
      <div class="map-stats-kicker">Recent exploration</div>
      <ul class="map-stats-recent">
        ${stats.recent.map(c => `
          <li class="map-stats-recent-row">
            <span class="map-stats-recent-flag">${c.flag || '·'}</span>
            <span class="map-stats-recent-name">${escapeHTML(c.name)}</span>
            <span class="map-stats-recent-meta">${c.count} book${c.count === 1 ? '' : 's'}${c.label ? ` · ${escapeHTML(c.label)}` : ''}</span>
          </li>`).join('')}
      </ul>
    </section>` : '';

  el.innerHTML = `
    <section class="map-stats-card map-stats-footprint">
      <div class="map-stats-kicker">Reading footprint</div>
      <div class="map-stats-figures">
        <div class="map-stats-figure"><strong>${stats.countries}</strong><span>countries</span></div>
        <div class="map-stats-figure"><strong>${stats.books}</strong><span>books mapped</span></div>
      </div>
    </section>
    <section class="map-stats-card">
      <div class="map-stats-kicker">Top countries · ${escapeHTML(modeLabel.toLowerCase())}</div>
      <ol class="map-stats-list">${topRows}</ol>
    </section>
    ${recentCard}
    <section class="map-stats-card">
      <div class="map-stats-kicker">Reading insight</div>
      <p class="map-stats-insight">${insight}</p>
    </section>`;
}

// Toggle world-view-only visibility. Hidden whenever a country/province is
// focused (detail panel takes over), shown again on return to world.
function setStatsVisible(visible) {
  document.body.classList.toggle('map-stats-hidden', !visible);
  if (visible) renderMapStats();
}

/* ── amCharts boot ─────────────────────────────────────────────────────── */

function bootMap() {
  __mapBooted = true;

  const root = am5.Root.new('mapChart');
  __mapRoot  = root;
  root.setThemes([am5themes_Animated.new(root)]);
  if (root._logo) root._logo.dispose();

  const chart = root.container.children.push(
    am5map.MapChart.new(root, {
      panX:       'rotateX',
      panY:       'translateY',
      projection: am5map.geoNaturalEarth1(),
      wheelY:     'zoom',
      pinchZoom:  true,
      zoomStep:   1.06,
    })
  );
  __mapChart = chart;

  /* ── World polygon series ── */
  const worldSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {
    geoJSON: am5geodata_worldLow,
    exclude: ['AQ'],
  }));
  __mapWorldSeries = worldSeries;

  worldSeries.mapPolygons.template.setAll({
    interactive:     true,
    cursorOverStyle: 'pointer',       // pointer for ALL countries
    fill:            am5.color('#2a2f3a'),
    fillOpacity:     1,
    stroke:          am5.color('#6a5443'),
    strokeWidth:     0.65,
    nonScalingStroke:true,
    tooltipText:     '{name}',        // use amCharts native name lookup
  });

  /* Suppress the amCharts tooltip visually — we render our own */
  const hiddenTooltip = am5.Tooltip.new(root, { forceHidden: true });
  worldSeries.mapPolygons.template.set('tooltip', hiddenTooltip);

  worldSeries.mapPolygons.template.states.create('hover', {
    stroke:      am5.color(HOVER_STROKE),
    strokeWidth: HOVER_STROKE_WIDTH,
  });

  /* Paint each country. On a staged (globe-transition) entry, reveal the map
     continent-by-continent instead of all at once. */
  worldSeries.events.on('datavalidated', () => {
    repaintWorldFills(worldSeries);
    if (__mapStagedEntry) {
      __mapStagedEntry = false;
      runContinentStagger(worldSeries);
    }
  });

  /* Tooltip — show name on any country, book count if available */
  const tooltip  = document.getElementById('mapTooltip');
  const tipName  = document.getElementById('mapTooltipName');
  const tipCount = document.getElementById('mapTooltipCount');

  worldSeries.mapPolygons.template.events.on('pointerover', ev => {
    const id    = ev.target.dataItem.get('id');
    const name  = getPolyName(ev.target);
    const count = activeCountryBooks(id).length;
    if (!__mapFocusedCountryId && !__mapInChina) {
      tooltip.classList.remove('visible');
      showHoverPreview(id, name, ev.target);
      return;
    }
    tipName.textContent  = name;
    tipCount.textContent = count > 0 ? `· ${count} book${count !== 1 ? 's' : ''}` : '';
    tooltip.classList.add('visible');
  });
  worldSeries.mapPolygons.template.events.on('pointerout', () => {
    tooltip.classList.remove('visible');
    if (!__mapFocusedCountryId && !__mapInChina) clearHoverPreview();
  });

  /* Click */
  worldSeries.mapPolygons.template.events.on('click', ev => {
    const id   = ev.target.dataItem.get('id');
    const name = getPolyName(ev.target);
    tooltip.classList.remove('visible');
    document.getElementById('mapHint').classList.remove('show');

    if (id === 'CN') { drillChina(); return; }

    clearHoverPreview();
    focusCountry(ev.target, id, name);

    dimAllExcept(worldSeries, ev.target, id);
    openCountryPanel(id, name);
  });

  /* ── China province series ── */
  const chinaSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {
    geoJSON: am5geodata_chinaHigh,
    visible: false,
  }));
  __mapChinaSeries = chinaSeries;

  chinaSeries.mapPolygons.template.setAll({
    interactive:     true,
    cursorOverStyle: 'pointer',
    fill:            am5.color('#3d3220'),
    fillOpacity:     1,
    stroke:          am5.color('#6a5443'),
    strokeWidth:     0.65,
    nonScalingStroke:true,
    tooltipText:     '{name}',
  });
  chinaSeries.mapPolygons.template.set('tooltip', am5.Tooltip.new(root, { forceHidden: true }));
  chinaSeries.mapPolygons.template.states.create('hover', {
    stroke:      am5.color(HOVER_STROKE),
    strokeWidth: HOVER_STROKE_WIDTH,
  });

  chinaSeries.events.on('datavalidated', () => {
    repaintChinaFills(chinaSeries);
  });

  chinaSeries.mapPolygons.template.events.on('pointerover', ev => {
    const id    = ev.target.dataItem.get('id');
    const name  = getPolyName(ev.target);
    const count = activeProvinceBooks(id).length;
    if (__mapGeoMode === 'all') {
      tipName.textContent  = name;
      tipCount.textContent = count > 0 ? `· ${count} book${count !== 1 ? 's' : ''}` : '';
      tooltip.classList.add('visible');
      return;
    }
    tooltip.classList.remove('visible');
    if (!count) {
      clearHoverPreview();
      return;
    }
    showHoverTitleCloud(activeProvinceBooks(id), ev.target, {
      emptyText: '',
      max: 8,
      className: 'map-hover-title map-hover-title-heat',
      radiusBase: 148,
      radiusStep: 20,
      width: 198,
      height: 30,
    });
  });
  chinaSeries.mapPolygons.template.events.on('pointerout', () => {
    tooltip.classList.remove('visible');
    if (__mapGeoMode !== 'all') clearHoverPreview();
  });

  chinaSeries.mapPolygons.template.events.on('click', ev => {
    const id   = ev.target.dataItem.get('id');
    const name = getPolyName(ev.target);
    tooltip.classList.remove('visible');

    /* Dim all other provinces */
    chinaSeries.mapPolygons.each(p => {
      const pid = p.dataItem.get('id');
      const base = provinceFill(pid);
      p.set('fill', am5.color(
        p === ev.target
          ? brighten(base, 8)
          : DIMMED_FILL
      ));
    });

    const books = allProvinceBooks(id);
    openProvincePanel(id, name, books);
  });

  /* ── Drill / back ── */

  /* After the panel slides in (450ms), re-zoom to fit China in the narrowed
     chart area. zoomToGeoPoint level 5 fills ~66% of the viewport well.
     A second pass at 900ms catches any remaining resize lag. */
  function fitChina() {
    const doZoom = () => {
      applyMapTopPadding(true);
      chart.zoomToGeoPoint({ longitude: 104, latitude: 35.5 }, 4.5, true);
    };
    setTimeout(doZoom, 500);
  }

  function resetWorldHome() {
    applyMapTopPadding(false);
    setMapInteractionMode('world');
    const doHome = () => chart.goHome();
    setTimeout(doHome, 20);
    setTimeout(doHome, 200);
    setTimeout(doHome, 520);
  }

  function fitCountry(poly) {
    const di = poly?.dataItem;
    if (!di) return;
    const doZoom = () => worldSeries.zoomToDataItem(di);
    setTimeout(doZoom, 120);
    setTimeout(doZoom, 620);
  }

  function focusCountry(poly, id, name) {
    __mapInChina = false;
    __mapFocusedCountryId = id;
    chinaSeries.hide();
    worldSeries.show();
    setMapInteractionMode('detail');
    applyMapTopPadding(false);
    setBreadcrumb('country', name, goWorld);
    setStatsVisible(false);
    fitCountry(poly);
  }

  function drillChina() {
    if (__mapInChina) return;
    clearHoverPreview();
    __mapInChina = true;
    __mapFocusedCountryId = 'CN';
    worldSeries.hide();
    chinaSeries.show();
    setMapInteractionMode('detail');
    setBreadcrumb('china', 'China', goWorld);
    setStatsVisible(false);
    openCountryPanel('CN', 'China');
    fitChina();
  }

  function goWorld() {
    __mapInChina = false;
    __mapFocusedCountryId = null;
    clearHoverPreview();
    chinaSeries.hide();
    worldSeries.show();
    setBreadcrumb('world', 'World', null);
    dismissPanel();
    setStatsVisible(true);
    resetWorldFills(worldSeries);
    resetWorldHome();
  }
  __mapGoWorldFn = goWorld;

  setMapGeoMode = (mode) => {
    __mapGeoMode = mode;
    renderGlobalGeoFilters();
    updateSubheaderCounts();
    renderMapStats();
    repaintWorldFills(worldSeries);
    repaintChinaFills(chinaSeries);
    if (__mapFocusedCountryId && __mapActivePoly && !__mapInChina) {
      dimAllExcept(worldSeries, __mapActivePoly, __mapFocusedCountryId);
    }
    if (__mapPanelState?.type === 'country') {
      openCountryPanel(__mapPanelState.countryId, __mapPanelState.placeLabel);
    }
    if (__mapPanelState?.type === 'province') {
      openProvincePanel(__mapPanelState.provinceId, __mapPanelState.placeLabel);
    }
    clearHoverPreview();
  };

  document.getElementById('mapZoomIn').addEventListener('click',  () => chart.zoomIn());
  document.getElementById('mapZoomOut').addEventListener('click', () => chart.zoomOut());
  document.getElementById('mapZoomHome').addEventListener('click', () => {
    if (__mapInChina) {
      fitChina();
    } else if (__mapFocusedCountryId) {
      goWorld();
    } else {
      resetWorldHome();
      closePanel();
      resetWorldFills(worldSeries);
    }
  });

  applyMapTopPadding();
  let mapResizeTimer = null;
  window.addEventListener('resize', () => {
    if (mapResizeTimer) clearTimeout(mapResizeTimer);
    mapResizeTimer = setTimeout(() => {
      applyMapTopPadding();
      if (__mapInChina) fitChina();
    }, 120);
  });

  chart.appear(800, 100);

  const hint = document.getElementById('mapHint');
  setTimeout(() => hint.classList.add('show'),    1800);
  setTimeout(() => hint.classList.remove('show'), 6500);
}

/* ── Fill helpers ───────────────────────────────────────────────────────── */

function dimAllExcept(series, activePoly, activeId) {
  series.mapPolygons.each(poly => {
    const id = poly.dataItem.get('id');
    poly.set('fill', am5.color(
      poly === activePoly
        ? countryFill(id)
        : DIMMED_FILL
    ));
  });
  __mapActivePoly = activePoly;
}

function resetWorldFills(series) {
  repaintWorldFills(series);
  __mapActivePoly = null;
}

function repaintWorldFills(series = __mapWorldSeries) {
  if (!series) return;
  series.mapPolygons.each(poly => {
    const id = poly.dataItem.get('id');
    poly.set('fill', am5.color(countryFill(id)));
  });
}

function repaintChinaFills(series = __mapChinaSeries) {
  if (!series) return;
  series.mapPolygons.each(poly => {
    const id = poly.dataItem.get('id');
    poly.set('fill', am5.color(provinceFill(id)));
  });
}

function setGeoMode(mode) {
  const isValid = mode === 'all' || !!MAP_MODE_META[mode];
  if (!isValid || mode === __mapGeoMode) return;
  if (typeof setMapGeoMode === 'function') {
    setMapGeoMode(mode);
  } else {
    __mapGeoMode = mode;
    renderGlobalGeoFilters();
    updateSubheaderCounts();
  }
}

function clearHoverPreview() {
  __mapHoverCountryId = null;
  __mapHoverPoly = null;
  clearHoverTypewriters();
  const stage = document.getElementById('mapHoverStage');
  if (stage) stage.innerHTML = '';
  if (!__mapFocusedCountryId && !__mapInChina) resetWorldFills(__mapWorldSeries);
}

function showHoverPreview(countryId, countryName, activePoly) {
  __mapHoverCountryId = countryId;
  if (__mapGeoMode === 'all') {
    showHoverCard(countryId, countryName, activePoly);
    return;
  }
  const books = activeCountryBooks(countryId);
  if (!books.length) {
    clearHoverPreview();
    return;
  }
  showHoverTitleCloud(books, activePoly, {
    emptyText: '',
    max: 8,
    className: 'map-hover-title map-hover-title-heat',
    radiusBase: 154,
    radiusStep: 22,
    width: 198,
    height: 30,
  });
}

// Anchor the active polygon so the card can pin to the country itself (not the
// cursor) and stay attached as the map redraws / the profile arrives.
let __mapHoverPoly = null;
let __mapHoverAnchor = { x: 0, y: 0 };

// Typewriter timers, cleared whenever the card is re-rendered or torn down so
// switching countries never leaves a half-typed string from the previous one.
let __hoverTypeTimers = [];
function clearHoverTypewriters() {
  __hoverTypeTimers.forEach(t => clearTimeout(t));
  __hoverTypeTimers = [];
}

// Type `text` into `el` one character at a time. `startDelay` staggers multiple
// fields; `onDone` chains the next field.
function typewriterInto(el, text, { speed = 26, startDelay = 0, onDone } = {}) {
  if (!el) return;
  el.textContent = '';
  el.classList.add('is-typing');
  let i = 0;
  const step = () => {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i += 1;
      __hoverTypeTimers.push(setTimeout(step, speed));
    } else {
      el.classList.remove('is-typing');
      onDone?.();
    }
  };
  __hoverTypeTimers.push(setTimeout(step, startDelay));
}

// Hover card pinned to the hovered country: a framed hero viewport on top, then
// the country name and one line of literary DNA typed out like field notes.
// A single positioned node — no multi-card collision layout. Deep context lives
// in the click panel.
function renderHoverCard(countryId, countryName) {
  const stage = document.getElementById('mapHoverStage');
  if (!stage) return;
  clearHoverTypewriters();

  const teaser = buildHoverTeaser(countryId, countryName);
  const count = activeCountryBooks(countryId).length;
  const countText = count > 0
    ? `${count} book${count === 1 ? '' : 's'} mapped`
    : 'Not in your library yet';

  const thumb = teaser.image
    ? `<div class="map-hover-card-thumb"><img src="${escapeHTML(teaser.image)}" alt="" decoding="async"
         onload="this.closest('.map-hover-card-thumb').classList.add('loaded')"
         onerror="this.closest('.map-hover-card-thumb')?.remove()"></div>`
    : '';

  stage.innerHTML = `
    <div class="map-hover-card${thumb ? ' has-thumb' : ''}" id="mapHoverCard">
      ${thumb}
      <div class="map-hover-card-body">
        <div class="map-hover-card-name" id="mapHoverName"></div>
        <div class="map-hover-card-dna" id="mapHoverDna"></div>
        <div class="map-hover-card-count">${escapeHTML(countText)}</div>
      </div>
    </div>`;

  // Cached images may already be complete before onload binds — reveal them.
  const img = stage.querySelector('.map-hover-card-thumb img');
  if (img && img.complete && img.naturalWidth > 0) {
    img.closest('.map-hover-card-thumb')?.classList.add('loaded');
  }

  // Remember what we rendered so a later profile-arrival re-render can be
  // skipped when nothing actually changed (avoids resetting the loaded image).
  __hoverRendered = { countryId, dna: teaser.dna, image: teaser.image || null };

  // Type the name, then the DNA line.
  const nameEl = document.getElementById('mapHoverName');
  const dnaEl = document.getElementById('mapHoverDna');
  typewriterInto(nameEl, countryName, {
    speed: 34,
    startDelay: 90,
    onDone: () => typewriterInto(dnaEl, teaser.dna, { speed: 16, startDelay: 120 }),
  });

  // The photo's height is reserved up-front, so the card's full size is known
  // here and the flip-above decision is correct immediately. One extra reposition
  // on the next frame covers font/layout settling.
  positionHoverCard();
  requestAnimationFrame(positionHoverCard);
}
let __hoverRendered = null;

// Pin the card tight to the country's geometric centre. Default: just below
// the centre, horizontally centred on it. If the card would be clipped at the
// bottom (country near the page bottom) it flips above; horizontal position is
// clamped on-screen and clear of the open detail panel. Anchoring to the
// polygon (not the cursor) keeps the card visually attached to the land.
function positionHoverCard() {
  const card = document.getElementById('mapHoverCard');
  if (!card) return;

  // Anchor on the cursor position captured at hover. The user is hovering ON the
  // country, so this is a reliable in-country point — and unlike amCharts sprite
  // coords it's always a true screen position, so the flip-above maths is sound.
  const anchor = { x: __mapHoverAnchor.x, y: __mapHoverAnchor.y };

  const cw = card.offsetWidth || 236;
  const ch = card.offsetHeight || 240;
  const bounds = hoverViewportBounds();
  const gap = 8;        // tight to the land
  const overlap = 16;   // let the card sit slightly over the country edge

  // Horizontal: centre on the country, then clamp on-screen.
  let x = anchor.x - cw / 2;
  x = Math.max(bounds.left, Math.min(x, bounds.right - cw));

  // Vertical: prefer just below the centre. If the full card would clip the
  // bottom, flip ABOVE the centre so it always shows complete. Whichever side
  // has more room wins when neither fully fits.
  const below = anchor.y + gap - overlap;
  const above = anchor.y - ch - gap + overlap;
  let y;
  if (below + ch <= bounds.bottom) {
    y = below;                       // fits below
  } else if (above >= bounds.top) {
    y = above;                       // flip above
  } else {
    // Neither fully fits — pick the side with more space.
    const roomBelow = bounds.bottom - anchor.y;
    const roomAbove = anchor.y - bounds.top;
    y = roomAbove > roomBelow ? above : below;
  }
  y = Math.max(bounds.top, Math.min(y, bounds.bottom - ch));

  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
}

async function showHoverCard(countryId, countryName, activePoly) {
  __mapHoverPoly = activePoly;
  // Freeze the cursor position at hover-start as the card's anchor (the card
  // does not follow the cursor afterwards — it stays pinned to this point).
  __mapHoverAnchor = { x: __mapPointer.x, y: __mapPointer.y };
  dimAllExcept(__mapWorldSeries, activePoly, countryId);

  // Render immediately from cache/fallback so it feels instant.
  renderHoverCard(countryId, countryName);

  // If the profile arrives while still hovering the same country, re-render
  // ONLY when the content actually changed (new DNA text or a hero image that
  // wasn't there before) — otherwise we'd reset an already-loaded image.
  const raw = await loadProfile(countryId);
  if (raw && __mapHoverCountryId === countryId) {
    const next = buildHoverTeaser(countryId, countryName);
    const changed = !__hoverRendered
      || __hoverRendered.countryId !== countryId
      || __hoverRendered.dna !== next.dna
      || __hoverRendered.image !== (next.image || null);
    if (changed) renderHoverCard(countryId, countryName);
  }
}

function showHoverTitleCloud(books, activePoly, options = {}) {
  const stage = document.getElementById('mapHoverStage');
  if (!stage) return;
  const anchor = getHoverAnchorPoint(activePoly);
  const nodes = buildHoverTitles(anchor, books, options);
  stage.innerHTML = nodes.join('');
}

function hoverViewportBounds() {
  const panelOffset = document.body.classList.contains('map-panel-open') ? 540 : 0;
  return {
    left: 22,
    right: window.innerWidth - panelOffset - 22,
    top: hoverSafeTop(),
    bottom: window.innerHeight - 24,
  };
}

function getHoverAnchorPoint(poly) {
  const chartRect = document.getElementById('mapChart')?.getBoundingClientRect();
  const spriteX = poly?.get?.('x');
  const spriteY = poly?.get?.('y');
  const fromPoly = Number.isFinite(spriteX) && Number.isFinite(spriteY) && chartRect
    ? { x: chartRect.left + spriteX, y: chartRect.top + spriteY }
    : null;

  const bounds = hoverViewportBounds();
  const p = fromPoly || __mapPointer;
  return {
    x: Math.max(bounds.left + 60, Math.min(p.x, bounds.right - 60)),
    y: Math.max(bounds.top + 52, Math.min(p.y, bounds.bottom - 152)),
  };
}

function clampHoverNode(x, y, width, height) {
  const bounds = hoverViewportBounds();
  return {
    x: Math.max(bounds.left, Math.min(x, bounds.right - width)),
    y: Math.max(bounds.top, Math.min(y, bounds.bottom - height)),
  };
}

function hoverSafeTop() {
  const subheaderRect = document.querySelector('#panel-map .map-subheader')?.getBoundingClientRect();
  return subheaderRect ? Math.round(subheaderRect.bottom + 12) : 132;
}

function getHoverAnchorZone(anchor) {
  const bounds = hoverViewportBounds();
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const relX = (anchor.x - bounds.left) / width;
  const relY = (anchor.y - bounds.top) / height;
  return {
    horizontal: relX < 0.3 ? 'left' : relX > 0.7 ? 'right' : 'center',
    vertical: relY < 0.36 ? 'top' : relY > 0.68 ? 'bottom' : 'middle',
  };
}

function mirrorAngles(angles) {
  return angles.map(angle => {
    const mirrored = 180 - angle;
    return mirrored > 180 ? mirrored - 360 : mirrored;
  });
}

function uniqueCompact(values, max = Infinity) {
  const out = [];
  const seen = new Set();
  values.forEach((value) => {
    const text = String(value || '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out.slice(0, max);
}

// Slim teaser for the minimal hover card: a single line of literary DNA.
// Deep context (voices, entry work, cultural cue) now lives in the click panel,
// so the hover stays a lightweight prompt to click rather than a content dump.
function buildHoverTeaser(countryId, countryName) {
  const profile = buildRegionContextSync(countryId, countryName);
  const hover = profile.hover || {};
  const dna = uniqueCompact(
    Array.isArray(hover.dna) && hover.dna.length ? hover.dna : (profile.keywords || []),
    3
  ).join(' · ') || 'A reading-context blind spot worth entering';
  const image = profile.userHero?.image || profile.hero?.image || null;
  return { dna, image };
}

function buildHoverTitles(anchor, books, options = {}) {
  const {
    max = 8,
    emptyText = 'No mapped books yet',
    className = 'map-hover-title',
    radiusBase = 188,
    radiusStep = 34,
    width = 204,
    height = 32,
  } = options;
  const list = books.slice(0, max);
  if (!list.length) {
    if (!emptyText) return [];
    const pos = clampHoverNode(anchor.x - 86, anchor.y + 122, 190, 32);
    return [`<div class="${className} is-empty" style="left:${pos.x}px;top:${pos.y}px">${escapeHTML(emptyText)}</div>`];
  }

  const zone = getHoverAnchorZone(anchor);
  const angles = zone.horizontal === 'center'
    ? [-135, -35, 135, 35, -90, 90, -10, 170]
    : zone.horizontal === 'left'
      ? [-56, -18, 18, 54, -88, 88, 124, -124]
      : mirrorAngles([-56, -18, 18, 54, -88, 88, 124, -124]);
  return list.map((book, index) => {
    const angle = angles[index % angles.length] * Math.PI / 180;
    const radius = radiusBase + (index % 3) * radiusStep;
    const x = anchor.x + Math.cos(angle) * radius;
    const y = anchor.y + Math.sin(angle) * radius;
    const pos = clampHoverNode(x - width / 2, y - height / 2, width, height);
    const rot = (index % 2 === 0 ? -1 : 1) * (6 + (index % 3) * 2);
    return `<div class="${className}" style="left:${pos.x}px;top:${pos.y}px;transform:rotate(${rot}deg)">${escapeHTML(book.title)}</div>`;
  });
}

function brighten(hex, amount) {
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  return '#' + [r,g,b].map(v => Math.min(255,v+amount).toString(16).padStart(2,'0')).join('');
}

/* ── Panel ──────────────────────────────────────────────────────────────── */

async function openCountryPanel(countryId, name) {
  const books = allCountryBooks(countryId);

  // Open panel immediately with fallback context so it feels instant.
  __mapPanelState = {
    type: 'country',
    countryId,
    regionLabel: name,
    placeLabel: name,
    filterMode: __mapGeoMode,
    activeTab: 'books',
    books,
    context: buildRegionContextSync(countryId, name),
    showProvinceLabels: countryId !== 'CN',
  };
  renderPanel();

  // Fetch real profile in background; re-render non-books tabs if panel is still open.
  buildRegionContext(countryId, name, profile => {
    if (__mapPanelState?.countryId === countryId) {
      __mapPanelState.context = profile;
      renderPanelHero();
      if (__mapPanelState.activeTab !== 'books') renderPanelBody();
    }
  });
}

async function openProvincePanel(provinceId, name, books = allProvinceBooks(provinceId)) {
  const provinceName = PROV_NAMES[provinceId] || name;
  const parentCountryId = inferProvinceCountry(provinceId, books);
  const parentCountryLabel = countryLabelFromId(parentCountryId);

  __mapPanelState = {
    type: 'province',
    countryId: parentCountryId,
    provinceId,
    regionLabel: provinceName,
    placeLabel: `${parentCountryLabel} > ${provinceName}`,
    filterMode: __mapGeoMode,
    activeTab: 'books',
    books,
    context: buildRegionContextSync(parentCountryId, provinceName),
    showProvinceLabels: false,
  };
  renderPanel();

  buildRegionContext(parentCountryId, provinceName, profile => {
    if (__mapPanelState?.provinceId === provinceId) {
      __mapPanelState.context = profile;
      renderPanelHero();
      if (__mapPanelState.activeTab !== 'books') renderPanelBody();
    }
  });
}

function renderPanel() {
  const panelEl = document.getElementById('mapPanel');
  if (!panelEl || !__mapPanelState) return;

  renderPanelHero();
  document.getElementById('mapPanelPlace').textContent = __mapPanelState.placeLabel;
  const subEl = document.getElementById('mapPanelSub');
  const subtitle = buildPanelSubtitle(__mapPanelState);
  subEl.textContent = subtitle;
  subEl.classList.toggle('is-empty', !subtitle);

  renderPanelTabs();
  renderPanelBody();

  panelEl.classList.add('open');
  document.body.classList.add('map-panel-open');
}

// Full-bleed hero image at the top of the panel. The place name is overlaid
// on the image; the plain-text head is dimmed to a sub-label so the name
// isn't duplicated. Falls back to the text-only head when no image exists.
// `hero` resolves user-uploaded photos first (future), then the curated
// open-source image: userHero ?? hero.
function renderPanelHero() {
  const heroEl = document.getElementById('mapPanelHero');
  const panelEl = document.getElementById('mapPanel');
  if (!heroEl || !__mapPanelState) return;

  const ctx = __mapPanelState.context || {};
  const hero = ctx.userHero || ctx.hero || null;
  const image = hero?.image;

  if (!image) {
    heroEl.hidden = true;
    heroEl.innerHTML = '';
    panelEl.classList.remove('has-hero');
    return;
  }

  const credit = hero.credit
    ? `<span class="map-panel-hero-credit">${escapeHTML(hero.credit)}</span>`
    : '';
  const caption = hero.caption
    ? `<span class="map-panel-hero-caption">${escapeHTML(hero.caption)}</span>`
    : '';

  heroEl.innerHTML = `
    <img class="map-panel-hero-img" src="${escapeHTML(image)}" alt="${escapeHTML(__mapPanelState.placeLabel)}" loading="lazy"
         onerror="this.closest('.map-panel-hero').hidden=true;this.closest('.map-panel').classList.remove('has-hero')">
    <div class="map-panel-hero-overlay">
      <span class="map-panel-hero-name">${escapeHTML(__mapPanelState.regionLabel || __mapPanelState.placeLabel)}</span>
      ${caption}
    </div>
    ${credit}`;
  heroEl.hidden = false;
  panelEl.classList.add('has-hero');
}

// Closes only the panel DOM — used internally by goWorld() to avoid recursion.
function dismissPanel() {
  __mapPanelState = null;
  const panelEl = document.getElementById('mapPanel');
  panelEl.classList.remove('open');
  document.body.classList.remove('map-panel-open');
}

// Closes panel and resets map to fit view — used by the × close button.
function closePanel() {
  dismissPanel();
  __mapFocusedCountryId = null;
  if (typeof __mapGoWorldFn === 'function') {
    __mapGoWorldFn();
  } else if (__mapChart) {
    __mapChart.goHome();
  }
}

function renderPanelTabs() {
  const container = document.getElementById('mapPanelTabs');
  if (!container || !__mapPanelState) return;
  container.innerHTML = '';

  MAP_TAB_META.forEach(tab => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-tab-btn' + (tab.id === __mapPanelState.activeTab ? ' active' : '');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      __mapPanelState.activeTab = tab.id;
      renderPanelBody();
      renderPanelTabs();
    });
    container.appendChild(btn);
  });
}

function renderPanelBody() {
  const container = document.getElementById('mapPanelBody');
  if (!container || !__mapPanelState) return;

  if (__mapPanelState.activeTab === 'books') {
    renderPanelBooks(__mapPanelState.books || [], {
      showProvinceLabels: __mapPanelState.showProvinceLabels,
      filterMode: __mapPanelState.filterMode,
    });
    return;
  }

  const ctx = __mapPanelState.context;
  if (__mapPanelState.activeTab === 'culture') {
    container.innerHTML = `
      <section class="map-copy-card">
        <div class="map-copy-kicker">Cultural background</div>
        <p>${escapeHTML(ctx.culture)}</p>
      </section>
    `;
    return;
  }

  if (__mapPanelState.activeTab === 'history') {
    container.innerHTML = `
      <section class="map-copy-card">
        <div class="map-copy-kicker">Historical context</div>
      </section>
      <section class="map-history-list">
        ${ctx.history.map(item => `
          <article class="map-history-item">
            <p>${escapeHTML(item)}</p>
          </article>
        `).join('')}
      </section>
    `;
    return;
  }

  if (__mapPanelState.activeTab === 'keywords') {
    container.innerHTML = `
      <section class="map-copy-card">
        <div class="map-copy-kicker">Literary / thought keywords</div>
        <div class="map-keyword-grid">
          ${ctx.keywords.map(word => `<span class="map-keyword-chip">${escapeHTML(word)}</span>`).join('')}
        </div>
        <p class="map-copy-note">${escapeHTML(buildKeywordNarrative(__mapPanelState.regionLabel, ctx.keywords))}</p>
      </section>
    `;
    return;
  }

  if (__mapPanelState.activeTab === 'starter') {
    const starterList = buildStarterList(__mapPanelState);
    container.innerHTML = `
      <div class="map-starter-list">
        ${starterList.map((item, index) => `
          <article class="map-starter-item${index === 0 ? ' first' : ''}">
            <div class="map-starter-cover${item.cover ? ' has-image' : ''}">
              ${item.cover
                ? `<img src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)} cover">`
                : `<span class="map-starter-cover-fallback">${escapeHTML((item.title || '').slice(0, 2) || '书')}</span>`
              }
            </div>
            <div class="map-starter-copy">
              <div class="map-copy-kicker">${escapeHTML(item.type || 'Starter reading')}</div>
              <h4>${escapeHTML(item.title)}</h4>
              ${item.author ? `<div class="map-starter-author">${escapeHTML(item.author)}</div>` : ''}
              <p>${escapeHTML(item.note)}</p>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }
}

function renderPanelBooks(books, { showProvinceLabels = true } = {}) {
  const container = document.getElementById('mapPanelBody');
  if (!container || !__mapPanelState) return;
  if (!books.length) {
    const modeMeta = MAP_MODE_META[__mapPanelState.filterMode];
    container.innerHTML = `
      <div class="map-panel-empty">
        <strong>${escapeHTML(modeMeta?.label || 'All Locations')}</strong>
        <span>${escapeHTML(modeMeta?.empty || 'No mapped books in this region yet.')}</span>
      </div>
    `;
    return;
  }
  container.innerHTML = '';

  const groups = showProvinceLabels
    ? Object.entries(books.reduce((acc, b) => {
      const key = inferProvinceKey(b);
      (acc[key] = acc[key] || []).push(b);
      return acc;
    }, {}))
    : [['__all', books]];

  groups.forEach(([prov, list]) => {
    if (showProvinceLabels && groups.length > 1 && prov !== '__none') {
      const lbl = document.createElement('div');
      lbl.className = 'mb-province-label';
      lbl.textContent = buildProvincePathLabel(prov, list);
      container.appendChild(lbl);
    }
    list.forEach(b => container.appendChild(renderBookRow(b)));
  });
}

function renderBookRow(b) {
  const row = document.createElement('div');
  row.className = 'mb-row';
  const yearLabel = b.year > 0 ? b.year : Math.abs(b.year) + ' BCE';
  const coverMarkup = b.coverImage
    ? `<div class="mb-mini-cover has-image"><img src="${escapeHTML(b.coverImage)}" alt="${escapeHTML(b.title)} cover"></div>`
    : `<div class="mb-mini-cover" style="background:${b.bg};color:${b.text}"><div class="mb-mini-title">${escapeHTML(b.title)}</div></div>`;

  row.innerHTML = `
    ${coverMarkup}
    <div class="mb-info">
      <div class="mb-info-title">${escapeHTML(b.title)}</div>
      <div class="mb-info-author">${escapeHTML(b.author)}</div>
      <div class="mb-info-meta">
        <span class="mb-info-year">${yearLabel}</span>
        ${b.tags.slice(0,2).map(t=>`<span class="mb-info-tag">${escapeHTML(t)}</span>`).join('')}
      </div>
    </div>
    <div class="mb-arrow">→</div>`;
  row.addEventListener('click', () => {
    if (BooksStore.getById(b.id)) App.show('book', { id: b.id });
  });
  return row;
}

function inferProvinceKey(book) {
  return (
    book.geo?.contentLocation?.province ||
    book.geo?.authorOrigin?.province ||
    book.geo?.readerLocation?.province ||
    book.province ||
    '__none'
  );
}

function buildPanelSubtitle(state) {
  if (state.type === 'province') return '';
  const total = state.books.length;
  const modeLabel = state.filterMode === 'all'
    ? 'All Locations'
    : (MAP_MODE_META[state.filterMode]?.label || 'Current Mode');
  return `${total} books in ${modeLabel.toLowerCase()} · culture + history + entry routes`;
}

function buildProvincePathLabel(provinceId, books) {
  const countryId = inferProvinceCountry(provinceId, books);
  return `${countryLabelFromId(countryId)} > ${PROV_NAMES[provinceId] || provinceId}`;
}

function inferProvinceCountry(provinceId, books = []) {
  const counts = {};
  const note = (countryId) => {
    if (!countryId) return;
    counts[countryId] = (counts[countryId] || 0) + 1;
  };
  books.forEach(book => {
    const geos = Object.values(book.geo || {});
    geos.forEach(geo => {
      if (!geo?.province || geo.province !== provinceId) return;
      note(geo.country || book.loc);
    });
    if (book.province === provinceId) note(book.loc);
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return top;
  if (provinceId.startsWith('CN-')) return 'CN';
  return __mapPanelState?.countryId || 'CN';
}

function countryLabelFromId(countryId) {
  if (!countryId) return 'World';
  const label = REGION_NAME_FORMATTER?.of(countryId);
  return label || countryId;
}

// Flatten a loaded geo-profile JSON into the shape the panel renderers expect.
function normalizeProfile(raw) {
  if (!raw) return null;
  const p = raw.panel || {};
  return {
    hover:    raw.hover    || {},
    hero:     raw.hero     || null,
    culture:  p.culture   || raw.culture  || '',
    history:  p.history   || raw.history  || [],
    keywords: p.keywords  || raw.keywords || [],
    starters: p.starters  || raw.starters || [],
  };
}

// Synchronous: returns cached profile or fallback immediately.
// Use for hover previews where async rendering would flicker.
function buildRegionContextSync(countryId, label) {
  const cached = getCachedProfile(countryId);
  return normalizeProfile(cached) || normalizeProfile(buildFallbackProfile(countryId, label));
}

// Async: fetches the profile, then calls onReady(profile) when available.
// Returns the fallback immediately for callers that need something now.
async function buildRegionContext(countryId, label, onReady) {
  const fallback = normalizeProfile(buildFallbackProfile(countryId, label));
  const raw = await loadProfile(countryId).catch(() => null);
  const profile = normalizeProfile(raw) || fallback;
  if (onReady) onReady(profile);
  return profile;
}

function buildKeywordNarrative(label, keywords) {
  return `${label} 这条阅读线不一定先求“完整”，先抓住 ${keywords.slice(0, 3).join(' / ')} 这几个词，通常就能更快进入地区语境。`;
}

function buildStarterList(state) {
  const starters = [...(state.context.starters || [])];
  if (state.countryId === 'CN' && state.type === 'country') {
    return starters.slice(0, 4);
  }
  const books = state.books || [];
  const modeLabel = state.filterMode === 'all'
    ? 'all locations'
    : (MAP_MODE_META[state.filterMode]?.label.toLowerCase() || 'current mode');
  books.slice(0, 2).forEach(book => {
    starters.unshift({
      title: book.title,
      author: book.author,
      note: `Already mapped in ${modeLabel}. Start here directly.`,
      type: 'Mapped Now'
    });
  });
  return starters.slice(0, 4);
}

/* ── Misc ───────────────────────────────────────────────────────────────── */

const PROV_NAMES = {
  'CN-11':'Beijing',     'CN-12':'Tianjin',      'CN-13':'Hebei',
  'CN-14':'Shanxi',      'CN-15':'Inner Mongolia','CN-21':'Liaoning',
  'CN-22':'Jilin',       'CN-23':'Heilongjiang',  'CN-31':'Shanghai',
  'CN-32':'Jiangsu',     'CN-33':'Zhejiang',      'CN-34':'Anhui',
  'CN-35':'Fujian',      'CN-36':'Jiangxi',       'CN-37':'Shandong',
  'CN-41':'Henan',       'CN-42':'Hubei',         'CN-43':'Hunan',
  'CN-44':'Guangdong',   'CN-45':'Guangxi',       'CN-46':'Hainan',
  'CN-50':'Chongqing',   'CN-51':'Sichuan',       'CN-52':'Guizhou',
  'CN-53':'Yunnan',      'CN-54':'Tibet',          'CN-61':'Shaanxi',
  'CN-62':'Gansu',       'CN-63':'Qinghai',       'CN-64':'Ningxia',
  'CN-65':'Xinjiang',
};

function setBreadcrumb(level, label, worldClickFn) {
  const el = document.getElementById('mapBreadcrumb');
  if (level === 'world') {
    el.innerHTML = `<span class="crumb active">🌐 World</span>`;
  } else {
    el.innerHTML = `<span class="crumb crumb-link" id="crumbWorld">🌐 World</span>
      <span class="crumb-sep">›</span>
      <span class="crumb active">${escapeHTML(label)}</span>`;
    if (worldClickFn) {
      document.getElementById('crumbWorld').addEventListener('click', worldClickFn);
    }
  }
}

/* amCharts 5 stores GeoJSON properties under dataItem.dataContext.
   The 'name' key is NOT promoted to dataItem.get('name') — read it
   directly from the feature properties instead. */
function getPolyName(polygon) {
  const di = polygon.dataItem;
  if (!di) return '';
  // Primary path: GeoJSON feature properties
  const ctx = di.dataContext;
  if (ctx?.properties?.name) return ctx.properties.name;
  // Fallback paths used in some amCharts builds
  if (ctx?.name)             return ctx.name;
  if (di.get?.('name'))      return di.get('name');
  return '';
}

function truncateText(text, maxChars) {
  const raw = String(text || '').trim();
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars - 1).trimEnd() + '…';
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, ch =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[ch]);
}

export { initMap, enterMap };
export function enterPanel_map(params = {}) { enterMap(params); }
