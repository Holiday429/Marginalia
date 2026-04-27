/* ==========================================================================
   Marginalia · Reading Map view
   Globe projection (geoOrthographic) — spin in any direction, click to highlight.
   ========================================================================== */

let __mapChart       = null;
let __mapBooted      = false;
let __mapWorldSeries = null;
let __mapChinaSeries = null;
let __mapInChina     = false;
let __mapFocusedCountryId = null;
let __mapActivePoly  = null;
let __mapRoot        = null;
let __mapGoWorldFn   = null;

/* ── Book data ──────────────────────────────────────────────────────────── */

const MAP_BOOKS = [
  { id:"b1",  title:"Dream of the Red Chamber",      author:"Cao Xueqin",       bg:"#6b3020", text:"#f2e0c8", loc:"CN", province:"CN-11", city:"Beijing / Nanjing", year:1791, tags:["Classic","Family"] },
  { id:"b2",  title:"The Three-Body Problem",        author:"Liu Cixin",        bg:"#1c3550", text:"#8eb8d4", loc:"CN", province:"CN-11", city:"Beijing",           year:2008, tags:["Sci-fi","Trilogy"] },
  { id:"b3",  title:"Wild Swans",                    author:"Jung Chang",       bg:"#3e2214", text:"#e4c08a", loc:"CN", province:"CN-51", city:"Yibin, Sichuan",    year:1991, tags:["Memoir","Women"] },
  { id:"b4",  title:"Wolf Totem",                    author:"Jiang Rong",       bg:"#324820", text:"#bcd4a0", loc:"CN", province:"CN-15", city:"Inner Mongolia",    year:2004, tags:["Fiction","Nature"] },
  { id:"b5",  title:"Raise the Red Lantern",         author:"Su Tong",          bg:"#7a2e18", text:"#f0d0a8", loc:"CN", province:"CN-14", city:"Shanxi",            year:1990, tags:["Novella","Power"] },
  { id:"b6",  title:"Soul Mountain",                 author:"Gao Xingjian",     bg:"#24402e", text:"#a0c8ae", loc:"CN", province:"CN-42", city:"Wuhan / Rivers",   year:1990, tags:["Nobel","Journey"] },
  { id:"b7",  title:"Balzac & the Seamstress",       author:"Dai Sijie",        bg:"#5a3018", text:"#e0b88a", loc:"CN", province:"CN-43", city:"Phoenix, Hunan",   year:2000, tags:["Coming-of-age"] },
  { id:"b8",  title:"Fortress Besieged",             author:"Qian Zhongshu",    bg:"#2e2010", text:"#e4c08a", loc:"CN", province:"CN-31", city:"Shanghai",          year:1947, tags:["Satire","Comedy"] },
  { id:"b10", title:"Rickshaw Boy",                  author:"Lao She",          bg:"#301808", text:"#dcb880", loc:"CN", province:"CN-11", city:"Beijing",           year:1936, tags:["Classic","Labour"] },
  { id:"b11", title:"Red Sorghum",                   author:"Mo Yan",           bg:"#601408", text:"#ecc0a0", loc:"CN", province:"CN-37", city:"Gaomi, Shandong",  year:1987, tags:["Nobel","War"] },
  { id:"b13", title:"Border Town",                   author:"Shen Congwen",     bg:"#304e28", text:"#b0d098", loc:"CN", province:"CN-43", city:"Fenghuang, Hunan", year:1934, tags:["Pastoral","Romance"] },
  { id:"b14", title:"The Analects",                  author:"Confucius",        bg:"#181008", text:"#dcc060", loc:"CN", province:"CN-37", city:"Qufu, Shandong",   year:-479, tags:["Philosophy","Classic"] },
  { id:"b15", title:"1984",                          author:"George Orwell",    bg:"#141414", text:"#c03030", loc:"GB", city:"London",            year:1949, tags:["Dystopia"] },
  { id:"b16", title:"Mrs Dalloway",                  author:"Virginia Woolf",   bg:"#58705a", text:"#d8e8d0", loc:"GB", city:"London",            year:1925, tags:["Modernist"] },
  { id:"b17", title:"Wuthering Heights",             author:"Emily Brontë",     bg:"#201828", text:"#c8c0d8", loc:"GB", city:"Yorkshire",         year:1847, tags:["Gothic"] },
  { id:"b18", title:"Middlemarch",                   author:"George Eliot",     bg:"#482c18", text:"#e4c080", loc:"GB", city:"English Midlands",  year:1872, tags:["Victorian"] },
  { id:"b19", title:"Les Misérables",                author:"Victor Hugo",      bg:"#142818", text:"#90c09a", loc:"FR", city:"Paris",             year:1862, tags:["Epic","Revolution"] },
  { id:"b20", title:"In Search of Lost Time",        author:"Marcel Proust",    bg:"#483428", text:"#d8c0a0", loc:"FR", city:"Paris",             year:1913, tags:["Modernist","Memory"] },
  { id:"b21", title:"War and Peace",                 author:"Leo Tolstoy",      bg:"#141430", text:"#9090c8", loc:"RU", city:"Moscow",            year:1869, tags:["Epic"] },
  { id:"b22", title:"The Master and Margarita",      author:"Mikhail Bulgakov", bg:"#2c0838", text:"#c898d8", loc:"RU", city:"Moscow",            year:1967, tags:["Magic realism"] },
  { id:"b23", title:"Crime and Punishment",          author:"F. Dostoevsky",    bg:"#220614", text:"#c88888", loc:"RU", city:"St Petersburg",     year:1866, tags:["Psychological"] },
  { id:"b24", title:"The Tale of Genji",             author:"Murasaki Shikibu", bg:"#582848", text:"#e0b0c8", loc:"JP", city:"Kyoto",             year:1008, tags:["Classic"] },
  { id:"b25", title:"Norwegian Wood",                author:"Haruki Murakami",  bg:"#18301a", text:"#88c088", loc:"JP", city:"Tokyo",             year:1987, tags:["Contemporary"] },
  { id:"b26", title:"Snow Country",                  author:"Yasunari Kawabata",bg:"#3e4e5a", text:"#c8d8e8", loc:"JP", city:"Niigata",           year:1948, tags:["Nobel"] },
  { id:"b27", title:"The Great Gatsby",              author:"F.S. Fitzgerald",  bg:"#701e10", text:"#f4e0b0", loc:"US", city:"Long Island, NY",   year:1925, tags:["Jazz Age"] },
  { id:"b28", title:"Moby-Dick",                     author:"Herman Melville",  bg:"#081828", text:"#70a8c0", loc:"US", city:"Nantucket",         year:1851, tags:["Epic","Sea"] },
  { id:"b29", title:"Blood Meridian",                author:"Cormac McCarthy",  bg:"#480e08", text:"#d88860", loc:"US", city:"Texas border",      year:1985, tags:["Western"] },
  { id:"b30", title:"The God of Small Things",       author:"Arundhati Roy",    bg:"#224218", text:"#a0d080", loc:"IN", city:"Kerala",            year:1997, tags:["Booker"] },
  { id:"b31", title:"Midnight's Children",           author:"Salman Rushdie",   bg:"#643e08", text:"#ecc050", loc:"IN", city:"Bombay",            year:1981, tags:["Booker"] },
  { id:"b32", title:"One Hundred Years of Solitude", author:"García Márquez",   bg:"#283e18", text:"#a0d870", loc:"CO", city:"Macondo",           year:1967, tags:["Nobel","Magic realism"] },
  { id:"b33", title:"The Trial",                     author:"Franz Kafka",      bg:"#181820", text:"#9090a8", loc:"CZ", city:"Prague",            year:1925, tags:["Modernist","Absurd"] },
  { id:"b34", title:"The Book of Disquiet",          author:"Fernando Pessoa",  bg:"#283040", text:"#98a8c0", loc:"PT", city:"Lisbon",            year:1982, tags:["Modernist"] },
  { id:"b35", title:"Things Fall Apart",             author:"Chinua Achebe",    bg:"#482e08", text:"#e4b060", loc:"NG", city:"Igboland",          year:1958, tags:["Classic","Colonialism"] },
  { id:"b36", title:"The Name of the Rose",          author:"Umberto Eco",      bg:"#200e04", text:"#c89848", loc:"IT", city:"Apennine abbey",    year:1980, tags:["Mystery","Medieval"] },
  { id:"b37", title:"The House of the Spirits",      author:"Isabel Allende",   bg:"#3e1020", text:"#d88888", loc:"CL", city:"Santiago",          year:1982, tags:["Magic realism"] },
  { id:"b38", title:"The Iliad",                     author:"Homer",            bg:"#604808", text:"#f4d040", loc:"GR", city:"Troy / Mycenae",    year:-750, tags:["Epic","Ancient"] },
];

const BY_LOC  = {};
const BY_PROV = {};
MAP_BOOKS.forEach(b => {
  (BY_LOC[b.loc]  = BY_LOC[b.loc]  || []).push(b);
  if (b.province) (BY_PROV[b.province] = BY_PROV[b.province] || []).push(b);
});
const BOOK_COUNTRIES = new Set(Object.keys(BY_LOC));

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

const DIMMED_FILL        = '#1e2026';
const WATER_FILL         = '#1a1714';
const HOVER_STROKE       = '#c4903a';
const HOVER_STROKE_WIDTH = 1.5;

function countryFill(id, hasBooks) {
  if (hasBooks && BOOK_COLOR_BOOST[id]) return BOOK_COLOR_BOOST[id];
  return COUNTRY_COLOR[id] || PALETTE[Math.abs(hashStr(id)) % PALETTE.length];
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function mapTopPadding(forChina = false) {
  const headerRect = document.querySelector('#view-map .shared-header-wrap')?.getBoundingClientRect();
  const isMobile = window.innerWidth <= 980;
  const headerBottom = headerRect ? Math.round(headerRect.bottom) : (isMobile ? 112 : 96);

  if (!forChina && !__mapFocusedCountryId) {
    const worldTarget = Math.round(headerBottom * (isMobile ? 0.22 : 0.18));
    const worldMin = isMobile ? 22 : 14;
    const worldMax = isMobile ? 54 : 36;
    return Math.max(worldMin, Math.min(worldTarget, worldMax));
  }

  const fallback = isMobile ? 152 : 118;
  const target = headerRect
    ? Math.round(headerRect.bottom + (isMobile ? 10 : 12))
    : fallback;
  const minPad = isMobile ? 112 : 92;
  const maxPad = Math.round(window.innerHeight * (isMobile ? 0.28 : 0.22));
  const base = Math.max(minPad, Math.min(target, maxPad));
  if (!forChina) return base;

  const chinaMin = isMobile ? 78 : 46;
  const chinaMax = isMobile ? 154 : 120;
  return Math.max(chinaMin, Math.min(Math.round(base * 0.36), chinaMax));
}

function applyMapTopPadding(forChina = __mapInChina) {
  if (!__mapChart) return;
  __mapChart.set('paddingTop', mapTopPadding(forChina));
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
  document.getElementById('view-map').innerHTML = mapShellHTML();
  bindMapShellEvents();
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
  if (attempt > 100) { console.warn('[map] amCharts failed to load'); return; }
  setTimeout(() => waitForAmCharts(cb, attempt + 1), 80);
}

/* ── DOM scaffold ──────────────────────────────────────────────────────── */

function mapShellHTML() {
  const total     = MAP_BOOKS.length;
  const countries = Object.keys(BY_LOC).length;
  const sharedHeader = typeof window.renderPrimaryHeader === 'function'
    ? window.renderPrimaryHeader('map', { actionLabel: 'World', actionId: 'mapWorldBtn' })
    : '';
  return `
    <div class="shared-header-wrap">
      ${sharedHeader}
    </div>

    <div class="map-subheader">
      <div class="map-header-right">
        <div class="map-chip"><strong>${total}</strong> books mapped</div>
        <div class="map-chip"><strong>${countries}</strong> countries</div>
      </div>
      <div class="map-breadcrumb" id="mapBreadcrumb" hidden></div>
    </div>

    <div id="mapChart"></div>

    <div class="map-zoom">
      <div class="map-zoom-btn" id="mapZoomIn">+</div>
      <div class="map-zoom-btn" id="mapZoomOut">−</div>
      <div class="map-zoom-sep"></div>
      <div class="map-zoom-btn map-zoom-fit" id="mapZoomHome">Fit</div>
    </div>

    <div class="map-hint" id="mapHint">Click any country to explore its books</div>

    <!-- Hover tooltip -->
    <div class="map-tooltip" id="mapTooltip">
      <span class="map-tooltip-name" id="mapTooltipName"></span>
      <span class="map-tooltip-count" id="mapTooltipCount"></span>
    </div>

    <!-- Side panel -->
    <div class="map-panel" id="mapPanel">
      <div class="map-panel-head">
        <div class="map-panel-place" id="mapPanelPlace">—</div>
        <div class="map-panel-sub"   id="mapPanelSub">—</div>
        <div class="map-panel-close" id="mapPanelClose">×</div>
      </div>
      <div class="map-panel-filters" id="mapPanelFilters"></div>
      <div class="map-panel-books"   id="mapPanelBooks"></div>
    </div>
  `;
}

function bindMapShellEvents() {
  document.getElementById('mapPanelClose').addEventListener('click', closePanel);
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
    const tw = 220, th = 44;
    let lx = e.clientX + 16;
    let ly = e.clientY - 12;
    if (lx + tw > window.innerWidth)  lx = e.clientX - tw - 8;
    if (ly + th > window.innerHeight) ly = e.clientY - th - 8;
    tooltip.style.left = lx + 'px';
    tooltip.style.top  = ly + 'px';
  });
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
    worldSeries.mapPolygons.each(poly => {
      const id = poly.dataItem.get('id');
      poly.set('fill', am5.color(countryFill(id, BOOK_COUNTRIES.has(id))));
    });
  });

  /* Tooltip — show name on any country, book count if available */
  const tooltip  = document.getElementById('mapTooltip');
  const tipName  = document.getElementById('mapTooltipName');
  const tipCount = document.getElementById('mapTooltipCount');

  worldSeries.mapPolygons.template.events.on('pointerover', ev => {
    const id    = ev.target.dataItem.get('id');
    const name  = getPolyName(ev.target);
    const count = (BY_LOC[id] || []).length;
    tipName.textContent  = name;
    tipCount.textContent = count > 0 ? `· ${count} book${count !== 1 ? 's' : ''}` : '';
    tooltip.classList.add('visible');
  });
  worldSeries.mapPolygons.template.events.on('pointerout', () => {
    tooltip.classList.remove('visible');
  });

  /* Click */
  worldSeries.mapPolygons.template.events.on('click', ev => {
    const id   = ev.target.dataItem.get('id');
    const name = getPolyName(ev.target);
    tooltip.classList.remove('visible');
    document.getElementById('mapHint').classList.remove('show');

    if (id === 'CN') { drillChina(); return; }

    focusCountry(ev.target, id, name);

    dimAllExcept(worldSeries, ev.target, id);

    const books = BY_LOC[id] || [];
    if (books.length) {
      openPanel(name, `${books.length} book${books.length !== 1 ? 's' : ''} mapped`, books, id);
    } else {
      closePanel();
    }
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

  /* Province colour palette */
  const CN_PROV_PALETTE = [
    '#6a4a3a','#3a5a6a','#4a6a3a','#6a3a5a','#3a4a6a',
    '#5a6a3a','#6a3a3a','#3a6a5a','#5a3a6a','#3a6a3a',
    '#6a5a3a','#3a3a6a','#6a4a5a','#4a5a6a','#5a4a6a',
    '#3a5a3a','#6a3a4a','#4a6a5a','#5a6a4a','#4a3a5a',
  ];

  chinaSeries.events.on('datavalidated', () => {
    let ci = 0;
    chinaSeries.mapPolygons.each(poly => {
      const id      = poly.dataItem.get('id');
      const hasBook = !!(BY_PROV[id]?.length);
      const base    = CN_PROV_PALETTE[ci % CN_PROV_PALETTE.length];
      ci++;
      poly.set('fill', am5.color(hasBook ? brighten(base, 22) : base));
    });
  });

  chinaSeries.mapPolygons.template.events.on('pointerover', ev => {
    const id    = ev.target.dataItem.get('id');
    const name  = getPolyName(ev.target);
    const count = (BY_PROV[id] || []).length;
    tipName.textContent  = name;
    tipCount.textContent = count > 0 ? `· ${count} book${count !== 1 ? 's' : ''}` : '';
    tooltip.classList.add('visible');
  });
  chinaSeries.mapPolygons.template.events.on('pointerout', () => {
    tooltip.classList.remove('visible');
  });

  chinaSeries.mapPolygons.template.events.on('click', ev => {
    const id   = ev.target.dataItem.get('id');
    const name = getPolyName(ev.target);
    tooltip.classList.remove('visible');

    /* Dim all other provinces */
    chinaSeries.mapPolygons.each(p => {
      p.set('fill', am5.color(p === ev.target ? brighten('#5a4828', 28) : DIMMED_FILL));
    });

    const books = BY_PROV[id] || [];
    openPanel(
      name + ' Province',
      `${books.length} book${books.length !== 1 ? 's' : ''} set here · China`,
      books, 'CN-prov'
    );
  });

  /* ── Drill / back ── */

  /* After the panel slides in (450ms), re-zoom to fit China in the narrowed
     chart area. zoomToGeoPoint level 5 fills ~66% of the viewport well.
     A second pass at 900ms catches any remaining resize lag. */
  function fitChina() {
    const doZoom = () => {
      applyMapTopPadding(true);
      chart.zoomToGeoPoint({ longitude: 104, latitude: 33.2 }, 5, true);
    };
    setTimeout(doZoom, 500);
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
    __mapInChina = true;
    __mapFocusedCountryId = 'CN';
    worldSeries.hide();
    chinaSeries.show();
    setMapInteractionMode('detail');
    setBreadcrumb('china', 'China', goWorld);
    const allCN = BY_LOC['CN'] || [];
    openPanel('China', `${allCN.length} books mapped`, allCN, 'CN');
    fitChina();
  }

  function goWorld() {
    __mapInChina = false;
    __mapFocusedCountryId = null;
    chinaSeries.hide();
    worldSeries.show();
    setMapInteractionMode('world');
    applyMapTopPadding(false);
    setBreadcrumb('world', 'World', null);
    closePanel();
    resetWorldFills(worldSeries);
    setTimeout(() => chart.goHome(), 80);
    setTimeout(() => chart.goHome(), 520);
  }
  __mapGoWorldFn = goWorld;

  document.getElementById('mapZoomIn').addEventListener('click',  () => chart.zoomIn());
  document.getElementById('mapZoomOut').addEventListener('click', () => chart.zoomOut());
  document.getElementById('mapZoomHome').addEventListener('click', () => {
    if (__mapInChina) {
      fitChina();
    } else if (__mapFocusedCountryId) {
      goWorld();
    } else {
      chart.goHome();
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
        ? countryFill(id, BOOK_COUNTRIES.has(id))
        : DIMMED_FILL
    ));
  });
  __mapActivePoly = activePoly;
}

function resetWorldFills(series) {
  if (!series) return;
  series.mapPolygons.each(poly => {
    const id = poly.dataItem.get('id');
    poly.set('fill', am5.color(countryFill(id, BOOK_COUNTRIES.has(id))));
  });
  __mapActivePoly = null;
}

function brighten(hex, amount) {
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  return '#' + [r,g,b].map(v => Math.min(255,v+amount).toString(16).padStart(2,'0')).join('');
}

/* ── Panel ──────────────────────────────────────────────────────────────── */

function openPanel(name, sub, books, locKey) {
  const panelEl = document.getElementById('mapPanel');
  const isChinaRoot = locKey === 'CN';

  document.getElementById('mapPanelPlace').textContent = name;
  document.getElementById('mapPanelSub').textContent   = sub;

  /* China root defaults to all books, without filter chips */
  const filtersEl = document.getElementById('mapPanelFilters');
  filtersEl.innerHTML = '';

  renderPanelBooks(books, { showProvinceLabels: !isChinaRoot });
  panelEl.classList.add('open');
  document.body.classList.add('map-panel-open');
}

function closePanel() {
  const panelEl = document.getElementById('mapPanel');
  panelEl.classList.remove('open');
  document.body.classList.remove('map-panel-open');
}

function renderPanelBooks(books, { showProvinceLabels = true } = {}) {
  const container = document.getElementById('mapPanelBooks');
  if (!books.length) {
    container.innerHTML = `<div class="map-panel-empty">No books in this region yet</div>`;
    return;
  }
  container.innerHTML = '';

  const groups = showProvinceLabels
    ? Object.entries(books.reduce((acc, b) => {
      const key = b.province || '__none';
      (acc[key] = acc[key] || []).push(b);
      return acc;
    }, {}))
    : [['__all', books]];

  groups.forEach(([prov, list]) => {
    if (showProvinceLabels && groups.length > 1 && prov !== '__none') {
      const lbl = document.createElement('div');
      lbl.className   = 'mb-province-label';
      lbl.textContent = PROV_NAMES[prov] || prov;
      container.appendChild(lbl);
    }
    list.forEach(b => {
      const row = document.createElement('div');
      row.className = 'mb-row';
      const yearLabel = b.year > 0 ? b.year : Math.abs(b.year) + ' BCE';
      row.innerHTML = `
        <div class="mb-mini-cover" style="background:${b.bg};color:${b.text}">
          <div class="mb-mini-title">${escapeHTML(b.title)}</div>
        </div>
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
        if (window.BOOK_BY_ID?.[b.id]) App.show('book', { id: b.id });
      });
      container.appendChild(row);
    });
  });
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
    el.innerHTML = `<span class="crumb active">World</span>`;
  } else {
    el.innerHTML = `<span class="crumb crumb-link" id="crumbWorld">World</span>
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

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, ch =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[ch]);
}
