/* Marginalia · Profile Map
   Event-driven reading journey for the profile page.
   One completed book = one arrival event.
*/

import { PixelAvatar } from '../components/pixel-avatar/pixel-avatar.js';
import { logError } from '../services/analytics.ts';

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

const COUNTRY_COLOR: Record<string, string> = {
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

const COUNTRY_BOOST: Record<string, string> = {
  CN:'#6a547a', GB:'#4a5a7a', FR:'#4a6a5a', RU:'#4a4a7a',
  JP:'#7a4a6a', US:'#5a7a4a', IN:'#7a6a4a', CO:'#4a7a5a',
  GR:'#4a6a8a', CZ:'#5a5a7a', PT:'#5a4a7a', NG:'#7a5a4a',
  IT:'#7a4a6a', CL:'#6a4a5a',
};

const PALETTE = [
  '#5c3d4a','#3d4f5c','#4a5c3d','#5c4a3d','#3d3d5c',
  '#5c3d3d','#3d5c4a','#5c503d','#4a3d5c','#3d5c5c',
];

const LENS_LABEL: Record<LensDim, string> = {
  authorOrigin: 'Author came from',
  contentLocation: 'Story world',
  readerLocation: 'Read in',
};
const REGION_NAMES = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const WATER_FILL = '#15120f';
const UNLIT_FILL = '#32261d';
const DIMMED_FILL = '#241d16';
const HISTORICAL_LINE = '#8c6f4d';
const ACTIVE_LINE = '#d8af68';

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
  private avatar: PixelAvatar | null = null;
  private avatarWrap: HTMLElement | null = null;
  private bubbleEl: HTMLElement | null = null;
  private events: JourneyEvent[] = [];
  private activeIdx = 0;
  private playing = false;
  private rafId = 0;
  private segFrom = 0;
  private segTo = 0;
  private segT0 = 0;
  private readonly TRAVEL_MS = 2800;
  private readonly DWELL_MS = 2200;
  private hasMountedInitialPlayback = false;

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

  mount(): void {
    const am5 = (window as any).am5;
    const am5map = (window as any).am5map;
    const am5themesAnimated = (window as any).am5themes_Animated;
    const world = (window as any).am5geodata_worldLow;

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
        wheelY: 'zoom',
        pinchZoom: true,
        minZoomLevel: 1,
        maxZoomLevel: 32,
        background: am5.Rectangle.new(this.root, {
          fill: am5.color(WATER_FILL),
          fillOpacity: 1,
        }),
      }));

      this.polygonSeries = this.chart.series.push(am5map.MapPolygonSeries.new(this.root, {
        geoJSON: world,
        exclude: ['AQ'],
      }));
      this.polygonSeries.mapPolygons.template.setAll({
        stroke: am5.color(0x17120f),
        strokeWidth: 0.45,
        fillOpacity: 1,
        interactive: false,
      });
      this.polygonSeries.events.on('datavalidated', () => {
        this.polygonSeries.mapPolygons.each((poly: any) => poly.set('fill', am5.color(UNLIT_FILL)));
        this.refreshScene({ autoPlay: this.playing || !this.hasMountedInitialPlayback });
      });

      this.lineSeries = this.chart.series.push(am5map.MapLineSeries.new(this.root, {}));
      this.lineSeries.mapLines.template.setAll({
        stroke: am5.color(HISTORICAL_LINE),
        strokeWidth: 1,
        strokeOpacity: 0.3,
        strokeDasharray: [3, 5],
      });

      this.activeLineSeries = this.chart.series.push(am5map.MapLineSeries.new(this.root, {}));
      this.activeLineSeries.mapLines.template.setAll({
        stroke: am5.color(ACTIVE_LINE),
        strokeWidth: 1.5,
        strokeOpacity: 0.82,
        strokeDasharray: [4, 2],
      });

      this.pointSeries = this.chart.series.push(am5map.MapPointSeries.new(this.root, {}));
      this.pointSeries.bullets.push(() => {
        const dot = am5.Circle.new(this.root, {
          radius: 3.2,
          fill: am5.color(0xcaa15f),
          stroke: am5.color(0x15120f),
          strokeWidth: 1,
        });
        return am5.Bullet.new(this.root, { sprite: dot });
      });

      this.buildAvatar();
      this.bind();
      this.setDim('journey');
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), { context: 'ProfileMap.mount' });
    }
  }

  destroy(): void {
    this.stopPlayback();
    cancelAnimationFrame(this.rafId);
    this.avatar?.unmount();
    this.root?.dispose();
  }

  setDim(dim: GeoDim): void {
    this.stopPlayback();
    this.dim = dim;
    this.events = buildEvents(this.books, dim);
    this.activeIdx = Math.max(0, this.events.length - 1);
    this.refreshScene({ autoPlay: this.events.length > 1 });
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

    this.avatar = new PixelAvatar({ state: 'read', scale: 3 });
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
    this.avatar?.setState('read');
    this.avatar?.setAccentColor(active.book.spine);
    this.lightCountries(this.activeIdx, active.country);
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
      this.avatar?.setState('walk');
      this.avatar?.setAccentColor(to.book.spine);
      this.placeAvatar(lat, lng);
      this.lightCountries(this.segFrom, to.country);
      this.updateBubble(to, true);
      this.updateCaption(to, true, from);
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    this.avatar?.setState('read');
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
      this.avatarWrap.style.left = `${point.x - 24}px`;
      this.avatarWrap.style.top = `${point.y - 48}px`;
    } catch {
      return;
    }
  }

  private lightCountries(activeIdx: number, activeCountry: string): void {
    if (!this.polygonSeries) return;
    const am5 = (window as any).am5;
    const visitCounts = new Map<string, number>();
    this.events.slice(0, activeIdx + 1).forEach((event) => {
      visitCounts.set(event.country, (visitCounts.get(event.country) ?? 0) + 1);
    });

    this.polygonSeries.mapPolygons.each((poly: any) => {
      const polyId = poly.dataItem?.get('id') ?? '';
      if (!visitCounts.has(polyId)) {
        poly.set('fill', am5.color(DIMMED_FILL));
        return;
      }

      if (polyId === activeCountry) {
        const boost = COUNTRY_BOOST[polyId] || brighten(baseColor(polyId), 42);
        poly.set('fill', am5.color(boost));
        return;
      }

      const visits = visitCounts.get(polyId) ?? 1;
      poly.set('fill', am5.color(visits > 1 ? brighten(baseColor(polyId), 16) : baseColor(polyId)));
    });
  }

  private updateCaption(event: JourneyEvent | null, traveling: boolean, _from: JourneyEvent | null): void {
    if (!this.captionEl) return;
    if (!event) {
      this.captionEl.innerHTML = '<p class="prof-map-caption__empty">No mapped arrivals yet.</p>';
      return;
    }

    const coverStyle = event.book.coverSrc
      ? `background-image:url('${esc(event.book.coverSrc)}');background-size:cover;background-position:center;`
      : `background:${esc(event.book.spine)};`;

    this.captionEl.innerHTML = `
      <div class="prof-map-caption__cover" style="${coverStyle}"></div>
      <div class="prof-map-caption__info">
        <strong class="prof-map-caption__title">${esc(event.book.title)}</strong>
        <span class="prof-map-caption__author">${esc(event.book.author)}</span>
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
