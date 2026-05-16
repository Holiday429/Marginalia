/* Marginalia · Profile Map
   Read-only amCharts 5 map for the public profile page.
   Shows the user's reading journey by geographic dimension.
   Reuses the same amCharts root already loaded in index.html.
   No hover detail panel — just dot markers + animated pixel avatar traveler.
*/

import { PixelAvatar } from '../components/pixel-avatar/pixel-avatar.js';
import { logError } from '../services/analytics.ts';

type GeoDim = 'authorOrigin' | 'contentLocation' | 'readerLocation';

interface ProfileBook {
  id: string;
  title: string;
  author: string;
  spine: string;
  geo?: {
    authorOrigin?:    { country: string; city?: string };
    contentLocation?: { country: string; city?: string };
    readerLocation?:  { country: string; city?: string };
  };
  finishedAt?: number;
}

interface MapStop {
  book: ProfileBook;
  country: string;
  city?: string;
  lat: number;
  lng: number;
}

// Approximate country centroids (covers the most common author origins)
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

function getCoords(country: string): [number, number] | null {
  return COUNTRY_CENTROIDS[country] ?? null;
}

function buildStops(books: ProfileBook[], dim: GeoDim): MapStop[] {
  const stops: MapStop[] = [];
  const seen = new Set<string>();

  const sorted = [...books].sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  for (const book of sorted) {
    const geoEntry = book.geo?.[dim];
    if (!geoEntry?.country) continue;
    const coords = getCoords(geoEntry.country);
    if (!coords) continue;
    const key = `${geoEntry.country}:${book.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stops.push({ book, country: geoEntry.country, city: geoEntry.city, lat: coords[0], lng: coords[1] });
  }
  return stops;
}

export class ProfileMap {
  private mapEl: HTMLElement;
  private captionEl: HTMLElement | null;
  private books: ProfileBook[];
  private dim: GeoDim = 'authorOrigin';
  private root: any = null;
  private chart: any = null;
  private travelerSeries: any = null;
  private pointSeries: any = null;
  private lineSeries: any = null;
  private stops: MapStop[] = [];
  private avatar: PixelAvatar | null = null;
  private avatarWrap: HTMLElement | null = null;
  private rafId = 0;
  private stopIdx = 0;
  private animT0 = 0;
  private playing = true;
  private readonly SEG_MS = 2600;
  private readonly DWELL_MS = 2000;

  constructor(mapEl: HTMLElement, captionEl: HTMLElement | null, books: ProfileBook[]) {
    this.mapEl     = mapEl;
    this.captionEl = captionEl;
    this.books     = books;
  }

  mount(): void {
    const am5 = (window as any).am5;
    const am5map = (window as any).am5map;
    const am5themes_Animated = (window as any).am5themes_Animated;
    const am5geodata_worldLow = (window as any).am5geodata_worldLow;

    if (!am5 || !am5map || !am5geodata_worldLow) {
      this.mapEl.classList.add('prof-map--unavailable');
      return;
    }

    try {
      this.root = am5.Root.new(this.mapEl.id || this._ensureId());
      this.root._logo?.set('forceHidden', true);
      this.root.setThemes([am5themes_Animated.new(this.root)]);

      this.chart = this.root.container.children.push(am5map.MapChart.new(this.root, {
        projection: am5map.geoNaturalEarth1(),
        panX: 'none',
        panY: 'none',
        wheelY: 'none',
        minZoomLevel: 1,
        maxZoomLevel: 1,
      }));

      // Base polygons
      const base = this.chart.series.push(am5map.MapPolygonSeries.new(this.root, {
        geoJSON: am5geodata_worldLow,
        exclude: ['AQ'],
      }));
      base.mapPolygons.template.setAll({
        fill: am5.color(0x2a2318),
        stroke: am5.color(0x1a1510),
        strokeWidth: 0.4,
        fillOpacity: 1,
        interactive: false,
      });

      // Lines
      this.lineSeries = this.chart.series.push(am5map.MapLineSeries.new(this.root, {}));
      this.lineSeries.mapLines.template.setAll({
        stroke: am5.color(0xc49a52),
        strokeWidth: 1,
        strokeOpacity: 0.3,
        strokeDasharray: [3, 5],
      });

      // Stop dots
      this.pointSeries = this.chart.series.push(am5map.MapPointSeries.new(this.root, {}));
      this.pointSeries.bullets.push(() => {
        const dot = am5.Circle.new(this.root, {
          radius: 3,
          fill: am5.color(0xc49a52),
          stroke: am5.color(0x15120f),
          strokeWidth: 1,
        });
        return am5.Bullet.new(this.root, { sprite: dot });
      });

      // Traveler series (invisible — we use a DOM avatar overlay instead)
      this.travelerSeries = this.chart.series.push(am5map.MapPointSeries.new(this.root, {}));
      this.travelerSeries.bullets.push(() => {
        const dot = am5.Circle.new(this.root, { radius: 0 });
        return am5.Bullet.new(this.root, { sprite: dot });
      });

      // Build avatar overlay
      this._buildAvatarOverlay();

      // Listen for dimension change from pills
      this.mapEl.addEventListener('prof:dim-change', (e: Event) => {
        const dim = (e as CustomEvent).detail?.dim as GeoDim;
        if (dim) this.setDim(dim);
      });

      this._render();
    } catch (err) {
      logError(err instanceof Error ? err : new Error(String(err)), { context: 'ProfileMap.mount' });
    }
  }

  setDim(dim: GeoDim): void {
    this.dim = dim;
    cancelAnimationFrame(this.rafId);
    this.stopIdx = 0;
    this.animT0 = 0;
    this._render();
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.avatar?.unmount();
    this.root?.dispose();
  }

  private _ensureId(): string {
    if (!this.mapEl.id) this.mapEl.id = `profMap_${Math.random().toString(36).slice(2)}`;
    return this.mapEl.id;
  }

  private _buildAvatarOverlay(): void {
    this.avatarWrap = document.createElement('div');
    this.avatarWrap.className = 'prof-map-avatar';
    this.mapEl.style.position = 'relative';
    this.mapEl.appendChild(this.avatarWrap);

    this.avatar = new PixelAvatar({ state: 'walk', scale: 3 });
    this.avatar.mount(this.avatarWrap);
  }

  private _render(): void {
    this.stops = buildStops(this.books, this.dim);

    // Clear previous series data
    this.pointSeries?.data.clear();
    this.lineSeries?.data.clear();
    this.travelerSeries?.data.clear();

    if (!this.stops.length) return;

    // Add stop dots
    this.stops.forEach(s => {
      this.pointSeries.data.push({
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      });
    });

    // Add lines between consecutive stops
    for (let i = 1; i < this.stops.length; i++) {
      const a = this.stops[i-1], b = this.stops[i];
      this.lineSeries.data.push({
        geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      });
    }

    // Place traveler at first stop
    this.travelerSeries.data.push({
      geometry: { type: 'Point', coordinates: [this.stops[0].lng, this.stops[0].lat] },
    });

    this._updateCaption(0);
    this._startAnimation();
  }

  private _easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2*t) * t;
  }

  private _startAnimation(): void {
    cancelAnimationFrame(this.rafId);
    if (this.stops.length < 2) {
      this.avatar?.setState('read');
      return;
    }
    this.animT0 = 0;
    this.rafId = requestAnimationFrame(this._animTick);
  }

  private _animTick = (ts: number): void => {
    if (!this.animT0) this.animT0 = ts;
    const elapsed = ts - this.animT0;
    const total = this.SEG_MS + this.DWELL_MS;
    const cycle = elapsed % (total * this.stops.length);
    const segGlobal = Math.floor(cycle / total);
    const segElapsed = cycle % total;

    const fromIdx = segGlobal % this.stops.length;
    const toIdx   = (fromIdx + 1) % this.stops.length;

    if (fromIdx !== this.stopIdx) {
      this.stopIdx = fromIdx;
      this._updateCaption(fromIdx);
    }

    if (segElapsed < this.SEG_MS) {
      // Traveling
      this.avatar?.setState('walk');
      const t = this._easeInOut(segElapsed / this.SEG_MS);
      const from = this.stops[fromIdx], to = this.stops[toIdx];
      const lat = from.lat + (to.lat - from.lat) * t;
      const lng = from.lng + (to.lng - from.lng) * t;
      this._placeAvatarAt(lat, lng);
    } else {
      // Dwelling
      this.avatar?.setState('read');
      const stop = this.stops[fromIdx];
      this._placeAvatarAt(stop.lat, stop.lng);
    }

    this.rafId = requestAnimationFrame(this._animTick);
  };

  private _placeAvatarAt(lat: number, lng: number): void {
    if (!this.avatarWrap || !this.chart) return;
    try {
      const point = this.chart.convert({ longitude: lng, latitude: lat });
      if (!point) return;
      const wrap = this.avatarWrap;
      wrap.style.left = `${point.x - 24}px`;
      wrap.style.top  = `${point.y - 48}px`;
    } catch {
      // Chart may not be ready yet
    }
  }

  private _updateCaption(idx: number): void {
    if (!this.captionEl) return;
    const stop = this.stops[idx];
    if (!stop) return;
    this.captionEl.removeAttribute('hidden');
    this.captionEl.innerHTML = `
      <span class="prof-map-caption__step">${idx + 1} / ${this.stops.length}</span>
      <em class="prof-map-caption__title">${_esc(stop.book.title)}</em>
      <span class="prof-map-caption__author">${_esc(stop.book.author)}</span>
      <span class="prof-map-caption__place">${stop.city ? _esc(stop.city) + ', ' : ''}${_esc(stop.country)}</span>
    `;
    // Sync avatar color to book spine
    if (this.avatar && stop.book.spine) this.avatar.setAccentColor(stop.book.spine);
  }
}

function _esc(s: string): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
