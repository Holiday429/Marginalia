/* Marginalia · Profile Map
   Event-driven reading journey for the profile page.
   One completed book = one arrival event.
*/

import { PixelReader } from '../components/pixel-avatar/pixel-avatar.js';
import { logError } from '../services/analytics.ts';

// amCharts5 modules, loaded on demand the first time a ProfileMap is mounted.
// Module-level + cached promise so repeat profile visits don't re-fetch chunks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let am5: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let am5map: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let am5themesAnimated: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let am5geodataWorldLow: any;
let __amChartsLoadPromise: Promise<void> | null = null;

function loadAmCharts(): Promise<void> {
  if (am5 && am5map && am5themesAnimated && am5geodataWorldLow) return Promise.resolve();
  if (__amChartsLoadPromise) return __amChartsLoadPromise;
  __amChartsLoadPromise = Promise.all([
    import('@amcharts/amcharts5'),
    import('@amcharts/amcharts5/map'),
    import('@amcharts/amcharts5/themes/Animated'),
    import('@amcharts/amcharts5-geodata/worldLow'),
  ]).then(([am5Mod, am5mapMod, animatedThemeMod, worldLowMod]) => {
    am5 = am5Mod;
    am5map = am5mapMod;
    am5themesAnimated = animatedThemeMod.default;
    am5geodataWorldLow = worldLowMod.default;
  });
  return __amChartsLoadPromise;
}

type GeoDim = 'journey' | 'authorOrigin' | 'contentLocation' | 'readerLocation';
type LensDim = Exclude<GeoDim, 'journey'>;

interface ProfileBook {
  id: string;
  title: string;
  author: string;
  spine: string;
  status?: string;
  finishedAt?: number;
  userNote?: string;
  coverSrc?: string;
  geo?: {
    authorOrigin?: { country: string; city?: string };
    contentLocation?: { country: string; city?: string };
    readerLocation?: { country: string; city?: string };
  };
}

interface JourneyEvent {
  book: ProfileBook;
  country: string;
  city?: string;
  lat: number;
  lng: number;
  lens: LensDim;
  reason: string;
  stamp: string;
}

// Light retro palette, shared with the Map view (src/map/map.js).
// 14 chromatically distinct families so neighbouring countries never collapse
// into the same muted hue on the dark journey map. Keep both maps in sync.
const COUNTRY_COLOR: Record<string, string> = {
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

const COUNTRY_BOOST: Record<string, string> = {
  CN:'#e6ab63', GB:'#dba074', FR:'#7fb89c', RU:'#c4d6ba',
  JP:'#74a4b0', US:'#f6d98a', IN:'#f6d98a', CO:'#f6d98a',
  GR:'#e6ab63', CZ:'#d87585', PT:'#e6ab63', NG:'#f6d98a',
  IT:'#d18a9b', CL:'#b0bd66',
};

const PALETTE = [
  '#eec86f','#d5944f','#cf7a52','#c75d68','#bf7185',
  '#a385b5','#6f7fa8','#5f8a96','#7fae8a','#9caa4f',
  '#d2a878','#8a9bb0','#b0c4a6','#d98f7a',
];

const LENS_LABEL: Record<LensDim, string> = {
  authorOrigin: 'Author came from',
  contentLocation: 'Story world',
  readerLocation: 'Read in',
};
const REGION_NAMES = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const UNLIT_FILL = '#564636';
const HISTORICAL_LINE = '#9f845b';
const ACTIVE_LINE = '#e3bc75';

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  CN: [35.86, 104.19], US: [37.09, -95.71], GB: [55.37, -3.43],
  FR: [46.23,   2.21], DE: [51.16,  10.45], JP: [36.20, 138.25],
  RU: [61.52,  105.31], IT: [41.87,  12.56], ES: [40.46,  -3.74],
  PT: [39.39,  -8.22], AR: [-38.41, -63.61], BR: [-14.23, -51.93],
  IN: [20.59,  78.96], KR: [35.90, 127.76], MX: [23.63, -102.55],
  AU: [-25.27, 133.77], CA: [56.13, -106.34], ZA: [-30.55, 22.93],
  NG: [9.08,   8.67], EG: [26.82,  30.80], IR: [32.42,  53.68],
  TR: [38.96,  35.24], PL: [51.91,  19.14], NL: [52.13,   5.29],
  SE: [60.12,  18.64], NO: [60.47,   8.47], DK: [56.26,   9.50],
  CZ: [49.81,  15.47], AT: [47.51,  14.55], CH: [46.82,   8.22],
  BE: [50.50,   4.46], GR: [39.07,  21.82], HU: [47.16,  19.50],
  RO: [45.94,  24.96], UA: [48.37,  31.16], IL: [31.04,  34.85],
  SA: [23.88,  45.07], AE: [23.42,  53.84], TH: [15.87,  100.99],
  VN: [14.05, 108.27], ID: [-0.79, 113.92], PH: [12.87, 121.77],
  CL: [-35.67, -71.54], CO: [4.57,  -74.29], PE: [-9.19, -75.01],
  MA: [31.79,  -7.09], TN: [33.88,   9.53], KE: [-0.02,  37.90],
  GH: [7.95,  -1.02], ET: [9.14,  40.49], SN: [14.49, -14.45],
};

function hashStr(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return hash;
}

function baseColor(country: string): string {
  return COUNTRY_COLOR[country] || PALETTE[Math.abs(hashStr(country)) % PALETTE.length];
}

function brighten(hex: string, amount: number): string {
  const rgb = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) => parseInt(part, 16));
  const next = rgb.map((value) => Math.max(0, Math.min(255, value + amount)));
  return `#${next.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function getCoords(country: string): [number, number] | null {
  return COUNTRY_CENTROIDS[country] ?? null;
}

function resolveLens(book: ProfileBook, dim: GeoDim): { geo: { country: string; city?: string }; lens: LensDim; reason: string } | null {
  if (dim !== 'journey') {
    const geo = book.geo?.[dim];
    if (!geo?.country) return null;
    return { geo, lens: dim, reason: LENS_LABEL[dim] };
  }

  const priority: LensDim[] = ['contentLocation', 'authorOrigin', 'readerLocation'];
  for (const lens of priority) {
    const geo = book.geo?.[lens];
    if (geo?.country) return { geo, lens, reason: LENS_LABEL[lens] };
  }
  return null;
}

function buildEvents(books: ProfileBook[], dim: GeoDim): JourneyEvent[] {
  return [...books]
    .filter((book) => isFinishedStatus(book.status) && (book.finishedAt ?? 0) > 0)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
    .map((book) => {
      const lens = resolveLens(book, dim);
      if (!lens) return null;
      const coords = getCoords(lens.geo.country);
      if (!coords) return null;
      return {
        book,
        country: lens.geo.country,
        city: lens.geo.city,
        lat: coords[0],
        lng: coords[1],
        lens: lens.lens,
        reason: lens.reason,
        stamp: new Date(book.finishedAt ?? Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      } as JourneyEvent;
    })
    .filter((event): event is JourneyEvent => Boolean(event));
}

export class ProfileMap {
  private mapEl: HTMLElement;
  private captionEl: HTMLElement | null;
  private railEl: HTMLElement | null;
  private playBtn: HTMLButtonElement | null;
  private books: ProfileBook[];
  private dim: GeoDim = 'journey';
  private root: any = null;
  private chart: any = null;
  private polygonSeries: any = null;
  private lineSeries: any = null;
  private activeLineSeries: any = null;
  private pointSeries: any = null;
  private avatar: PixelReader | null = null;
  private avatarWrap: HTMLElement | null = null;
  private lastAvatarX: number | null = null;
  private bubbleEl: HTMLElement | null = null;
  private events: JourneyEvent[] = [];
  private activeIdx = 0;
  private playing = false;
  private colorsRevealed = false;
  private rafId = 0;
  private segFrom = 0;
  private segTo = 0;
  private segT0 = 0;
  private readonly TRAVEL_MS = 2800;
  private readonly DWELL_MS = 2200;
  private hasMountedInitialPlayback = false;
  private gestureArmed = false;
  private mapPointerDownHandler: ((event: PointerEvent) => void) | null = null;
  private docPointerDownHandler: ((event: PointerEvent) => void) | null = null;

  constructor(
    mapEl: HTMLElement,
    captionEl: HTMLElement | null,
    railEl: HTMLElement | null,
    playBtn: HTMLButtonElement | null,
    books: ProfileBook[],
  ) {
    this.mapEl = mapEl;
    this.captionEl = captionEl;
    this.railEl = railEl;
    this.playBtn = playBtn;
    this.books = books;
  }

  async mount(): Promise<void> {
    try {
      await loadAmCharts();
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), { context: 'ProfileMap amCharts import' });
      this.mapEl.classList.add('prof-map--unavailable');
      return;
    }

    const world = am5geodataWorldLow;
    if (!am5 || !am5map || !world) {
      this.mapEl.classList.add('prof-map--unavailable');
      return;
    }

    try {
      this.root = am5.Root.new(this.mapEl.id || this.ensureId());
      this.root._logo?.set('forceHidden', true);
      this.root.setThemes([am5themesAnimated.new(this.root)]);

      this.chart = this.root.container.children.push(am5map.MapChart.new(this.root, {
        projection: am5map.geoNaturalEarth1(),
        panX: 'translateX',
        panY: 'translateY',
        wheelY: 'none',
        pinchZoom: false,
        zoomStep: 1.06,
        minZoomLevel: 1,
        maxZoomLevel: 32,
      }));

      this.polygonSeries = this.chart.series.push(am5map.MapPolygonSeries.new(this.root, {
        geoJSON: world,
        exclude: ['AQ'],
      }));
      this.polygonSeries.mapPolygons.template.setAll({
        stroke: am5.color(0x8a7152),
        strokeWidth: 0.8,
        strokeOpacity: 0.78,
        fillOpacity: 1,
        interactive: false,
      });
      this.polygonSeries.events.on('datavalidated', () => {
        this.polygonSeries.mapPolygons.each((poly: any) => poly.set('fill', am5.color(UNLIT_FILL)));
        this.refreshScene({ autoPlay: this.playing });
      });

      this.lineSeries = this.chart.series.push(am5map.MapLineSeries.new(this.root, {}));
      this.lineSeries.mapLines.template.setAll({
        stroke: am5.color(HISTORICAL_LINE),
        strokeWidth: 1.1,
        strokeOpacity: 0.38,
        strokeDasharray: [3, 5],
        // Great-circle curve so the dashed line matches the avatar's
        // geodesicInterp path exactly (default straight segments diverge).
        lineType: 'geodesic',
      });

      this.activeLineSeries = this.chart.series.push(am5map.MapLineSeries.new(this.root, {}));
      this.activeLineSeries.mapLines.template.setAll({
        stroke: am5.color(ACTIVE_LINE),
        strokeWidth: 1.7,
        strokeOpacity: 0.9,
        strokeDasharray: [4, 2],
        lineType: 'geodesic',
      });

      this.pointSeries = this.chart.series.push(am5map.MapPointSeries.new(this.root, {}));
      this.pointSeries.bullets.push(() => {
        const dot = am5.Circle.new(this.root, {
          radius: 3.6,
          fill: am5.color(0xd6af69),
          stroke: am5.color(0x120e0b),
          strokeWidth: 1,
        });
        return am5.Bullet.new(this.root, { sprite: dot });
      });

      this.buildAvatar();
      this.bind();
      this.setGestureArmed(false);
      this.setDim('journey');
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), { context: 'ProfileMap.mount' });
    }
  }

  destroy(): void {
    this.stopPlayback();
    cancelAnimationFrame(this.rafId);
    if (this.mapPointerDownHandler) {
      this.mapEl.removeEventListener('pointerdown', this.mapPointerDownHandler);
      this.mapPointerDownHandler = null;
    }
    if (this.docPointerDownHandler) {
      document.removeEventListener('pointerdown', this.docPointerDownHandler, true);
      this.docPointerDownHandler = null;
    }
    this.avatar?.unmount();
    this.root?.dispose();
  }

  setDim(dim: GeoDim): void {
    this.stopPlayback();
    this.dim = dim;
    this.colorsRevealed = false;
    this.events = buildEvents(this.books, dim);
    this.activeIdx = Math.max(0, this.events.length - 1);
    this.refreshScene({ autoPlay: false });
  }

  private bind(): void {
    this.mapEl.addEventListener('prof:dim-change', (event: Event) => {
      const dim = (event as CustomEvent).detail?.dim as GeoDim;
      if (dim) this.setDim(dim);
    });

    this.playBtn?.addEventListener('click', () => {
      if (this.playing) this.stopPlayback();
      else this.startPlayback();
      this.syncPlayButton();
    });

    this.railEl?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-journey-idx]');
      if (!button) return;
      const idx = Number(button.dataset.journeyIdx);
      if (!Number.isFinite(idx)) return;
      this.stopPlayback();
      this.colorsRevealed = true;
      this.activeIdx = idx;
      this.renderRail();
      this.renderStatic();
      this.syncPlayButton();
    });

    // Zoom buttons (siblings of mapEl inside .prof-map-wrap)
    const wrap = this.mapEl.parentElement;
    wrap?.querySelector('#profMapZoomIn')?.addEventListener('click', () => this.chart?.zoomIn());
    wrap?.querySelector('#profMapZoomOut')?.addEventListener('click', () => this.chart?.zoomOut());
    wrap?.querySelector('#profMapZoomFit')?.addEventListener('click', () => {
      this.chart?.goHome();
    });

    this.mapPointerDownHandler = () => {
      this.setGestureArmed(true);
    };
    this.mapEl.addEventListener('pointerdown', this.mapPointerDownHandler);

    this.docPointerDownHandler = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const wrapEl = this.mapEl.parentElement;
      if (wrapEl?.contains(target)) return;
      this.setGestureArmed(false);
    };
    document.addEventListener('pointerdown', this.docPointerDownHandler, true);
  }

  private ensureId(): string {
    if (!this.mapEl.id) this.mapEl.id = `profMap_${Math.random().toString(36).slice(2)}`;
    return this.mapEl.id;
  }

  private buildAvatar(): void {
    this.mapEl.style.position = 'relative';

    // bubble lives directly in mapEl so it's never clipped by avatarWrap
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'prof-map-bubble';
    this.bubbleEl.setAttribute('aria-hidden', 'true');
    this.bubbleEl.innerHTML = `
      <span class="prof-map-bubble__place"></span>
      <span class="prof-map-bubble__note"></span>
    `;
    this.mapEl.appendChild(this.bubbleEl);

    this.avatarWrap = document.createElement('div');
    this.avatarWrap.className = 'prof-map-avatar';
    this.mapEl.appendChild(this.avatarWrap);

    this.avatar = new PixelReader({ state: 'traveling', size: 'md' });
    this.avatar.mount(this.avatarWrap);
  }

  private updateBubble(event: JourneyEvent | null, traveling: boolean): void {
    if (!this.bubbleEl) return;

    if (traveling || !event) {
      this.bubbleEl.classList.remove('is-visible');
      return;
    }

    const placeEl = this.bubbleEl.querySelector<HTMLElement>('.prof-map-bubble__place');
    const noteEl  = this.bubbleEl.querySelector<HTMLElement>('.prof-map-bubble__note');

    if (placeEl) placeEl.textContent = countryName(event.country);
    if (noteEl) {
      noteEl.textContent = event.book.userNote || '';
      noteEl.style.display = event.book.userNote ? '' : 'none';
    }

    this.bubbleEl.classList.add('is-visible');
    this.positionBubble();
  }

  private positionBubble(): void {
    if (!this.bubbleEl || !this.avatarWrap) return;
    const mapRect = this.mapEl.getBoundingClientRect();
    const avatarRect = this.avatarWrap.getBoundingClientRect();
    const bubbleW = 140;
    const bubbleH = this.bubbleEl.offsetHeight || 52;
    const gap = 6;
    const avatarCx = avatarRect.left - mapRect.left + avatarRect.width / 2;
    const avatarTop = avatarRect.top - mapRect.top;

    // horizontal: clamp so bubble stays inside map
    let left = avatarCx - bubbleW / 2;
    left = Math.max(8, Math.min(left, mapRect.width - bubbleW - 8));

    // vertical: prefer above avatar; flip below if clipped at top
    let top = avatarTop - bubbleH - gap;
    if (top < 8) top = avatarTop + avatarRect.height + gap;

    this.bubbleEl.style.left = `${left}px`;
    this.bubbleEl.style.top  = `${top}px`;

    // tail direction hint
    this.bubbleEl.classList.toggle('is-below', top > avatarTop);
  }

  private renderRail(): void {
    if (!this.railEl) return;
    if (!this.events.length) {
      this.railEl.innerHTML = '<p class="prof-map-rail__empty">Finish a book with location data to create your first arrival event.</p>';
      return;
    }
    this.railEl.innerHTML = this.events.map((event, idx) => `
      <button class="prof-map-rail__item${idx === this.activeIdx ? ' is-active' : ''}" type="button" data-journey-idx="${idx}">
        <span class="prof-map-rail__idx">${String(idx + 1).padStart(2, '0')}</span>
        <span class="prof-map-rail__text">
          <strong>${esc(event.book.title)}</strong>
          <span>${esc(event.reason)} · ${esc(countryName(event.country))}</span>
        </span>
      </button>
    `).join('');
  }

  private renderStatic(): void {
    this.pointSeries?.data.clear();
    this.lineSeries?.data.clear();
    this.activeLineSeries?.data.clear();

    if (!this.events.length) {
      this.updateBubble(null, false);
      this.updateCaption(null, false, null);
      return;
    }

    this.events.forEach((event) => {
      this.pointSeries.data.push({
        geometry: { type: 'Point', coordinates: [event.lng, event.lat] },
      });
    });

    for (let idx = 1; idx <= this.activeIdx; idx++) {
      const from = this.events[idx - 1];
      const to = this.events[idx];
      if (from.country === to.country) continue;
      this.lineSeries.data.push({
        geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
      });
    }

    const active = this.events[this.activeIdx];
    const previous = this.activeIdx > 0 ? this.events[this.activeIdx - 1] : null;
    this.placeAvatar(active.lat, active.lng);
    this.avatar?.setState('reading');
    this.avatar?.setAccentColor(active.book.spine);
    if (this.colorsRevealed) this.lightCountries(this.activeIdx, active.country);
    else this.resetCountryLighting();
    this.updateBubble(active, false);
    this.updateCaption(active, false, previous);
    this.renderRail();
  }

  private refreshScene({ autoPlay = false }: { autoPlay?: boolean } = {}): void {
    this.renderRail();
    this.renderStatic();
    if (autoPlay && this.events.length > 1) {
      this.hasMountedInitialPlayback = true;
      this.startPlayback();
    }
    this.syncPlayButton();
  }

  private startPlayback(): void {
    if (this.events.length <= 1) return;
    if (this.activeIdx >= this.events.length - 1) this.activeIdx = 0;
    this.colorsRevealed = true;
    this.playing = true;
    this.renderRail();
    this.segFrom = this.activeIdx;
    this.segTo = Math.min(this.events.length - 1, this.activeIdx + 1);
    this.segT0 = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private stopPlayback(): void {
    this.playing = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.segT0 = 0;
  }

  private tick = (timestamp: number): void => {
    if (!this.playing) return;
    if (!this.events.length || this.segFrom >= this.events.length - 1) {
      this.stopPlayback();
      this.syncPlayButton();
      return;
    }

    const from = this.events[this.segFrom];
    const to = this.events[this.segTo];
    if (!this.segT0) this.segT0 = timestamp;

    const sameCountry = from.country === to.country;
    const segmentMs = sameCountry ? 0 : this.TRAVEL_MS;
    const totalMs = segmentMs + this.DWELL_MS;
    const elapsed = timestamp - this.segT0;

    this.lineSeries?.data.clear();
    for (let idx = 1; idx <= this.segFrom; idx++) {
      const prev = this.events[idx - 1];
      const next = this.events[idx];
      if (prev.country === next.country) continue;
      this.lineSeries.data.push({
        geometry: { type: 'LineString', coordinates: [[prev.lng, prev.lat], [next.lng, next.lat]] },
      });
    }
    this.activeLineSeries?.data.clear();
    if (!sameCountry) {
      this.activeLineSeries.data.push({
        geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
      });
    }

    if (!sameCountry && elapsed < this.TRAVEL_MS) {
      const progress = this.easeInOut(elapsed / this.TRAVEL_MS);
      const [lat, lng] = this.geodesicInterp(from.lat, from.lng, to.lat, to.lng, progress);
      this.avatar?.setState('traveling');
      this.avatar?.setAccentColor(to.book.spine);
      this.placeAvatar(lat, lng);
      this.lightCountries(this.segFrom, to.country);
      this.updateBubble(to, true);
      this.updateCaption(to, true, from);
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    this.avatar?.setState('reading');
    this.avatar?.setAccentColor(to.book.spine);
    this.placeAvatar(to.lat, to.lng);
    this.lightCountries(this.segTo, to.country);
    this.updateBubble(to, false);
    this.updateCaption(to, false, from);

    if (elapsed < totalMs) {
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    this.activeIdx = this.segTo;
    this.segFrom = this.activeIdx;
    this.segTo = Math.min(this.events.length - 1, this.activeIdx + 1);
    this.segT0 = timestamp;
    this.renderRail();

    if (this.activeIdx >= this.events.length - 1) {
      this.stopPlayback();
      this.renderStatic();
      this.syncPlayButton();
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // Spherical linear interpolation between two lat/lng points (great-circle arc).
  // Matches amCharts MapLineSeries geodesic path so the avatar tracks the dashed line.
  private geodesicInterp(
    fromLat: number, fromLng: number,
    toLat: number,   toLng: number,
    t: number,
  ): [number, number] {
    const toRad = (d: number) => d * Math.PI / 180;
    const toDeg = (r: number) => r * 180 / Math.PI;
    const φ1 = toRad(fromLat), λ1 = toRad(fromLng);
    const φ2 = toRad(toLat),   λ2 = toRad(toLng);

    // Convert to unit-sphere Cartesian
    const x1 = Math.cos(φ1) * Math.cos(λ1), y1 = Math.cos(φ1) * Math.sin(λ1), z1 = Math.sin(φ1);
    const x2 = Math.cos(φ2) * Math.cos(λ2), y2 = Math.cos(φ2) * Math.sin(λ2), z2 = Math.sin(φ2);

    const dot = Math.min(1, x1*x2 + y1*y2 + z1*z2);
    const omega = Math.acos(dot);

    let x: number, y: number, z: number;
    if (Math.abs(omega) < 1e-10) {
      // points are (nearly) identical — lerp
      x = x1 + (x2 - x1) * t;
      y = y1 + (y2 - y1) * t;
      z = z1 + (z2 - z1) * t;
    } else {
      const s = Math.sin(omega);
      const a = Math.sin((1 - t) * omega) / s;
      const b = Math.sin(t * omega) / s;
      x = a * x1 + b * x2;
      y = a * y1 + b * y2;
      z = a * z1 + b * z2;
    }

    const lat = toDeg(Math.asin(Math.max(-1, Math.min(1, z))));
    const lng = toDeg(Math.atan2(y, x));
    return [lat, lng];
  }

  private placeAvatar(lat: number, lng: number): void {
    if (!this.avatarWrap || !this.chart) return;
    try {
      const point = this.chart.convert({ longitude: lng, latitude: lat });
      if (!point) return;
      if (this.lastAvatarX !== null) {
        this.avatar?.setDirection(point.x >= this.lastAvatarX ? 'right' : 'left');
      }
      this.lastAvatarX = point.x;
      const width = this.avatarWrap.offsetWidth || 64;
      const height = this.avatarWrap.offsetHeight || 64;
      this.avatarWrap.style.left = `${point.x - width / 2}px`;
      this.avatarWrap.style.top = `${point.y - height * 0.82}px`;
    } catch {
      return;
    }
  }

  private lightCountries(activeIdx: number, activeCountry: string): void {
    if (!this.polygonSeries) return;
    const visitCounts = new Map<string, number>();
    this.events.slice(0, activeIdx + 1).forEach((event) => {
      visitCounts.set(event.country, (visitCounts.get(event.country) ?? 0) + 1);
    });

    this.polygonSeries.mapPolygons.each((poly: any) => {
      const polyId = poly.dataItem?.get('id') ?? '';
      if (!visitCounts.has(polyId)) {
        // Unvisited countries keep the readable land tone (not a darker dim),
        // so the map stays legible during playback like the static view.
        poly.set('fill', am5.color(UNLIT_FILL));
        return;
      }

      if (polyId === activeCountry) {
        const boost = COUNTRY_BOOST[polyId] || brighten(baseColor(polyId), 20);
        poly.set('fill', am5.color(boost));
        return;
      }

      const visits = visitCounts.get(polyId) ?? 1;
      poly.set('fill', am5.color(visits > 1 ? brighten(baseColor(polyId), 10) : baseColor(polyId)));
    });
  }

  private resetCountryLighting(): void {
    if (!this.polygonSeries) return;
    this.polygonSeries.mapPolygons.each((poly: any) => {
      poly.set('fill', am5.color(UNLIT_FILL));
    });
  }

  private setGestureArmed(enabled: boolean): void {
    if (this.gestureArmed === enabled) return;
    this.gestureArmed = enabled;
    if (!this.chart) return;
    this.chart.set('wheelY', enabled ? 'zoom' : 'none');
    this.chart.set('pinchZoom', enabled);
    this.mapEl.classList.toggle('is-zoom-armed', enabled);
  }

  private updateCaption(event: JourneyEvent | null, traveling: boolean, _from: JourneyEvent | null): void {
    if (!this.captionEl) return;
    if (!event) {
      this.captionEl.innerHTML = '<p class="prof-map-caption__empty">No mapped arrivals yet.</p>';
      return;
    }
    if (!this.colorsRevealed) {
      this.captionEl.innerHTML = '';
      return;
    }

    const coverStyle = event.book.coverSrc
      ? `background-image:url('${esc(event.book.coverSrc)}');background-size:cover;background-position:center;`
      : `background:${esc(event.book.spine)};`;

    this.captionEl.innerHTML = `
      <div class="prof-map-caption__cover" style="${coverStyle}"></div>
      <div class="prof-map-caption__info">
        <strong class="prof-map-caption__title">${esc(event.book.title)}</strong>
        <span class="prof-map-caption__stamp">${esc(event.stamp)}</span>
      </div>
    `;
  }

  private syncPlayButton(): void {
    if (!this.playBtn) return;
    this.playBtn.disabled = this.events.length <= 1;
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pause journey' : 'Play journey');
    // swap ▶ / ⏸ SVG inner content
    this.playBtn.innerHTML = this.playing
      ? `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>`
      : `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><polygon points="4,2 14,8 4,14"/></svg>`;
  }
}

function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function countryName(code: string): string {
  return REGION_NAMES?.of(code) || code;
}

function isFinishedStatus(status: unknown): boolean {
  return status === 'read' || status === 'finished';
}
