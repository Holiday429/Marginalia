import { cycleReadingIdentityVariant } from './reading-identity-adapter.ts';
import { getReadingIdentityResult } from './reading-identity-service.ts';
import { PixelReader } from '../components/pixel-avatar/pixel-avatar.js';
import { HeroBook } from '../components/hero-book/hero-book.js';
import '../components/hero-book/hero-book.css';
import type {
  ReadingIdentityAxis,
  ReadingIdentityResult,
} from './reading-identity-types.ts';

export interface IdentityGenre {
  label: string;
  pct: number;
  count: number;
}

export interface IdentityBook {
  title: string;
  author: string;
  genre?: string;
  language?: string;
  year?: number;
  status?: string;
}

export interface IdentityHighlight {
  quote: string;
  bookTitle?: string;
}

interface RidRenderOptions {
  allowRegenerate?: boolean;
  genres?: IdentityGenre[];
}

const TYPE_SPEED_MS = 18;
const REGEN_SWAP_MS = 700;
const AXIS_STAGGER_MS = 120;
const BOOK_CENTERING_MS = 320;
const GENERATE_REVEAL_MS = 1760;
const SCENE_IMAGE_URL = '/profile-room-pixel.png';
const sceneAvatarByHost = new WeakMap<HTMLElement, PixelReader>();
const heroBookByHost = new WeakMap<HTMLElement, HeroBook>();

function mountGateHeroBook(host: HTMLElement): void {
  const mount = host.querySelector<HTMLElement>('#profRidHeroBook');
  if (!mount) return;
  heroBookByHost.get(host)?.unmount();
  const book = new HeroBook({ height: 320 });
  book.mount(mount);
  heroBookByHost.set(host, book);
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bookSceneHTML(): string {
  return `
    <div class="prof-rid-book" aria-hidden="true">
      <div class="prof-rid-book__mount" id="profRidHeroBook"></div>
      <div class="prof-rid-book__shadow"></div>
    </div>
  `;
}

function ctaStateHTML(): string {
  return `
    <section class="prof-rid-stage prof-rid-stage--cta" aria-label="Reading Identity">
      <div class="prof-rid-stage__room" style="background-image:url('${SCENE_IMAGE_URL}')">
        <div class="prof-rid-stage__room-vignette" aria-hidden="true"></div>
      </div>
      <div class="prof-rid-stage__overlay">
        ${bookSceneHTML()}
        <div class="prof-rid-cta">
          <p class="prof-rid-cta__title">Your reading identity, as seen by an outside eye</p>
          <p class="prof-rid-cta__hint">Marginalia reads your library and margin notes, then writes a short portrait of how you read — what draws you, what you avoid, what the pattern reveals.</p>
          <button class="prof-rid-btn prof-rid-btn--primary" id="profRidGenerate" type="button">
            Generate
          </button>
        </div>
      </div>
    </section>
  `;
}

const RADAR_SIZE = 240;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 84;
const RADAR_RINGS = 4;

function radarPoint(angleRad: number, radius: number): { x: number; y: number } {
  return {
    x: RADAR_CENTER + Math.cos(angleRad) * radius,
    y: RADAR_CENTER + Math.sin(angleRad) * radius,
  };
}

function radarAngles(count: number): number[] {
  // Start at top (-90°) and go clockwise.
  return Array.from({ length: count }, (_, i) => (-Math.PI / 2) + (i * 2 * Math.PI) / count);
}

function radarPolygonPoints(axes: ReadingIdentityAxis[], scale: (score: number) => number): string {
  const angles = radarAngles(axes.length);
  return axes
    .map((axis, i) => {
      const p = radarPoint(angles[i], RADAR_RADIUS * scale(axis.score));
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

function radarHTML(axes: ReadingIdentityAxis[]): string {
  const angles = radarAngles(axes.length);

  // Inline presentation attributes (fill/stroke) so the radar renders correctly
  // both live and when cloned by html-to-image, which doesn't reliably apply
  // class-based CSS to SVG child elements during snapshot capture.
  const rings = Array.from({ length: RADAR_RINGS }, (_, ringIdx) => {
    const r = (RADAR_RADIUS * (ringIdx + 1)) / RADAR_RINGS;
    const pts = angles.map((a) => { const p = radarPoint(a, r); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
    return `<polygon class="prof-rid-radar__ring" points="${pts}" fill="none" stroke="rgba(232,223,200,0.09)" stroke-width="1"></polygon>`;
  }).join('');

  const spokes = angles.map((a) => {
    const p = radarPoint(a, RADAR_RADIUS);
    return `<line class="prof-rid-radar__spoke" x1="${RADAR_CENTER}" y1="${RADAR_CENTER}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(232,223,200,0.1)" stroke-width="1"></line>`;
  }).join('');

  const labels = axes.map((axis, i) => {
    const p = radarPoint(angles[i], RADAR_RADIUS + 22);
    const isTop = Math.abs(p.y - (RADAR_CENTER - RADAR_RADIUS - 22)) < 1;
    const anchor = Math.abs(p.x - RADAR_CENTER) < 4 ? 'middle' : (p.x > RADAR_CENTER ? 'start' : 'end');
    const dy = isTop ? '-2' : (p.y > RADAR_CENTER ? '10' : '0');
    return `<text class="prof-rid-radar__label" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" dy="${dy}" text-anchor="${anchor}" fill="rgba(237,224,200,0.66)">${escapeHtml(axis.label)}</text>`;
  }).join('');

  // Vertex dots use the data layer so animateAxes can grow them from center.
  const collapsed = radarPolygonPoints(axes, () => 0);

  return `
    <div class="prof-rid-radar" data-axes='${escapeHtml(JSON.stringify(axes.map((a) => a.score)))}'>
      <svg class="prof-rid-radar__svg" viewBox="0 0 ${RADAR_SIZE} ${RADAR_SIZE}" role="img" aria-label="Reading identity radar">
        <g class="prof-rid-radar__grid">${rings}${spokes}</g>
        <polygon class="prof-rid-radar__shape" points="${collapsed}" fill="rgba(196,154,82,0.2)" stroke="#e8c98c" stroke-width="1.6" stroke-linejoin="round"></polygon>
        <g class="prof-rid-radar__dots">
          ${axes.map(() => `<circle class="prof-rid-radar__dot" cx="${RADAR_CENTER}" cy="${RADAR_CENTER}" r="2.6" fill="#e8c98c"></circle>`).join('')}
        </g>
        <g class="prof-rid-radar__labels">${labels}</g>
      </svg>
    </div>
  `;
}

// Outline icons keyed by genre family — falls back to a generic "stack" mark.
const GENRE_ICONS: Record<string, string> = {
  fiction: '<path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2V5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  nonfiction: '<path d="M12 3l9 4-9 4-9-4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  history: '<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6"/>',
  philosophy: '<circle cx="12" cy="12" r="9"/><path d="M12 3a14 14 0 000 18M3 12h18"/>',
  science: '<path d="M9 3v6l-5 9a2 2 0 002 3h12a2 2 0 002-3l-5-9V3"/><path d="M8 3h8"/>',
  biography: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  memoir: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  poetry: '<path d="M6 3v14a3 3 0 003 3M6 7h6M6 11h4"/><circle cx="17" cy="17" r="3"/>',
  travel: '<circle cx="12" cy="11" r="3"/><path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7z"/>',
  essay: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  'social science': '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="3"/><path d="M3 21c0-3.6 2.7-6 6-6h5.2M14 19l2 2 4-4"/>',
  psychology: '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10"/><path d="M12 8v4l3 3"/>',
  economics: '<path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-8"/>',
  default: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
};

function genreIcon(label: string): string {
  const key = label.trim().toLowerCase();
  const match = Object.keys(GENRE_ICONS).find((k) => k !== 'default' && key.includes(k));
  return GENRE_ICONS[match ?? 'default'];
}

function genresHTML(genres: IdentityGenre[]): string {
  if (!genres.length) return '';
  return `
    <div class="prof-rid-genres" aria-label="Top genres">
      <span class="prof-rid-genres__title">Top Genres</span>
      <div class="prof-rid-genres__list">
        ${genres.map((genre) => `
          <div class="prof-rid-genres__item">
            <div class="prof-rid-genres__row">
              <svg class="prof-rid-genres__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${genreIcon(genre.label)}</svg>
              <span class="prof-rid-genres__label">${escapeHtml(genre.label)}</span>
              <span class="prof-rid-genres__pct">${genre.pct}%</span>
            </div>
            <div class="prof-rid-genres__bar" aria-hidden="true">
              <span style="width:${genre.pct}%"></span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Three single words distilled from behaviour values + axis labels.
function buildThreeWords(data: ReadingIdentityResult): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    if (!v) return;
    const word = v.split(/[\s,—-]/)[0].trim();
    if (word && word.length > 2 && !out.some((w) => w.toLowerCase() === word.toLowerCase())) out.push(word);
  };
  data.behaviorProfile.forEach((b) => push(b.value));
  data.axes.forEach((a) => push(a.label));
  return out.slice(0, 3);
}

function threeWordsHTML(data: ReadingIdentityResult): string {
  const words = buildThreeWords(data);
  if (!words.length) return '';
  const manifesto = data.poeticProjection?.ifYouWereABook || data.archetype.summary;
  return `
    <div class="prof-rid-words">
      <span class="prof-rid-words__title">In Three Words</span>
      <div class="prof-rid-words__list">
        ${words.map((w) => `<span class="prof-rid-words__word">${escapeHtml(w)}</span>`).join('')}
      </div>
      <p class="prof-rid-words__manifesto">${escapeHtml(manifesto)}</p>
    </div>
  `;
}

// Reading-rhythm rows drawn from behaviorProfile (pace/hour/length stand out best).
const RHYTHM_ICONS: Record<string, string> = {
  hour: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pace: '<path d="M4 19V5M4 19h16M9 15l3-4 3 2 4-6"/>',
  length: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
  mood: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  voice: '<path d="M12 3v18M8 7v10M16 7v10M4 10v4M20 10v4"/>',
  company: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.4"/><path d="M3 20c0-3 3-5 6-5M14 20c0-2.4 2-4 4-4"/>',
};

function rhythmHTML(data: ReadingIdentityResult): string {
  const order = ['hour', 'pace', 'length'];
  const rows = order
    .map((key) => data.behaviorProfile.find((b) => b.key === key))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .slice(0, 3);
  if (!rows.length) return '';
  return `
    <div class="prof-rid-rhythm">
      <span class="prof-rid-rhythm__title">Reading Rhythm</span>
      ${rows.map((row) => `
        <div class="prof-rid-rhythm__row">
          <svg class="prof-rid-rhythm__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RHYTHM_ICONS[row.key] ?? RHYTHM_ICONS.pace}</svg>
          <span class="prof-rid-rhythm__value"><strong>${escapeHtml(row.value)}</strong> — ${escapeHtml(row.rationale)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function buildTags(data: ReadingIdentityResult): string[] {
  const tags = new Set<string>();
  data.behaviorProfile.forEach((entry) => {
    if (entry.value) tags.add(entry.value);
  });
  data.axes.forEach((axis) => {
    if (axis.label) tags.add(axis.label);
  });
  return [...tags].slice(0, 5);
}

function referenceLayoutHTML(
  data: ReadingIdentityResult,
  options: RidRenderOptions = {},
): string {
  const tags = buildTags(data);
  return `
    <section class="prof-rid-ref" aria-label="Reading Identity artifact">
      <div class="prof-rid-ref__grid">
        <div class="prof-rid-ref__main">
          <div class="prof-rid-ref__archetype">
            <span class="prof-rid-ref__kicker">The Reader You Are</span>
            <h3 class="prof-rid-ref__title">${escapeHtml(data.archetype.title)}</h3>
            ${data.archetype.titleZh ? `<p class="prof-rid-ref__title-zh">「${escapeHtml(data.archetype.titleZh)}」</p>` : ''}
            <p class="prof-rid-ref__summary">
              <span class="prof-rid-ref__summary-text">${escapeHtml(data.archetype.summary)}</span>
            </p>
            ${data.archetype.summaryZh ? `<p class="prof-rid-ref__summary-zh">${escapeHtml(data.archetype.summaryZh)}</p>` : ''}
            ${tags.length ? `
              <div class="prof-rid-ref__tags">
                ${tags.map((tag) => `<span class="prof-rid-ref__tag">${escapeHtml(tag)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
          <div class="prof-rid-ref__radar-cell">
            <span class="prof-rid-ref__kicker">Reading DNA</span>
            ${radarHTML(data.axes)}
          </div>
          ${options.allowRegenerate === false ? '' : `
            <button class="prof-rid-btn prof-rid-btn--ghost prof-rid-btn--scene-regen" id="profRidRegen" type="button">
              <svg class="prof-rid-regen-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 3v6h-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 12a9 9 0 0 1-15.5 6.3L3 21v-6h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="prof-rid-btn__label">Re-divine</span>
            </button>
          `}
        </div>

        <div class="prof-rid-ref__words-cell">
          ${threeWordsHTML(data)}
        </div>

        <div class="prof-rid-ref__genres-cell">
          ${genresHTML(options.genres ?? [])}
        </div>

        <div class="prof-rid-ref__rhythm-cell">
          ${rhythmHTML(data)}
        </div>
      </div>
    </section>
  `;
}

function readRadarScores(host: HTMLElement): number[] {
  const radar = host.querySelector<HTMLElement>('.prof-rid-radar');
  if (!radar) return [];
  try {
    return JSON.parse(radar.dataset.axes || '[]') as number[];
  } catch {
    return [];
  }
}

// Grows the radar shape from the centre out to the scored vertices, with the
// vertex dots tracking the same eased value (mirrors the old bar stagger).
function animateAxes(host: HTMLElement, fromZero: boolean): void {
  const svg = host.querySelector<SVGSVGElement>('.prof-rid-radar__svg');
  const shape = host.querySelector<SVGPolygonElement>('.prof-rid-radar__shape');
  if (!svg || !shape) return;

  const scores = readRadarScores(host);
  if (!scores.length) return;
  const angles = radarAngles(scores.length);
  const dots = Array.from(host.querySelectorAll<SVGCircleElement>('.prof-rid-radar__dot'));

  const targets = scores.map((s) => Math.max(0, Math.min(100, s)) / 100);
  const DURATION = 760;
  const DELAY = fromZero ? 180 : 0;
  let raf = 0;
  let start = 0;

  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  const frame = (now: number) => {
    if (!start) start = now;
    const t = Math.min(1, (now - start) / DURATION);
    const e = easeOut(t);
    const pts = angles.map((a, i) => {
      const p = radarPoint(a, RADAR_RADIUS * targets[i] * e);
      const dot = dots[i];
      if (dot) { dot.setAttribute('cx', p.x.toFixed(1)); dot.setAttribute('cy', p.y.toFixed(1)); }
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');
    shape.setAttribute('points', pts);
    if (t < 1) raf = requestAnimationFrame(frame);
  };

  // Reset to collapsed before animating in.
  const collapsed = angles.map((a) => { const p = radarPoint(a, 0); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
  shape.setAttribute('points', collapsed);
  dots.forEach((dot) => { dot.setAttribute('cx', String(RADAR_CENTER)); dot.setAttribute('cy', String(RADAR_CENTER)); });

  window.setTimeout(() => { cancelAnimationFrame(raf); start = 0; raf = requestAnimationFrame(frame); }, DELAY);
}

function typewrite(el: HTMLElement, text: string, onDone?: () => void): number {
  el.textContent = '';
  let i = 0;
  const timer = window.setInterval(() => {
    i += 1;
    el.textContent = text.slice(0, i);
    if (i >= text.length) {
      window.clearInterval(timer);
      onDone?.();
    }
  }, TYPE_SPEED_MS);
  return timer;
}

function bindResult(host: HTMLElement, initialData: ReadingIdentityResult): void {
  let currentData = initialData;
  let variantIndex = 0;
  let regenerating = false;
  let typeTimer = 0;

  const regenBtn = host.querySelector<HTMLButtonElement>('#profRidRegen');
  const regenLabel = regenBtn?.querySelector<HTMLElement>('.prof-rid-btn__label');
  const regenIcon = regenBtn?.querySelector<HTMLElement>('.prof-rid-regen-icon');

  regenBtn?.addEventListener('click', () => {
    if (regenerating) return;
    regenerating = true;
    if (regenLabel) regenLabel.textContent = 'Re-divining…';
    regenIcon?.classList.add('is-spinning');

    const next = cycleReadingIdentityVariant(currentData, variantIndex);
    currentData = next.result;
    variantIndex = next.variantIndex;

    const radar = host.querySelector<HTMLElement>('.prof-rid-radar');
    if (radar) radar.dataset.axes = JSON.stringify(currentData.axes.map((a) => a.score));
    animateAxes(host, true);

    const archetypeEl = host.querySelector<HTMLElement>('.prof-rid-ref__title');
    const archetypeCnEl = host.querySelector<HTMLElement>('.prof-rid-ref__title-zh');
    const summaryEl = host.querySelector<HTMLElement>('.prof-rid-ref__summary');
    const summaryTextEl = host.querySelector<HTMLElement>('.prof-rid-ref__summary-text');
    const summaryZhEl = host.querySelector<HTMLElement>('.prof-rid-ref__summary-zh');
    const tagsEl = host.querySelector<HTMLElement>('.prof-rid-ref__tags');
    const wordsCellEl = host.querySelector<HTMLElement>('.prof-rid-ref__words-cell');
    const rhythmCellEl = host.querySelector<HTMLElement>('.prof-rid-ref__rhythm-cell');
    if (summaryEl) summaryEl.classList.add('is-typing');
    if (summaryTextEl) summaryTextEl.textContent = '';

    window.clearInterval(typeTimer);
    window.setTimeout(() => {
      if (archetypeEl) archetypeEl.textContent = currentData.archetype.title;
      if (archetypeCnEl) {
        if (currentData.archetype.titleZh) archetypeCnEl.textContent = `「${currentData.archetype.titleZh}」`;
        else archetypeCnEl.textContent = '';
      }
      if (summaryZhEl) summaryZhEl.textContent = currentData.archetype.summaryZh ?? '';
      if (tagsEl) {
        const tags = buildTags(currentData);
        tagsEl.innerHTML = tags.map((tag) => `<span class="prof-rid-ref__tag">${escapeHtml(tag)}</span>`).join('');
      }
      if (wordsCellEl) wordsCellEl.innerHTML = threeWordsHTML(currentData);
      if (rhythmCellEl) rhythmCellEl.innerHTML = rhythmHTML(currentData);
      if (summaryTextEl) {
        typeTimer = typewrite(summaryTextEl, currentData.archetype.summary, () => {
          regenerating = false;
          if (regenLabel) regenLabel.textContent = 'Re-divine';
          regenIcon?.classList.remove('is-spinning');
          if (summaryEl) summaryEl.classList.remove('is-typing');
        });
      }
    }, REGEN_SWAP_MS);
  });
}

function resultHTML(data: ReadingIdentityResult, options: RidRenderOptions = {}): string {
  return `
    <div class="prof-rid prof-rid--reference">
      <div class="prof-section__head prof-section__head--stacked prof-rid-result-head">
        <div>
          <h2 class="prof-section__title">Reading Identity</h2>
          <p class="prof-section__subcopy">An outside eye on how you read.</p>
        </div>
      </div>
      ${referenceLayoutHTML(data, options)}
    </div>
  `;
}

function mountSceneAvatar(host: HTMLElement): void {
  const avatarMount = host.querySelector<HTMLElement>('#profRidSceneAvatar');
  if (!avatarMount) return;
  const prev = sceneAvatarByHost.get(host);
  prev?.unmount();
  const avatar = new PixelReader({ state: 'reading', size: 'lg', accentColor: '#c49a52' });
  avatar.mount(avatarMount);
  sceneAvatarByHost.set(host, avatar);
}

function renderResult(host: HTMLElement, data: ReadingIdentityResult, options: RidRenderOptions = {}): void {
  host.innerHTML = resultHTML(data, options);
  const root = host.querySelector<HTMLElement>('.prof-rid');
  if (root) {
    root.classList.add('is-entering');
    requestAnimationFrame(() => root.classList.add('is-entered'));
    window.setTimeout(() => root.classList.remove('is-entering'), 720);
  }
  mountSceneAvatar(host);
  bindResult(host, data);
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateAxes(host, true);
      observer.disconnect();
    });
  }, { threshold: 0.3 });
  const showcase = host.querySelector<HTMLElement>('.prof-rid-ref');
  if (showcase) observer.observe(showcase);
}

function runReveal(host: HTMLElement, data: ReadingIdentityResult, options: RidRenderOptions = {}): void {
  const stage = host.querySelector<HTMLElement>('.prof-rid-stage');
  if (!stage) { renderResult(host, data, options); return; }

  const generateBtn = host.querySelector<HTMLButtonElement>('#profRidGenerate');
  if (generateBtn?.disabled) return;

  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
  }

  const bookEl = host.querySelector<HTMLElement>('.prof-rid-book');
  if (bookEl) {
    const stageRect = stage.getBoundingClientRect();
    const bookRect = bookEl.getBoundingClientRect();
    const deltaX = stageRect.left + stageRect.width / 2 - (bookRect.left + bookRect.width / 2);
    stage.style.setProperty('--prof-rid-book-shift-x', `${Math.round(deltaX)}px`);
  }

  stage.classList.add('is-generating');
  host.querySelector<HTMLElement>('.prof-rid-cta')?.classList.add('is-leaving');

  window.setTimeout(() => {
    heroBookByHost.get(host)?.open();
  }, BOOK_CENTERING_MS);

  window.setTimeout(() => {
    heroBookByHost.get(host)?.unmount();
    heroBookByHost.delete(host);
    renderResult(host, data, options);
  }, GENERATE_REVEAL_MS);
}

function buildLibraryPayload(
  books: IdentityBook[],
  highlights: IdentityHighlight[],
  sessionDays: Array<{ date: string; sessions: number; minutes: number }> = [],
): Record<string, unknown> {
  const totalSessions = sessionDays.reduce((s, d) => s + d.sessions, 0);
  const totalMinutes = sessionDays.reduce((s, d) => s + d.minutes, 0);
  const activeDays = sessionDays.filter((d) => d.sessions > 0);
  const avgMinutes = activeDays.length ? Math.round(totalMinutes / activeDays.length) : 0;

  const hourBuckets: Record<string, number> = {};
  sessionDays.forEach((d) => {
    const h = new Date(d.date).getHours();
    const bucket = h < 6 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'late-night';
    hourBuckets[bucket] = (hourBuckets[bucket] ?? 0) + d.sessions;
  });
  const peakHour = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'evening';
  const rhythmNote = totalSessions
    ? `${totalSessions} sessions · ${activeDays.length} active days · ~${avgMinutes} min/session · peak: ${peakHour}`
    : '';

  return {
    books,
    highlightSample: highlights.slice(0, 20).map((h) => ({ quote: h.quote })),
    rhythmNote,
  };
}

async function generateIdentityFromAI(
  books: IdentityBook[],
  highlights: IdentityHighlight[],
  sessionDays: Array<{ date: string; sessions: number; minutes: number }> = [],
): Promise<ReadingIdentityResult | null> {
  try {
    const { MarginaliaAI } = await import('../services/ai-gateway.ts');
    const { AIFeatureRegistry } = await import('../ai/features/registry.js');
    await import('../ai/features/prompts/reader-identity.js');

    const library = buildLibraryPayload(books, highlights, sessionDays);
    const prompt = AIFeatureRegistry.buildPrompt('reader-identity', library);
    if (!prompt) return null;

    const result = await (MarginaliaAI as any).generateJSON({
      featureId: 'reader-identity',
      prompt,
    }) as ReadingIdentityResult | null;

    if (!result?.archetype?.title || !Array.isArray(result?.axes)) return null;
    return result;
  } catch {
    return null;
  }
}

export function mountReadingIdentity(
  host: HTMLElement,
  data: ReadingIdentityResult | null | undefined,
  options: {
    revealImmediately?: boolean;
    genres?: IdentityGenre[];
    books?: IdentityBook[];
    highlights?: IdentityHighlight[];
    sessionDays?: Array<{ date: string; sessions: number; minutes: number }>;
  } = {},
): void {
  const genres = options.genres ?? [];
  if (options.revealImmediately && data) {
    const currentData = getReadingIdentityResult(data);
    renderResult(host, currentData, { allowRegenerate: false, genres });
    return;
  }
  host.innerHTML = `<div class="prof-rid prof-rid--gate">${ctaStateHTML()}</div>`;
  mountGateHeroBook(host);
  host.querySelector<HTMLButtonElement>('#profRidGenerate')?.addEventListener('click', () => {
    const books = options.books ?? [];
    const highlights = options.highlights ?? [];
    const sessionDays = options.sessionDays ?? [];
    if (books.length >= 3) {
      // Real AI path: animate the book opening, then call AI, then reveal
      const generateBtn = host.querySelector<HTMLButtonElement>('#profRidGenerate');
      if (generateBtn?.disabled) return;
      if (generateBtn) { generateBtn.disabled = true; generateBtn.textContent = 'Generating...'; }

      const bookEl = host.querySelector<HTMLElement>('.prof-rid-book');
      const stage = host.querySelector<HTMLElement>('.prof-rid-stage');
      if (bookEl && stage) {
        const stageRect = stage.getBoundingClientRect();
        const bookRect = bookEl.getBoundingClientRect();
        const deltaX = stageRect.left + stageRect.width / 2 - (bookRect.left + bookRect.width / 2);
        stage.style.setProperty('--prof-rid-book-shift-x', `${Math.round(deltaX)}px`);
      }
      stage?.classList.add('is-generating');
      host.querySelector<HTMLElement>('.prof-rid-cta')?.classList.add('is-leaving');
      window.setTimeout(() => { heroBookByHost.get(host)?.open(); }, BOOK_CENTERING_MS);

      generateIdentityFromAI(books, highlights, sessionDays).then((aiResult) => {
        window.setTimeout(() => {
          heroBookByHost.get(host)?.unmount();
          heroBookByHost.delete(host);
          if (aiResult) {
            renderResult(host, aiResult, { genres });
          } else {
            host.innerHTML = `<p class="prof-rid-error">Could not generate your reading identity. Try again after adding more books.</p>`;
          }
        }, GENERATE_REVEAL_MS);
      });
    } else {
      host.querySelector<HTMLElement>('.prof-rid-cta__hint')?.insertAdjacentHTML(
        'beforebegin',
        `<p class="prof-rid-cta__notice">Add at least 3 books to generate your reading identity.</p>`,
      );
    }
  });
}
