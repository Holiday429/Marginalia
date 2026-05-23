/**
 * Reading Path — a year-by-year line chart of books finished per month.
 *
 * Distinct from Reading Journey (the geographic map) and the Reading Streak
 * heatmap: this view shows the long-term cadence of finishing books, with year
 * navigation so the whole reading history can be traced.
 *
 * Data source: the same PublicBook list the rest of the profile renders from.
 * No AI, no extra fetch — purely an aggregation of finishedAt timestamps.
 */
import type { PublicBook } from './profile-types.ts';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CHART_W = 720;
const CHART_H = 200;
const PAD_X = 28;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;

interface YearData {
  year: number;
  monthly: number[]; // length 12, books finished per month
  total: number;
  busiestMonth: number; // 0-11, -1 if none
}

function isFinished(status: unknown): boolean {
  return status === 'read' || status === 'finished';
}

function buildYearData(books: PublicBook[]): YearData[] {
  const byYear = new Map<number, number[]>();
  books.forEach((book) => {
    if (!isFinished(book.status)) return;
    const stamp = book.finishedAt ?? 0;
    if (!stamp) return;
    const date = new Date(stamp);
    const year = date.getFullYear();
    const month = date.getMonth();
    if (!byYear.has(year)) byYear.set(year, new Array(12).fill(0));
    byYear.get(year)![month] += 1;
  });

  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, monthly]) => {
      const total = monthly.reduce((s, n) => s + n, 0);
      let busiestMonth = -1;
      let max = 0;
      monthly.forEach((n, i) => { if (n > max) { max = n; busiestMonth = i; } });
      return { year, monthly, total, busiestMonth };
    });
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chartSVG(data: YearData): string {
  const maxVal = Math.max(1, ...data.monthly);
  const innerW = CHART_W - PAD_X * 2;
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const stepX = innerW / 11;

  const points = data.monthly.map((v, i) => {
    const x = PAD_X + i * stepX;
    const y = PAD_TOP + innerH * (1 - v / maxVal);
    return { x, y, v, i };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[11].x.toFixed(1)},${(PAD_TOP + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(PAD_TOP + innerH).toFixed(1)} Z`;

  const gridLines = [0, 0.5, 1].map((f) => {
    const y = PAD_TOP + innerH * f;
    return `<line class="prof-path__grid" x1="${PAD_X}" y1="${y.toFixed(1)}" x2="${CHART_W - PAD_X}" y2="${y.toFixed(1)}"></line>`;
  }).join('');

  const dots = points.map((p) => {
    const isPeak = p.i === data.busiestMonth && p.v > 0;
    return `
      <g class="prof-path__node${isPeak ? ' is-peak' : ''}">
        ${p.v > 0 ? `<text class="prof-path__value" x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}" text-anchor="middle">${p.v}</text>` : ''}
        <circle class="prof-path__dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isPeak ? 4 : 3}"></circle>
      </g>
    `;
  }).join('');

  const labels = MONTH_LABELS.map((m, i) => {
    const x = PAD_X + i * stepX;
    return `<text class="prof-path__month" x="${x.toFixed(1)}" y="${(CHART_H - 8).toFixed(1)}" text-anchor="middle">${m}</text>`;
  }).join('');

  return `
    <svg class="prof-path__svg" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Books finished per month in ${data.year}">
      <g class="prof-path__grid-group">${gridLines}</g>
      <path class="prof-path__area" d="${areaPath}"></path>
      <path class="prof-path__line" d="${linePath}"></path>
      <g class="prof-path__nodes">${dots}</g>
      <g class="prof-path__months">${labels}</g>
    </svg>
  `;
}

function summaryHTML(data: YearData): string {
  const busiest = data.busiestMonth >= 0 ? MONTH_LABELS[data.busiestMonth] : '—';
  const avgPerMonth = data.total ? (data.total / 12).toFixed(1) : '0';
  return `
    <div class="prof-path__stats">
      <div class="prof-path__stat"><strong>${data.total}</strong><span>Books</span></div>
      <div class="prof-path__stat"><strong>${avgPerMonth}</strong><span>Avg / month</span></div>
      <div class="prof-path__stat"><strong>${escapeHtml(busiest)}</strong><span>Busiest month</span></div>
    </div>
  `;
}

function viewHTML(years: YearData[], index: number, showNav: boolean, insight = ''): string {
  const data = years[index];
  const canPrev = index > 0;
  const canNext = index < years.length - 1;
  const nav = showNav ? `
        <div class="prof-path__year-nav">
          <button class="prof-path__arrow" data-path-dir="-1" type="button" aria-label="Previous year" ${canPrev ? '' : 'disabled'}>&#8249;</button>
          <span class="prof-path__year">${data.year}</span>
          <button class="prof-path__arrow" data-path-dir="1" type="button" aria-label="Next year" ${canNext ? '' : 'disabled'}>&#8250;</button>
        </div>` : '';
  return `
    <div class="prof-path__card">
      <div class="prof-path__head">
        ${summaryHTML(data)}
        ${nav}
      </div>
      ${chartSVG(data)}
      ${insight ? `<p class="prof-path__insight">${escapeHtml(insight)}</p>` : ''}
    </div>
  `;
}

export interface MountPathOptions {
  /** Lock the chart to a single year (no internal nav). Used when an outer control owns the year. */
  year?: number;
  showNav?: boolean;
  /** Insight line rendered inside the chart card (e.g. "March was the busiest month…"). */
  insight?: string;
}

export function mountReadingPath(host: HTMLElement, books: PublicBook[], options: MountPathOptions = {}): void {
  const years = buildYearData(books);
  if (!years.length) {
    host.innerHTML = `<p class="prof-path__empty">No finished books with dates yet.</p>`;
    return;
  }

  const showNav = options.showNav ?? (options.year === undefined);
  let index = options.year !== undefined
    ? Math.max(0, years.findIndex((y) => y.year === options.year))
    : years.length - 1; // default to most recent year
  if (index < 0) index = years.length - 1;

  const render = () => {
    host.innerHTML = viewHTML(years, index, showNav, options.insight);
    host.querySelectorAll<HTMLButtonElement>('[data-path-dir]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = index + Number(btn.dataset.pathDir);
        if (next < 0 || next >= years.length) return;
        index = next;
        render();
      });
    });
  };

  render();
}
