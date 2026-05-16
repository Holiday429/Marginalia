/* Marginalia · Profile Heatmap
   Renders a 52-week × 7-day reading activity grid from real session data.
   Supports three dimension views: sessions count, minutes, highlights.
   Pure DOM — no external libraries.
*/

export type HeatmapDim = 'sessions' | 'minutes' | 'highlights';

interface SessionDay {
  date: string;       // 'YYYY-MM-DD'
  sessions: number;
  minutes: number;
  highlights: number;
}

const WEEKS = 52;
const DAYS  = 7;

// Day-of-week labels: Mon=0 … Sun=6 (ISO week order)
const DOW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

export class ProfileHeatmap {
  private container: HTMLElement;
  private days: SessionDay[];
  private dim: HeatmapDim = 'sessions';
  private dayMap: Map<string, SessionDay>;
  private gridEl: HTMLElement | null = null;

  constructor(container: HTMLElement, days: SessionDay[]) {
    this.container = container;
    this.days      = days;
    this.dayMap    = new Map(days.map(d => [d.date, d]));
  }

  mount(): void {
    this.container.innerHTML = this._buildHTML();
    this.gridEl = this.container.querySelector<HTMLElement>('.prof-heatmap-grid');
    this._renderGrid();

    // Listen for dimension switch dispatched by profile.ts tab binding
    this.container.addEventListener('prof:heatmap-dim', (e: Event) => {
      const dim = (e as CustomEvent).detail?.dim as HeatmapDim;
      if (dim) { this.dim = dim; this._renderGrid(); }
    });
  }

  private _buildHTML(): string {
    const monthLabels = this._buildMonthLabels();
    const dowHTML = DOW_LABELS
      .map(l => `<span class="prof-hm-dow">${l}</span>`)
      .join('');

    return `
      <div class="prof-heatmap-inner">
        <div class="prof-hm-dow-col" aria-hidden="true">${dowHTML}</div>
        <div class="prof-hm-main">
          <div class="prof-hm-months" aria-hidden="true">${monthLabels}</div>
          <div class="prof-heatmap-grid" aria-label="Reading activity, last 52 weeks"></div>
        </div>
      </div>
      <div class="prof-hm-legend" aria-hidden="true">
        <span class="prof-hm-legend-label">Less</span>
        <div class="prof-hm-swatches">
          <span class="prof-hm-cell"></span>
          <span class="prof-hm-cell prof-hm-l1"></span>
          <span class="prof-hm-cell prof-hm-l2"></span>
          <span class="prof-hm-cell prof-hm-l3"></span>
          <span class="prof-hm-cell prof-hm-l4"></span>
        </div>
        <span class="prof-hm-legend-label">More</span>
      </div>
    `;
  }

  private _renderGrid(): void {
    if (!this.gridEl) return;

    // Build ordered date list: WEEKS×DAYS going back from today
    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7; // Mon=0

    // Start of grid: go back 52 weeks, then to the Monday of that week
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (WEEKS * DAYS - 1) - todayDow);

    // Compute max value for this dimension
    let maxVal = 1;
    this.days.forEach(d => {
      const v = d[this.dim];
      if (v > maxVal) maxVal = v;
    });

    const frag = document.createDocumentFragment();

    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < DAYS; d++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + w * DAYS + d);

        const el = document.createElement('div');
        el.className = 'prof-hm-cell';

        // Future days → empty/miss
        if (cellDate > today) {
          el.classList.add('prof-hm-miss');
          frag.appendChild(el);
          continue;
        }

        const dateStr = cellDate.toISOString().slice(0, 10);
        const entry   = this.dayMap.get(dateStr);
        const val     = entry ? entry[this.dim] : 0;

        if (val > 0) {
          const ratio = val / maxVal;
          if (ratio > 0.75)      el.classList.add('prof-hm-l4');
          else if (ratio > 0.5)  el.classList.add('prof-hm-l3');
          else if (ratio > 0.25) el.classList.add('prof-hm-l2');
          else                   el.classList.add('prof-hm-l1');

          el.title = `${dateStr}: ${val} ${this.dim}`;
        }

        frag.appendChild(el);
      }
    }

    this.gridEl.innerHTML = '';
    this.gridEl.appendChild(frag);
  }

  private _buildMonthLabels(): string {
    // Figure out which column (0-51) each month label starts at
    const today = new Date();
    const todayDow = (today.getDay() + 6) % 7;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (WEEKS * DAYS - 1) - todayDow);

    const months: Array<{ label: string; col: number }> = [];
    let lastMonth = -1;

    for (let w = 0; w < WEEKS; w++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + w * DAYS);
      const m = cellDate.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        const label = cellDate.toLocaleString('en', { month: 'short' });
        months.push({ label, col: w + 1 });
      }
    }

    return months
      .map(({ label, col }) => `<span class="prof-hm-month" style="grid-column:${col}">${label}</span>`)
      .join('');
  }
}
