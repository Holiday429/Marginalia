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

const PALETTE = [
  '#5c3d4a','#3d4f5c','#4a5c3d','#5c4a3d','#3d3d5c',
  '#5c3d3d','#3d5c4a','#5c503d','#4a3d5c','#3d5c5c',
  '#5c4e3d','#3d4a5c','#523d5c','#3d5c3d','#5c3d50',
  '#455c3d','#5c453d','#3d4c5c','#4c5c3d','#5c3d45',
];

const COUNTRY_COLOR = {
  US:'#4a5c3d', CA:'#3d4f5c', MX:'#5c4a3d',
  GT:'#4a3d5c', BZ:'#3d5c4a', HN:'#5c3d4a', SV:'#3d5c3d',
  NI:'#5c503d', CR:'#3d4a5c', PA:'#5c4e3d',
  CU:'#4a5c3d', JM:'#3d3d5c', HT:'#5c3d3d', DO:'#3d5c5c',
  CO:'#3d5c4a', VE:'#5c3d3d', GY:'#4a3d5c', SR:'#3d5c3d',
  EC:'#5c4a3d', PE:'#3d4f5c', BR:'#4c5c3d', BO:'#5c503d',
  PY:'#3d4a5c', CL:'#5c3d4a', AR:'#3d5c5c', UY:'#5c4e3d',
  PT:'#4a3d5c', ES:'#3d5c4a', FR:'#5c3d4a', GB:'#3d3d5c',
  IE:'#5c4a3d', NL:'#3d5c3d', BE:'#5c3d3d', LU:'#4a5c3d',
  CH:'#3d4f5c', DE:'#5c503d', AT:'#3d4a5c', DK:'#5c4e3d',
  SE:'#4a3d5c', NO:'#3d5c4a', FI:'#5c3d4a',
  IT:'#5c3d50', GR:'#3d4c5c', AL:'#5c453d', RS:'#4c5c3d',
  HR:'#5c3d45', BA:'#455c3d', SI:'#5c453d', ME:'#3d4a5c',
  MK:'#5c4e3d', BG:'#3d5c3d', RO:'#5c3d3d',
  PL:'#3d4f5c', CZ:'#5c4a3d', SK:'#4a3d5c', HU:'#3d5c3d',
  UA:'#5c503d', BY:'#3d3d5c', MD:'#5c3d4a',
  LT:'#3d5c4a', LV:'#5c4e3d', EE:'#4a5c3d',
  RU:'#3d4a5c', KZ:'#5c4a3d', UZ:'#3d5c3d', TM:'#5c3d3d',
  KG:'#4a3d5c', TJ:'#3d5c5c', AF:'#5c503d',
  TR:'#5c3d4a', SY:'#3d4f5c', LB:'#5c4e3d', IL:'#4a3d5c',
  JO:'#3d5c4a', IQ:'#5c3d3d', IR:'#4c5c3d', SA:'#5c453d',
  YE:'#3d4a5c', OM:'#5c4e3d', AE:'#4a5c3d', QA:'#3d3d5c',
  KW:'#5c4a3d', BH:'#3d5c3d',
  PK:'#5c3d4a', IN:'#4a5c3d', BD:'#3d4f5c', NP:'#5c4a3d',
  LK:'#4a3d5c', MM:'#3d5c4a', TH:'#5c3d50',
  VN:'#3d4c5c', KH:'#5c453d', LA:'#4c5c3d', MY:'#5c3d45',
  SG:'#455c3d', ID:'#5c4a3d', PH:'#3d5c3d', TL:'#5c3d3d',
  CN:'#4a3d5c', MN:'#3d5c4a', KP:'#5c503d', KR:'#3d3d5c',
  JP:'#5c3d4a', TW:'#3d4a5c',
  NG:'#5c4e3d', GH:'#4a5c3d', CI:'#3d4f5c', SN:'#5c4a3d',
  ML:'#4a3d5c', BF:'#3d5c3d', NE:'#5c3d3d', CM:'#3d5c5c',
  TD:'#5c503d', SD:'#3d4a5c', SS:'#5c4e3d', ET:'#4a5c3d',
  SO:'#3d3d5c', KE:'#5c4a3d', TZ:'#4a3d5c', UG:'#3d5c4a',
  RW:'#5c3d4a', BI:'#3d4f5c', CD:'#5c4e3d', CG:'#4c5c3d',
  GA:'#5c453d', AO:'#3d4a5c', ZM:'#5c3d45', ZW:'#455c3d',
  MZ:'#5c4a3d', MW:'#3d5c3d', MG:'#5c3d3d', ZA:'#3d4c5c',
  NA:'#5c503d', BW:'#4a3d5c', LS:'#3d5c5c', SZ:'#5c4e3d',
  MA:'#4a5c3d', DZ:'#3d4f5c', TN:'#5c3d4a', LY:'#4a3d5c',
  EG:'#3d5c4a', MR:'#5c4e3d',
  AU:'#3d3d5c', NZ:'#5c3d4a', PG:'#4a5c3d', FJ:'#3d5c3d',
};

const BOOK_COLOR_BOOST = {
  CN:'#6a547a', GB:'#4a5a7a', FR:'#4a6a5a', RU:'#4a4a7a',
  JP:'#7a4a6a', US:'#5a7a4a', IN:'#7a6a4a', CO:'#4a7a5a',
  GR:'#4a6a8a', CZ:'#5a5a7a', PT:'#5a4a7a', NG:'#7a5a4a',
  IT:'#7a4a6a', CL:'#6a4a5a',
};
const REGION_NAME_FORMATTER = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const DIMMED_FILL        = '#1e2026';
const WATER_FILL         = '#1a1714';
const HOVER_STROKE       = '#c4903a';
const HOVER_STROKE_WIDTH = 1.5;
const HEAT_MODE_COLORS = {
  authorOrigin: {
    low: '#2f3f66',
    high: '#7ba5ff',
  },
  contentLocation: {
    low: '#4d3f2d',
    high: '#c4903a',
  },
  readerLocation: {
    low: '#2f4a3b',
    high: '#7cc9a1',
  },
};

function countryFill(id) {
  if (__mapGeoMode === 'all') {
    const hasBooks = activeCountryBooks(id).length > 0;
    if (hasBooks && BOOK_COLOR_BOOST[id]) return BOOK_COLOR_BOOST[id];
    return COUNTRY_COLOR[id] || PALETTE[Math.abs(hashStr(id)) % PALETTE.length];
  }
  const count = activeCountryBooks(id).length;
  const max = modeMaxCount('country');
  return heatColorForCount(count, max);
}

function provinceFill(id) {
  if (__mapGeoMode === 'all') {
    const base = PALETTE[Math.abs(hashStr(id)) % PALETTE.length];
    return activeProvinceBooks(id).length ? brighten(base, 18) : base;
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
  const subheaderRect = document.querySelector('#panel-map .map-subheader')?.getBoundingClientRect();
  const isMobile = window.innerWidth <= 980;
  if (forChina) return isMobile ? 18 : 12;
  const fallback = isMobile ? 214 : 154;
  const areaTop = subheaderRect ? Math.round(subheaderRect.bottom + (isMobile ? 12 : 14)) : fallback;
  return areaTop;
}

function mapBottomPadding(forChina = false) {
  const isMobile = window.innerWidth <= 980;
  if (forChina) return isMobile ? 18 : 12;
  return isMobile ? 22 : 16;
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
    if (__mapBooted) {
      repaintWorldFills();
      repaintChinaFills();
    }
  });
}

function enterMap() {
  if (__mapBooted) return;
  if (typeof am5 === 'undefined' || typeof am5map === 'undefined') {
    waitForAmCharts(bootMap);
  } else {
    bootMap();
  }
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
  const worldBtn = document.getElementById('mapWorldBtn');
  if (worldBtn) {
    worldBtn.addEventListener('click', (event) => {
      event.preventDefault();
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
    })
  );
  __mapChart = chart;

  /* Water background */
  chart.chartContainer.children.unshift(am5.Rectangle.new(root, {
    width:  am5.percent(100),
    height: am5.percent(100),
    fill:   am5.color(WATER_FILL),
  }));

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
    stroke:          am5.color('#16191f'),
    strokeWidth:     0.4,
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

  /* Paint each country */
  worldSeries.events.on('datavalidated', () => {
    repaintWorldFills(worldSeries);
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
    stroke:          am5.color('#2a2218'),
    strokeWidth:     0.4,
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
      p.set('fill', am5.color(p === ev.target ? brighten('#5a4828', 28) : DIMMED_FILL));
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
    resetWorldFills(worldSeries);
    resetWorldHome();
  }
  __mapGoWorldFn = goWorld;

  setMapGeoMode = (mode) => {
    __mapGeoMode = mode;
    renderGlobalGeoFilters();
    updateSubheaderCounts();
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
  const stage = document.getElementById('mapHoverStage');
  if (stage) stage.innerHTML = '';
  if (!__mapFocusedCountryId && !__mapInChina) resetWorldFills(__mapWorldSeries);
}

function showHoverPreview(countryId, countryName, activePoly) {
  __mapHoverCountryId = countryId;
  if (__mapGeoMode === 'all') {
    showHoverPreviewRich(countryId, countryName, activePoly);
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

function renderHoverRich(stage, anchor, countryId, countryName) {
  const content = buildHoverMetaContent(countryId, countryName);
  const metaNodes = buildHoverMetaNodes(anchor, countryName, content);
  const keepOut = { x: anchor.x - 108, y: anchor.y - 68, w: 216, h: 136 };
  const laidOut = layoutHoverMetaNodes(metaNodes, anchor, keepOut);
  stage.innerHTML = laidOut.map(node =>
    `<div class="${node.wrapperClass || 'map-hover-meta'} ${node.cls || ''}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px">${node.html}</div>`
  ).join('');
}

async function showHoverPreviewRich(countryId, countryName, activePoly) {
  dimAllExcept(__mapWorldSeries, activePoly, countryId);

  const stage = document.getElementById('mapHoverStage');
  if (!stage) return;

  const anchor = getHoverAnchorPoint(activePoly);

  // Render immediately with whatever is cached (fallback if not yet loaded).
  renderHoverRich(stage, anchor, countryId, countryName);

  // Fetch profile; if still hovering the same country when it arrives, redraw.
  const raw = await loadProfile(countryId);
  if (raw && __mapHoverCountryId === countryId) {
    renderHoverRich(stage, anchor, countryId, countryName);
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

function buildHoverMetaContent(countryId, countryName) {
  const profile = buildRegionContextSync(countryId, countryName);
  const hover = profile.hover || {};
  const books = allCountryBooks(countryId);
  const keywordText = uniqueCompact(
    Array.isArray(hover.dna) && hover.dna.length ? hover.dna : (profile.keywords || []),
    3
  ).join(' · ') || 'No clear literary signal yet';

  const voices = uniqueCompact([
    ...(hover.voices || []),
    ...(profile.starters || []).map(item => item?.author),
    ...books.map(book => book?.author),
  ], 2);
  const voiceText = voices.join(' · ') || 'No mapped voices yet';

  const hoverEntry = hover.entry && typeof hover.entry === 'object' ? hover.entry : null;
  const starter =
    (hoverEntry?.title ? {
      title: hoverEntry.title,
      note: hoverEntry.reason || '',
      author: hoverEntry.author || '',
    } : null) ||
    (profile.starters || []).find(item => item?.title) ||
    (books[0] ? {
      title: books[0].title,
      note: `Start with a short work to enter ${countryName}'s literary context.`,
      author: books[0].author,
    } : null);

  const entryTitle = truncateText(starter?.title || `One representative work`, 38);
  const entryReason = truncateText(
    starter?.note || `Use one concise text to enter ${countryName}'s reading atmosphere.`,
    52
  );

  return {
    keywordText,
    voiceText,
    entryTitle,
    entryReason,
    cueText: truncateText(String(hover.cue || profile.culture || ''), 84),
  };
}

function buildHoverSlotTemplates(zone) {
  // Each card is assigned a primary quadrant (TL, TR, BL, BR) relative to the anchor.
  // Candidates are ordered: ideal → same-side alternative → opposite-side escape hatches.
  // Vertical bias nudges everything away from the viewport edge the anchor is near.
  const yBias = zone.vertical === 'top' ? 64 : (zone.vertical === 'bottom' ? -64 : 0);

  // Quadrant offsets: dx/dy are center-of-card relative to anchor center.
  // Positive dx = right of anchor, positive dy = below anchor.
  const TL = { dx: -240, dy: -148 };
  const TR = { dx: 240, dy: -148 };
  const BL = { dx: -240, dy: 110 };
  const BR = { dx: 240, dy: 110 };

  // When anchor is near the left edge, shift all cards rightward.
  // When near the right edge, shift leftward.
  const hShift = zone.horizontal === 'left' ? 120 : (zone.horizontal === 'right' ? -120 : 0);

  const raw = {
    // Country name: above anchor, fallback below
    country: [
      { dx: 0, dy: -96 },
      { dx: 0, dy: 94 },
      { dx: -80, dy: -96 },
      { dx: 80, dy: -96 },
    ],
    // Literary DNA → top-left primary
    dna: [
      TL,
      { dx: TL.dx, dy: BL.dy },           // bottom-left
      { dx: TR.dx, dy: TL.dy },           // top-right escape
      { dx: TL.dx - 40, dy: TL.dy - 60 }, // further out TL
      { dx: TR.dx + 40, dy: TR.dy - 60 }, // further out TR
    ],
    // Representative voices → top-right primary
    voices: [
      TR,
      { dx: TR.dx, dy: BR.dy },           // bottom-right
      { dx: TL.dx, dy: TR.dy },           // top-left escape
      { dx: TR.dx + 40, dy: TR.dy - 60 },
      { dx: TL.dx - 40, dy: TL.dy - 60 },
    ],
    // Entry work → bottom-left primary
    entry: [
      BL,
      { dx: BL.dx, dy: TL.dy },           // top-left
      { dx: BR.dx, dy: BL.dy },           // bottom-right escape
      { dx: BL.dx - 40, dy: BL.dy + 60 },
      { dx: BR.dx + 40, dy: BR.dy + 60 },
    ],
    // Context cue → bottom-right primary
    cue: [
      BR,
      { dx: BR.dx, dy: TR.dy },           // top-right
      { dx: BL.dx, dy: BR.dy },           // bottom-left escape
      { dx: BR.dx + 40, dy: BR.dy + 60 },
      { dx: BL.dx - 40, dy: BL.dy + 60 },
    ],
  };

  return Object.fromEntries(
    Object.entries(raw).map(([key, list]) => [
      key,
      list.map(slot => ({
        dx: slot.dx + (key === 'country' ? 0 : hShift),
        dy: slot.dy + yBias,
      })),
    ])
  );
}

function slotsToHoverCandidates(anchor, slots, width, height) {
  return (slots || []).map(slot => ({
    x: anchor.x + slot.dx - width / 2,
    y: anchor.y + slot.dy - height / 2,
  }));
}

function buildHoverMetaNodes(anchor, countryName, content) {
  const zone = getHoverAnchorZone(anchor);
  const slotMap = buildHoverSlotTemplates(zone);

  return [
    {
      wrapperClass: 'map-hover-country-name',
      width: 260,
      height: 46,
      candidates: slotsToHoverCandidates(anchor, slotMap.country, 260, 46),
      html: `<span>${escapeHTML(countryName)}</span>`,
    },
    {
      cls: 'map-hover-meta-dna',
      width: 198,
      height: 74,
      candidates: slotsToHoverCandidates(anchor, slotMap.dna, 198, 74),
      html: `
        <div class="map-hover-meta-kicker">Literary DNA</div>
        <div class="map-hover-meta-text">${escapeHTML(content.keywordText)}</div>
      `,
    },
    {
      cls: 'map-hover-meta-voices',
      width: 194,
      height: 74,
      candidates: slotsToHoverCandidates(anchor, slotMap.voices, 194, 74),
      html: `
        <div class="map-hover-meta-kicker">Representative Voices</div>
        <div class="map-hover-meta-text">${escapeHTML(content.voiceText)}</div>
      `,
    },
    {
      cls: 'map-hover-meta-entry',
      width: 212,
      height: 94,
      candidates: slotsToHoverCandidates(anchor, slotMap.entry, 212, 94),
      html: `
        <div class="map-hover-meta-kicker">Entry Work</div>
        <div class="map-hover-meta-entry-title">${escapeHTML(content.entryTitle)}</div>
        <div class="map-hover-meta-entry-note">${escapeHTML(content.entryReason)}</div>
      `,
    },
    {
      cls: 'map-hover-meta-cue',
      width: 230,
      height: 108,
      candidates: slotsToHoverCandidates(anchor, slotMap.cue, 230, 108),
      html: `
        <div class="map-hover-meta-kicker">Context Cue</div>
        <div class="map-hover-meta-text">${escapeHTML(content.cueText)}</div>
      `,
    },
  ];
}

function layoutHoverMetaNodes(nodes, anchor, keepOut) {
  const placed = [];
  return nodes.map(node => {
    const rawCandidates = (node.candidates || []).map(c => ({
      x: Number.isFinite(c.x) ? c.x : anchor.x + (c.dx || 0),
      y: Number.isFinite(c.y) ? c.y : anchor.y + (c.dy || 0),
      w: node.width,
      h: node.height,
    }));
    const baseCandidates = rawCandidates.length ? rawCandidates : [{
      x: anchor.x + 120,
      y: anchor.y - 80,
      w: node.width,
      h: node.height,
    }];

    // Expand candidate pool by nudging each base candidate in 8 directions.
    const nudges = [0, 1, -1, 2, -2, 3, -3];
    const expandedCandidates = [];
    for (const base of baseCandidates) {
      for (const ny of nudges) {
        for (const nx of nudges) {
          if (nx === 0 && ny === 0) {
            expandedCandidates.push(base);
          } else {
            expandedCandidates.push({ ...base, x: base.x + nx * 48, y: base.y + ny * 48 });
          }
        }
      }
    }

    // First pass: strict — no overlap with keepOut or any placed card.
    let chosen = null;
    for (const candidate of expandedCandidates) {
      const rect = clampHoverRect(candidate);
      if (rectsOverlap(rect, keepOut, 8)) continue;
      if (placed.some(prev => rectsOverlap(rect, prev, 8))) continue;
      chosen = rect;
      break;
    }

    // Second pass: allow slight keepOut overlap if needed, but never overlap placed cards.
    if (!chosen) {
      for (const candidate of expandedCandidates) {
        const rect = clampHoverRect(candidate);
        if (placed.some(prev => rectsOverlap(rect, prev, 4))) continue;
        chosen = rect;
        break;
      }
    }

    // Last resort: minimize total overlap area.
    if (!chosen) {
      chosen = pickLeastOverlapRect(baseCandidates, keepOut, placed);
    }

    placed.push(chosen);
    return { ...node, x: chosen.x, y: chosen.y };
  });
}

function clampHoverRect(rect) {
  const pos = clampHoverNode(rect.x, rect.y, rect.w, rect.h);
  return { ...rect, x: pos.x, y: pos.y };
}

function pickLeastOverlapRect(candidates, keepOut, placed) {
  let best = clampHoverRect(candidates[0]);
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach(candidate => {
    const rect = clampHoverRect(candidate);
    const score =
      overlapArea(rect, keepOut) * 3 +
      placed.reduce((sum, prev) => sum + overlapArea(rect, prev), 0);
    if (score < bestScore) {
      best = rect;
      bestScore = score;
    }
  });
  return best;
}

function rectsOverlap(a, b, pad = 0) {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
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
      if (__mapPanelState.activeTab !== 'books') renderPanelBody();
    }
  });
}

function renderPanel() {
  const panelEl = document.getElementById('mapPanel');
  if (!panelEl || !__mapPanelState) return;

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
    container.innerHTML = ctx.history.map(item => `
      <section class="map-copy-card">
        <div class="map-copy-kicker">Historical context</div>
        <p>${escapeHTML(item)}</p>
      </section>
    `).join('');
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
