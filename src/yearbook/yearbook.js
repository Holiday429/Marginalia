/* Yearbook view — reading streak moved from home */

const YEARBOOK_STATE = {
  year: new Date().getFullYear(),
};

const YEARBOOK_YEARS = (() => {
  const current = new Date().getFullYear();
  return [current - 3, current - 2, current - 1, current];
})();

const YEARBOOK_LEVEL_LABELS = [
  'No record',
  'Reading evidence',
  'Has notes',
  'Deep notes',
  'Deep notes + action',
];

const YEARBOOK_HEATMAP_CACHE = new Map();
let YEARBOOK_BOUND = false;

function initYearbook() {
  YEARBOOK_STATE.year = YEARBOOK_YEARS.includes(YEARBOOK_STATE.year)
    ? YEARBOOK_STATE.year
    : YEARBOOK_YEARS[YEARBOOK_YEARS.length - 1];

  renderYearbookShell();
  bindYearbookEvents();
  renderYearbookHeatmap();
}

function enterYearbook() {
  renderYearbookHeatmap();
}

function renderYearbookShell() {
  const host = document.getElementById('view-yearbook');
  if (!host) return;

  const sharedHeader = typeof window.renderPrimaryHeader === 'function'
    ? window.renderPrimaryHeader('yearbook', { showNewEntry: true, actionLabel: '＋ New entry' })
    : '';

  host.innerHTML = `
    <div class="yearbook-shell">
      ${sharedHeader}
      <main class="yearbook-main">
        <section class="reading-heatmap-section yearbook-streak">
          <div class="section-head">
            <h2>Reading Streak</h2>
            <div class="year-switcher">
              <button type="button" id="ybYearPrevBtn" aria-label="Previous year">←</button>
              <span id="ybYearLabel"></span>
              <button type="button" id="ybYearNextBtn" aria-label="Next year">→</button>
            </div>
          </div>
          <div class="heatmap-shell">
            <div class="heatmap-months" id="ybHeatmapMonths"></div>
            <div class="heatmap-grid" id="ybHeatmapGrid"></div>
            <div class="heatmap-legend">
              <span>No record</span>
              <div class="legend-cells">
                <span class="legend-cell l0"></span>
                <span class="legend-cell l1"></span>
                <span class="legend-cell l2"></span>
                <span class="legend-cell l3"></span>
                <span class="legend-cell l4"></span>
              </div>
              <span>Deep notes + action</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}

function bindYearbookEvents() {
  if (YEARBOOK_BOUND) return;
  YEARBOOK_BOUND = true;

  const host = document.getElementById('view-yearbook');
  if (!host) return;

  host.addEventListener('click', (event) => {
    const prev = event.target.closest('#ybYearPrevBtn');
    const next = event.target.closest('#ybYearNextBtn');
    if (prev) {
      event.preventDefault();
      shiftYearbookYear(-1);
    }
    if (next) {
      event.preventDefault();
      shiftYearbookYear(1);
    }
  });

  window.addEventListener('resize', debounceYearbookHeatmap);
}

function debounceYearbookHeatmap() {
  clearTimeout(window.__yearbookResizeTimer);
  window.__yearbookResizeTimer = setTimeout(() => {
    renderYearbookHeatmap();
  }, 120);
}

function renderYearbookHeatmap() {
  const yearLabel = document.getElementById('ybYearLabel');
  const monthHost = document.getElementById('ybHeatmapMonths');
  const grid = document.getElementById('ybHeatmapGrid');
  const shell = document.querySelector('#view-yearbook .heatmap-shell');
  if (!yearLabel || !monthHost || !grid || !shell) return;

  const year = YEARBOOK_STATE.year;
  yearLabel.textContent = String(year);

  const prevBtn = document.getElementById('ybYearPrevBtn');
  const nextBtn = document.getElementById('ybYearNextBtn');
  const idx = YEARBOOK_YEARS.indexOf(year);
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= YEARBOOK_YEARS.length - 1;

  const days = buildYearbookHeatmap(year);
  const jan1 = new Date(year, 0, 1);
  const offset = mondayIndexYB(jan1.getDay());
  const totalSlots = offset + days.length;
  const weeks = Math.ceil(totalSlots / 7);
  const gap = 4;
  const shellStyle = getComputedStyle(shell);
  const shellInnerWidth = shell.clientWidth
    - parseFloat(shellStyle.paddingLeft || '0')
    - parseFloat(shellStyle.paddingRight || '0');
  const cellSize = Math.max(8, (shellInnerWidth - (weeks - 1) * gap) / weeks);
  const width = weeks * cellSize + (weeks - 1) * gap;

  monthHost.innerHTML = '';
  grid.innerHTML = '';
  monthHost.style.gridTemplateColumns = `repeat(${weeks}, ${cellSize}px)`;
  grid.style.gridTemplateColumns = `repeat(${weeks}, ${cellSize}px)`;
  grid.style.gridTemplateRows = `repeat(7, ${cellSize}px)`;
  monthHost.style.width = width + 'px';
  grid.style.width = width + 'px';

  for (let m = 0; m < 12; m++) {
    const first = new Date(year, m, 1);
    const monthIndex = dayOfYearYB(first) - 1;
    const col = Math.floor((offset + monthIndex) / 7) + 1;
    const label = document.createElement('span');
    label.className = 'heatmap-month';
    label.style.gridColumnStart = String(col);
    label.textContent = first.toLocaleDateString('en-US', { month: 'short' });
    monthHost.appendChild(label);
  }

  days.forEach((entry, i) => {
    const pos = offset + i;
    const col = Math.floor(pos / 7) + 1;
    const row = (pos % 7) + 1;
    const cell = document.createElement('span');
    cell.className = 'heat-cell';
    cell.style.gridColumn = String(col);
    cell.style.gridRow = String(row);

    if (entry.level < 0) {
      cell.classList.add('future');
      cell.title = `${formatYBDate(entry.date)} · Not reached yet`;
    } else {
      cell.classList.add('l' + entry.level);
      cell.title = `${formatYBDate(entry.date)} · ${YEARBOOK_LEVEL_LABELS[entry.level]}`;
    }
    grid.appendChild(cell);
  });
}

function shiftYearbookYear(delta) {
  const idx = YEARBOOK_YEARS.indexOf(YEARBOOK_STATE.year);
  const next = idx + delta;
  if (next < 0 || next >= YEARBOOK_YEARS.length) return;
  YEARBOOK_STATE.year = YEARBOOK_YEARS[next];
  renderYearbookHeatmap();
}

function buildYearbookHeatmap(year) {
  if (YEARBOOK_HEATMAP_CACHE.has(year)) return YEARBOOK_HEATMAP_CACHE.get(year);

  const list = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  while (cursor <= end) {
    const date = new Date(cursor);
    let level = computeYearbookDayLevel(date);
    if (year === today.getFullYear() && date > today) level = -1;
    list.push({ date, level });
    cursor.setDate(cursor.getDate() + 1);
  }

  YEARBOOK_HEATMAP_CACHE.set(year, list);
  return list;
}

function computeYearbookDayLevel(date) {
  const year = date.getFullYear();
  const day = dayOfYearYB(date);
  let score = seededNoiseYB(year * 1000 + day * 17);
  const weekday = date.getDay();
  const month = date.getMonth();

  if (weekday === 0 || weekday === 6) score += 0.08;
  if (month === 0 || month === 6 || month === 9) score += 0.06;
  if (day % 6 === 0) score += 0.08;
  if (day % 17 === 0) score += 0.16;
  if (day % 29 === 0) score += 0.21;

  if (score < 0.38) return 0;
  if (score < 0.62) return 1;
  if (score < 0.79) return 2;
  if (score < 0.92) return 3;
  return 4;
}

function seededNoiseYB(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function dayOfYearYB(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

function mondayIndexYB(jsDay) {
  return (jsDay + 6) % 7;
}

function formatYBDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
