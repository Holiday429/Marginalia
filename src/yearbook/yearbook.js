/* Booklist view — annual picks animation + streak */

const BOOKLIST_TARGET_COUNT = 8;

const BOOKLIST_STATE = {
  year: new Date().getFullYear(),
  sourceBooks: [],
  selectedBooks: [],
  selectedByUid: new Map(),
  bound: false,
  isAnimating: false,
  heroMountPromise: null,
  heroMountFn: undefined,
  centerTeardown: null,
  previewBookUid: '',
};

const BOOKLIST_YEARS = (() => {
  const current = new Date().getFullYear();
  return [current - 3, current - 2, current - 1, current];
})();

const BOOKLIST_LEVEL_LABELS = [
  'No record',
  'Reading evidence',
  'Has notes',
  'Deep notes',
  'Deep notes + action',
];

const BOOKLIST_HEATMAP_CACHE = new Map();
let BOOKLIST_RESIZE_TIMER = 0;

function initYearbook() {
  BOOKLIST_STATE.year = BOOKLIST_YEARS.includes(BOOKLIST_STATE.year)
    ? BOOKLIST_STATE.year
    : BOOKLIST_YEARS[BOOKLIST_YEARS.length - 1];

  hydrateBooklistData();
  renderBooklistShell();
  bindBooklistEvents();
  renderBooklistContent();
  renderBooklistHeatmap();
}

function enterYearbook() {
  if (BOOKLIST_STATE.isAnimating) return;
  hydrateBooklistData();
  renderBooklistContent();
  renderBooklistHeatmap();
}

function renderBooklistShell() {
  const host = document.getElementById('view-yearbook');
  if (!host) return;

  const sharedHeader = typeof window.renderPrimaryHeader === 'function'
    ? window.renderPrimaryHeader('yearbook', { showNewEntry: true, actionLabel: '↗ Share' })
    : '';

  host.innerHTML = `
    <div class="booklist-shell">
      ${sharedHeader}
      <main class="booklist-main">
        <section class="booklist-streak">
          <div class="booklist-section-head booklist-section-head--regular">
            <h2 class="booklist-heading">Reading Streak</h2>
            <div class="year-switcher">
              <button type="button" id="ybYearPrevBtn" aria-label="Previous year">←</button>
              <span id="ybYearLabel"></span>
              <button type="button" id="ybYearNextBtn" aria-label="Next year">→</button>
            </div>
          </div>
          <div class="booklist-heatmap-shell">
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

        <div class="booklist-progress">
          <span id="ybProgressBar"></span>
        </div>

        <section class="booklist-source">
          <div class="booklist-section-head booklist-section-head--source">
            <h3 class="booklist-subheading">Year-In-Reading Shelf</h3>
            <button type="button" class="booklist-play-btn" id="ybPlayBtn">Play</button>
          </div>
          <div class="booklist-source-track" id="ybSourceShelf"></div>
          <div class="booklist-shelf-plank"></div>
          <div class="booklist-shelf-base"></div>
        </section>

        <section class="booklist-top" id="ybTopArea">
          <section class="booklist-annual">
            <div class="booklist-section-head booklist-section-head--regular booklist-annual-head" id="ybAnnualHeadingAnchor">
              <h2 class="booklist-heading">Annual Shelf</h2>
              <span id="ybAnnualCounter">0 / 0 shelved</span>
            </div>
            <div class="booklist-racks" id="ybAnnualRacks"></div>
          </section>

          <section class="booklist-stage" id="ybCenterStage" aria-live="polite">
            <div class="booklist-stage-book-wrap">
              <div class="booklist-stage-book" id="ybCenterBook"></div>
              <div class="booklist-stage-meta">
                <h3 id="ybCenterTitle"></h3>
                <p id="ybCenterAuthor"></p>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  `;
}

function bindBooklistEvents() {
  if (BOOKLIST_STATE.bound) return;
  BOOKLIST_STATE.bound = true;

  const host = document.getElementById('view-yearbook');
  if (!host) return;

  host.addEventListener('click', (event) => {
    const playBtn = event.target.closest('#ybPlayBtn');
    if (playBtn) {
      event.preventDefault();
      startBooklistAnimation(playBtn);
      return;
    }

    const prevBtn = event.target.closest('#ybYearPrevBtn');
    if (prevBtn) {
      event.preventDefault();
      shiftBooklistYear(-1);
      return;
    }

    const nextBtn = event.target.closest('#ybYearNextBtn');
    if (nextBtn) {
      event.preventDefault();
      shiftBooklistYear(1);
      return;
    }

    const slot = event.target.closest('.booklist-slot');
    if (slot) {
      event.preventDefault();
      if (!document.querySelector('#view-yearbook .booklist-main')?.classList.contains('is-showcase')) return;
      setBooklistPreviewByUid(slot.dataset.slotId || '', { renderStatic: true });
      return;
    }

    const previewCover = event.target.closest('#ybCenterBook');
    if (previewCover) {
      event.preventDefault();
      openPreviewBookDetail();
    }
  });

  window.addEventListener('resize', debounceBooklistHeatmap);
}

function debounceBooklistHeatmap() {
  clearTimeout(BOOKLIST_RESIZE_TIMER);
  BOOKLIST_RESIZE_TIMER = window.setTimeout(() => renderBooklistHeatmap(), 120);
}

function renderBooklistHeatmap() {
  const yearLabel = document.getElementById('ybYearLabel');
  const monthHost = document.getElementById('ybHeatmapMonths');
  const grid = document.getElementById('ybHeatmapGrid');
  const shell = document.querySelector('#view-yearbook .booklist-heatmap-shell');
  if (!yearLabel || !monthHost || !grid || !shell) return;

  const year = BOOKLIST_STATE.year;
  yearLabel.textContent = String(year);

  const prevBtn = document.getElementById('ybYearPrevBtn');
  const nextBtn = document.getElementById('ybYearNextBtn');
  const idx = BOOKLIST_YEARS.indexOf(year);
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= BOOKLIST_YEARS.length - 1;

  const days = buildBooklistHeatmap(year);
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
  monthHost.style.width = `${width}px`;
  grid.style.width = `${width}px`;

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
      cell.classList.add(`l${entry.level}`);
      cell.title = `${formatYBDate(entry.date)} · ${BOOKLIST_LEVEL_LABELS[entry.level]}`;
    }
    grid.appendChild(cell);
  });
}

function shiftBooklistYear(delta) {
  const idx = BOOKLIST_YEARS.indexOf(BOOKLIST_STATE.year);
  const next = idx + delta;
  if (next < 0 || next >= BOOKLIST_YEARS.length) return;
  BOOKLIST_STATE.year = BOOKLIST_YEARS[next];
  renderBooklistHeatmap();
}

function buildBooklistHeatmap(year) {
  if (BOOKLIST_HEATMAP_CACHE.has(year)) return BOOKLIST_HEATMAP_CACHE.get(year);

  const list = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  while (cursor <= end) {
    const date = new Date(cursor);
    let level = computeBooklistDayLevel(date);
    if (year === today.getFullYear() && date > today) level = -1;
    list.push({ date, level });
    cursor.setDate(cursor.getDate() + 1);
  }

  BOOKLIST_HEATMAP_CACHE.set(year, list);
  return list;
}

function computeBooklistDayLevel(date) {
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

function hydrateBooklistData() {
  const sourceBooks = buildSourceBooks();
  const selectedBooks = selectAnnualBooks(sourceBooks, BOOKLIST_TARGET_COUNT);
  BOOKLIST_STATE.sourceBooks = sourceBooks;
  BOOKLIST_STATE.selectedBooks = selectedBooks;
  BOOKLIST_STATE.selectedByUid = new Map(selectedBooks.map((book) => [book.uid, book]));
}

function renderBooklistContent() {
  const sourceHost = document.getElementById('ybSourceShelf');
  const annualHost = document.getElementById('ybAnnualRacks');
  const annualCounter = document.getElementById('ybAnnualCounter');
  const playBtn = document.getElementById('ybPlayBtn');
  const main = document.querySelector('#view-yearbook .booklist-main');
  if (!sourceHost || !annualHost || !annualCounter || !playBtn || !main) return;

  main.classList.remove('is-showcase');
  main.classList.add('is-preplay');
  teardownCenterBook();

  renderSourceShelf(sourceHost, BOOKLIST_STATE.sourceBooks);
  renderAnnualRacks(annualHost, BOOKLIST_STATE.selectedBooks);

  annualCounter.textContent = `0 / ${BOOKLIST_STATE.selectedBooks.length} shelved`;

  playBtn.disabled = BOOKLIST_STATE.selectedBooks.length === 0;
  playBtn.textContent = BOOKLIST_STATE.selectedBooks.length ? 'Play' : 'No Picks';
  playBtn.dataset.mode = 'play';
  BOOKLIST_STATE.previewBookUid = '';

  const stage = document.getElementById('ybCenterStage');
  if (stage) stage.classList.remove('is-idle', 'is-active');
  resetCenterCopy();

  updateProgress(0, Math.max(1, BOOKLIST_STATE.selectedBooks.length));
}

function renderSourceShelf(host, books) {
  host.innerHTML = '';
  books.forEach((book) => {
    const spine = document.createElement('button');
    spine.type = 'button';
    spine.className = 'booklist-spine';
    if (BOOKLIST_STATE.selectedByUid.has(book.uid)) spine.classList.add('is-picked');
    spine.dataset.sourceId = book.uid;

    const size = getSourceSpineSize(book);
    spine.style.width = `${size.width}px`;
    spine.style.height = `${size.height}px`;
    spine.style.background = book.spine;
    spine.style.color = book.text;

    spine.innerHTML = `
      <span class="booklist-spine-title">${escapeHTML(shorten(book.spineTitle, 34))}</span>
      <span class="booklist-spine-author">${escapeHTML(shorten(book.spineAuthor, 22))}</span>
    `;
    host.appendChild(spine);
  });
}

function renderAnnualRacks(host, books) {
  host.innerHTML = '';
  if (!books.length) {
    host.innerHTML = '<div class="booklist-empty">No books available for this year.</div>';
    return;
  }

  const rows = splitAnnualRows(books);
  rows.forEach((row) => {
    const rack = document.createElement('div');
    rack.className = 'booklist-rack';

    const booksRow = document.createElement('div');
    booksRow.className = 'booklist-rack-books';

    row.forEach((book) => {
      const slot = document.createElement('div');
      slot.className = `booklist-slot${book.isFeatured ? ' is-featured' : ''}`;
      slot.dataset.slotId = book.uid;

      const cover = document.createElement('div');
      cover.className = 'booklist-slot-cover';
      cover.style.setProperty('--slot-cover-bg', book.spine);

      const placeholder = document.createElement('div');
      placeholder.className = 'booklist-slot-placeholder';
      placeholder.innerHTML = '<span>Cover</span>';

      const img = document.createElement('img');
      img.alt = `${book.title} cover`;
      img.hidden = true;
      if (book.coverSrc) img.src = book.coverSrc;

      cover.appendChild(img);
      cover.appendChild(placeholder);

      const meta = document.createElement('div');
      meta.className = 'booklist-slot-meta';
      meta.innerHTML = `
        <h4>${escapeHTML(shorten(book.title, 52))}</h4>
        <p>${escapeHTML(shorten(book.author, 32))}</p>
      `;

      slot.appendChild(cover);
      slot.appendChild(meta);
      booksRow.appendChild(slot);
    });

    rack.appendChild(booksRow);
    rack.insertAdjacentHTML('beforeend', `
      <div class="booklist-shelf-plank"></div>
      <div class="booklist-shelf-base"></div>
    `);
    host.appendChild(rack);
  });
}

async function startBooklistAnimation(playBtn) {
  if (BOOKLIST_STATE.isAnimating) return;
  if (!BOOKLIST_STATE.selectedBooks.length && playBtn.dataset.mode !== 'organize') return;

  const mode = playBtn.dataset.mode || 'play';
  if (mode === 'organize') {
    await runOrganizeStep(playBtn);
    return;
  }

  const isReplay = mode === 'replay';
  if (isReplay) prepareReplayState();

  const main = document.querySelector('#view-yearbook .booklist-main');
  if (main) {
    main.classList.remove('is-preplay');
    main.classList.add('is-showcase');
    requestAnimationFrame(() => alignShowcaseIntoView());
  }

  BOOKLIST_STATE.isAnimating = true;
  playBtn.disabled = true;
  playBtn.textContent = 'Playing...';

  const placement = [...BOOKLIST_STATE.selectedBooks].sort((a, b) => b.rank - a.rank);
  const total = placement.length;
  for (let i = 0; i < total; i++) {
    const book = placement[i];
    const sourceEl = document.querySelector(`.booklist-spine[data-source-id="${cssEscape(book.uid)}"]`);
    const slotCover = document.querySelector(`.booklist-slot[data-slot-id="${cssEscape(book.uid)}"] .booklist-slot-cover`);
    if (!sourceEl || !slotCover) continue;

    sourceEl.classList.add('is-lifting');
    await delay(260);

    const sourceRect = sourceEl.getBoundingClientRect();
    const centerRect = getCenterBookRect();
    const targetRect = slotCover.getBoundingClientRect();

    sourceEl.classList.add('is-gone');

    await animateFlyer(book, sourceRect, centerRect, targetRect, async () => {
      await playCenterBook(book);
    });

    revealAnnualSlot(book.uid);
    updateAnnualCounter(i + 1, total);
    updateProgress(i + 1, total);
    await delay(170);
  }

  const stage = document.getElementById('ybCenterStage');
  if (stage) stage.classList.add('is-idle');

  // Keep favorite book previewed after sequence.
  const favorite = BOOKLIST_STATE.selectedBooks.find((book) => book.rank === 0) || BOOKLIST_STATE.selectedBooks[0];
  if (favorite) setBooklistPreviewByUid(favorite.uid, { renderStatic: true });

  playBtn.disabled = false;
  playBtn.textContent = 'Organize';
  playBtn.dataset.mode = 'organize';
  BOOKLIST_STATE.isAnimating = false;
}

async function runOrganizeStep(playBtn) {
  BOOKLIST_STATE.isAnimating = true;
  playBtn.disabled = true;
  playBtn.textContent = 'Organizing...';

  await compactSourceShelfAfterSequence();
  const favorite = BOOKLIST_STATE.selectedBooks.find((book) => book.rank === 0) || BOOKLIST_STATE.selectedBooks[0];
  if (favorite) setBooklistPreviewByUid(favorite.uid, { renderStatic: true });

  playBtn.disabled = false;
  playBtn.textContent = 'Retry';
  playBtn.dataset.mode = 'replay';
  BOOKLIST_STATE.isAnimating = false;
}

function prepareReplayState() {
  const sourceHost = document.getElementById('ybSourceShelf');
  const annualHost = document.getElementById('ybAnnualRacks');
  if (!sourceHost || !annualHost) return;

  renderSourceShelf(sourceHost, BOOKLIST_STATE.sourceBooks);
  renderAnnualRacks(annualHost, BOOKLIST_STATE.selectedBooks);

  const total = BOOKLIST_STATE.selectedBooks.length;
  updateAnnualCounter(0, total);
  updateProgress(0, Math.max(1, total));
  BOOKLIST_STATE.previewBookUid = '';

  const stage = document.getElementById('ybCenterStage');
  if (stage) stage.classList.remove('is-idle', 'is-active');
  resetCenterCopy();

  teardownCenterBook();
}

function alignShowcaseIntoView() {
  const anchor = document.getElementById('ybAnnualHeadingAnchor');
  if (!anchor) return;
  const top = window.scrollY + anchor.getBoundingClientRect().top - 16;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function resetCenterCopy() {
  const centerTitle = document.getElementById('ybCenterTitle');
  const centerAuthor = document.getElementById('ybCenterAuthor');
  if (centerTitle) centerTitle.textContent = '';
  if (centerAuthor) centerAuthor.textContent = '';
  setPreviewOpenable(false);
}

function revealAnnualSlot(uid) {
  const slot = document.querySelector(`.booklist-slot[data-slot-id="${cssEscape(uid)}"]`);
  if (!slot) return;
  slot.classList.add('is-filled');

  const img = slot.querySelector('img');
  if (img && img.getAttribute('src')) {
    img.hidden = false;
    slot.classList.add('has-image');
  }
}

function setBooklistPreviewByUid(uid, { renderStatic = true } = {}) {
  const book = BOOKLIST_STATE.selectedByUid.get(uid);
  if (!book) return;

  BOOKLIST_STATE.previewBookUid = uid;
  const title = document.getElementById('ybCenterTitle');
  const author = document.getElementById('ybCenterAuthor');
  if (title) title.textContent = shorten(book.title, 40);
  if (author) author.textContent = shorten(book.author, 30);

  document.querySelectorAll('.booklist-slot').forEach((slot) => {
    slot.classList.toggle('is-active', slot.dataset.slotId === uid);
  });

  if (renderStatic) renderPreviewStaticBook(book);
}

function renderPreviewStaticBook(book) {
  teardownCenterBook();

  const host = document.getElementById('ybCenterBook');
  if (!host) return;
  host.classList.add('is-static-preview');

  const frame = document.createElement('div');
  frame.className = 'booklist-preview-cover';
  frame.style.background = book.spine;

  if (book.coverSrc) {
    const img = document.createElement('img');
    img.src = book.coverSrc;
    img.alt = `${book.title} cover`;
    frame.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'booklist-preview-placeholder';
    placeholder.textContent = 'Cover';
    frame.appendChild(placeholder);
  }

  host.appendChild(frame);
  setPreviewOpenable(Boolean(book.id && window.BOOK_BY_ID?.[book.id]));
}

function openPreviewBookDetail() {
  const uid = BOOKLIST_STATE.previewBookUid;
  if (!uid) return;
  const book = BOOKLIST_STATE.selectedByUid.get(uid);
  if (!book?.id || !window.BOOK_BY_ID?.[book.id]) return;
  App.show('book', { id: book.id });
}

function setPreviewOpenable(flag) {
  const host = document.getElementById('ybCenterBook');
  if (!host) return;
  host.classList.toggle('is-openable', Boolean(flag));
}

function updateAnnualCounter(done, total) {
  const counter = document.getElementById('ybAnnualCounter');
  if (!counter) return;
  counter.textContent = `${done} / ${total} shelved`;
}

function updateProgress(done, total) {
  const bar = document.getElementById('ybProgressBar');
  if (!bar) return;
  const pct = Math.max(0, Math.min(100, (done / total) * 100));
  bar.style.width = `${pct}%`;
}

async function animateFlyer(book, sourceRect, centerRect, targetRect, onCenter) {
  const flyer = document.createElement('div');
  flyer.className = 'booklist-flyer';
  flyer.style.background = book.spine;
  flyer.style.color = book.text;
  flyer.innerHTML = `
    <div class="booklist-flyer-inner">
      <div class="booklist-flyer-kicker">${new Date().getFullYear()}</div>
      <div class="booklist-flyer-title">${escapeHTML(shorten(book.title, 40))}</div>
      <div class="booklist-flyer-author">${escapeHTML(shorten(book.author, 24))}</div>
    </div>
  `;
  document.body.appendChild(flyer);

  applyFlyerRect(flyer, sourceRect);
  await waitFrame();

  transitionFlyerRect(flyer, centerRect, 540, 'cubic-bezier(.2,.8,.2,1)', 1);
  await delay(560);

  if (typeof onCenter === 'function') {
    await onCenter();
  }

  transitionFlyerRect(flyer, targetRect, 560, 'cubic-bezier(.4,0,.2,1)', 0);
  await delay(610);
  flyer.remove();
}

function applyFlyerRect(flyer, rect) {
  flyer.style.left = `${rect.left}px`;
  flyer.style.top = `${rect.top}px`;
  flyer.style.width = `${Math.max(24, rect.width)}px`;
  flyer.style.height = `${Math.max(36, rect.height)}px`;
  flyer.style.opacity = '1';
}

function transitionFlyerRect(flyer, rect, duration, easing, opacity) {
  flyer.style.transition = [
    `left ${duration}ms ${easing}`,
    `top ${duration}ms ${easing}`,
    `width ${duration}ms ${easing}`,
    `height ${duration}ms ${easing}`,
    `opacity ${Math.min(260, duration)}ms ease`,
  ].join(', ');
  flyer.style.left = `${rect.left}px`;
  flyer.style.top = `${rect.top}px`;
  flyer.style.width = `${Math.max(24, rect.width)}px`;
  flyer.style.height = `${Math.max(36, rect.height)}px`;
  flyer.style.opacity = String(opacity);
}

async function playCenterBook(book) {
  const stage = document.getElementById('ybCenterStage');
  const host = document.getElementById('ybCenterBook');
  const title = document.getElementById('ybCenterTitle');
  const author = document.getElementById('ybCenterAuthor');
  if (!stage || !host || !title || !author) return;

  stage.classList.remove('is-idle');
  stage.classList.add('is-active');
  title.textContent = shorten(book.title, 40);
  author.textContent = shorten(book.author, 30);

  teardownCenterBook();

  const spineWidth = book.isFeatured ? 64 : 56;
  const coverWidth = Math.round(spineWidth * 2.4);
  const bookHeight = book.isFeatured ? 230 : 206;
  const expand = coverWidth - spineWidth;

  const bookEl = document.createElement('div');
  bookEl.className = 'book booklist-center-book hero-3d';
  bookEl.style.width = `${spineWidth}px`;
  bookEl.style.height = `${bookHeight}px`;
  bookEl.style.setProperty('--book-h', `${bookHeight}px`);
  bookEl.style.setProperty('--book-color', book.spine);
  bookEl.style.setProperty('--book-text', book.text);
  bookEl.style.setProperty('--cover-bg', book.spine);
  bookEl.style.setProperty('--cover-text', book.text);
  bookEl.style.setProperty('--cover-w', `${coverWidth}px`);
  bookEl.style.setProperty('--spine-w', `${spineWidth}px`);
  bookEl.style.setProperty('--spine-half', `${spineWidth / 2}px`);
  bookEl.style.setProperty('--expand', `${expand}px`);
  bookEl.style.setProperty('--expand-half', `${expand / 2}px`);
  bookEl.style.setProperty('--hero-stage-clearance', '18px');

  const spineIndex = String(book.rank + 1).padStart(2, '0');
  const coverInner = book.coverSrc
    ? `<img src="${escapeAttr(book.coverSrc)}" alt="${escapeAttr(book.title)} cover">`
    : `<div class="booklist-center-cover-title">${escapeHTML(shorten(book.title, 46))}</div>`;

  bookEl.innerHTML = `
    <div class="book-inner">
      <div class="spine">
        <div class="spine-top-mark">${spineIndex}</div>
        <div class="spine-text">${escapeHTML(shorten(book.spineTitle, 30))}</div>
        <div class="spine-author">${escapeHTML(shorten(book.spineAuthor, 20))}</div>
      </div>
      <div class="cover">${coverInner}</div>
      <div class="back"></div>
    </div>
  `;

  host.appendChild(bookEl);

  const mountHero = await getHeroMountFn();
  if (typeof mountHero === 'function') {
    BOOKLIST_STATE.centerTeardown = mountHero(bookEl);
  }

  await waitFrame();
  bookEl.classList.add('opening');
  await delay(90);
  bookEl.classList.add('opened');
  await delay(620);
  bookEl.classList.remove('opened');
  await delay(130);
}

function teardownCenterBook() {
  if (typeof BOOKLIST_STATE.centerTeardown === 'function') {
    BOOKLIST_STATE.centerTeardown();
  }
  BOOKLIST_STATE.centerTeardown = null;

  const host = document.getElementById('ybCenterBook');
  if (host) host.innerHTML = '';
}

async function getHeroMountFn() {
  if (BOOKLIST_STATE.heroMountFn !== undefined) return BOOKLIST_STATE.heroMountFn;
  if (!BOOKLIST_STATE.heroMountPromise) {
    BOOKLIST_STATE.heroMountPromise = import('./src/preloader/hero-glb.js')
      .then((module) => (typeof module.mountHeroGLB === 'function' ? module.mountHeroGLB : null))
      .catch(() => null);
  }
  BOOKLIST_STATE.heroMountFn = await BOOKLIST_STATE.heroMountPromise;
  return BOOKLIST_STATE.heroMountFn;
}

function getCenterBookRect() {
  const host = document.getElementById('ybCenterBook');
  if (host) {
    const rect = host.getBoundingClientRect();
    if (rect.width > 10 && rect.height > 10) return rect;
  }

  const width = 146;
  const height = 214;
  return {
    left: window.innerWidth / 2 - width / 2,
    top: window.innerHeight / 2 - height / 2 - 20,
    width,
    height,
  };
}

function splitAnnualRows(books) {
  if (books.length <= 6) return [books];
  const firstCount = Math.ceil(books.length / 2);
  return [books.slice(0, firstCount), books.slice(firstCount)];
}

function buildSourceBooks() {
  const shelfBooks = Array.isArray(window.SHELF_BOOKS) ? window.SHELF_BOOKS : [];
  const detailBooks = Array.isArray(window.BOOK_DETAILS) ? window.BOOK_DETAILS : [];
  const titleMap = createDetailLookup(detailBooks);

  if (!shelfBooks.length && detailBooks.length) {
    return detailBooks.map((detail, index) => normalizeBookRecord({ id: detail.id }, index, detail, null));
  }

  return shelfBooks.map((entry, index) => {
    const detail = resolveDetail(entry, titleMap);
    return normalizeBookRecord(entry, index, detail, entry);
  });
}

function normalizeBookRecord(entry, index, detail, shelfEntry) {
  const rawTitle = detail?.titleZh || detail?.title || prettifyShelfTitle(shelfEntry?.title || entry?.title);
  const rawAuthor = detail?.author || prettifyShelfTitle(shelfEntry?.author || entry?.author || 'Unknown');
  const uidBase = detail?.id || entry?.id || slugify(rawTitle || `book-${index + 1}`);
  const finishedAt = detail?.meta?.finishedAt || '';
  const rating = Number.isFinite(detail?.rating) ? detail.rating : null;
  const status = normalizeStatus(shelfEntry?.status || detail?.status || 'want');

  return {
    uid: `${uidBase}-${index}`,
    id: detail?.id || entry?.id || '',
    title: rawTitle || 'Untitled',
    author: rawAuthor || 'Unknown',
    spineTitle: prettifyShelfTitle(shelfEntry?.title || detail?.title || rawTitle || 'Untitled'),
    spineAuthor: prettifyShelfTitle(shelfEntry?.author || detail?.author || rawAuthor || 'Unknown'),
    spine: shelfEntry?.spine || detail?.cover?.bg || '#2b2620',
    text: shelfEntry?.text || detail?.cover?.text || '#e8dfc8',
    w: Number(shelfEntry?.w) || 34,
    h: Number(shelfEntry?.h) || 0.86,
    status,
    rating,
    finishedAt,
    coverSrc: detail?.cover?.image || '',
    detail,
    sourceIndex: index,
    rank: 0,
    isFeatured: false,
  };
}

function resolveDetail(entry, titleMap) {
  const byId = window.BOOK_BY_ID || {};
  if (entry?.id && byId[entry.id]) return byId[entry.id];

  const normalized = normalizeLookupTitle(entry?.title);
  if (normalized && titleMap.has(normalized)) return titleMap.get(normalized);
  return null;
}

function createDetailLookup(details) {
  const map = new Map();
  details.forEach((detail) => {
    const t1 = normalizeLookupTitle(detail?.title);
    const t2 = normalizeLookupTitle(detail?.titleZh);
    if (t1) map.set(t1, detail);
    if (t2) map.set(t2, detail);
  });
  return map;
}

function selectAnnualBooks(sourceBooks, count) {
  const seen = new Set();
  const ranked = [];

  ['finished', 'reading', 'want'].forEach((status) => {
    const chunk = sourceBooks
      .filter((book) => normalizeStatus(book.status) === status)
      .sort((a, b) => annualScore(b) - annualScore(a));

    chunk.forEach((book) => {
      if (seen.has(book.uid)) return;
      seen.add(book.uid);
      ranked.push(book);
    });
  });

  sourceBooks.forEach((book) => {
    if (seen.has(book.uid)) return;
    seen.add(book.uid);
    ranked.push(book);
  });

  const spread = [];
  const used = new Set();

  while (spread.length < count && spread.length < ranked.length) {
    let best = null;
    let bestScore = -Infinity;

    ranked.forEach((candidate) => {
      if (used.has(candidate.uid)) return;
      let score = annualScore(candidate);
      if (spread.length) {
        const nearest = Math.min(...spread.map((pick) => Math.abs((pick.sourceIndex || 0) - (candidate.sourceIndex || 0))));
        if (nearest <= 1) score -= 520;
        else if (nearest === 2) score -= 170;
      }
      score += seededNoiseYB((candidate.sourceIndex + 1) * 173 + (spread.length + 1) * 37) * 36;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    if (!best) break;
    used.add(best.uid);
    spread.push(best);
  }

  return spread.slice(0, count).map((book, index) => ({
    ...book,
    rank: index,
    isFeatured: index === 0,
  }));
}

function annualScore(book) {
  let score = 0;
  const status = normalizeStatus(book.status);
  if (status === 'finished') score += 820;
  else if (status === 'reading') score += 420;
  else score += 80;

  if (book.coverSrc) score += 24;
  if (book.rating !== null) score += book.rating * 48;
  if (book.id === 'sapiens') score += 18;

  const finishedAt = Date.parse(book.finishedAt || '');
  if (Number.isFinite(finishedAt)) {
    score += finishedAt / 100000000000;
  }
  return score;
}

function buildAnimationQueue(selectedBooks) {
  const remaining = selectedBooks.map((book) => ({ book, sourceIndex: book.sourceIndex || 0 }));
  const queue = [];
  let lastIndex = null;
  let guard = 0;

  while (remaining.length && guard < 100) {
    guard += 1;
    let chosenPos = 0;

    if (lastIndex === null) {
      const seed = Math.floor(seededNoiseYB(BOOKLIST_STATE.year * 47 + remaining.length * 31) * remaining.length);
      chosenPos = Math.max(0, Math.min(remaining.length - 1, seed));
    } else {
      let bestScore = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const distance = Math.abs(remaining[i].sourceIndex - lastIndex);
        const jitter = seededNoiseYB((i + 1) * 97 + queue.length * 23) * 0.2;
        const score = distance + jitter;
        if (score > bestScore) {
          bestScore = score;
          chosenPos = i;
        }
      }
    }

    const [picked] = remaining.splice(chosenPos, 1);
    queue.push(picked.book);
    lastIndex = picked.sourceIndex;
  }

  return queue;
}

async function compactSourceShelfAfterSequence() {
  const track = document.getElementById('ybSourceShelf');
  if (!track) return;

  const moving = [...track.querySelectorAll('.booklist-spine:not(.is-gone)')];
  const before = new Map(moving.map((el) => [el.dataset.sourceId || '', el.getBoundingClientRect()]));

  track.querySelectorAll('.booklist-spine.is-gone').forEach((el) => el.remove());
  moving.forEach((el) => {
    el.classList.remove('is-lifting', 'is-gone', 'is-dimmed');
  });

  // Force layout after DOM compaction
  void track.offsetWidth;

  moving.forEach((el) => {
    const id = el.dataset.sourceId || '';
    const prev = before.get(id);
    if (!prev) return;
    const next = el.getBoundingClientRect();
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;

    requestAnimationFrame(() => {
      el.style.transition = 'transform 460ms cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
    });
  });

  await delay(500);
  moving.forEach((el) => {
    el.style.transition = '';
    el.style.transform = '';
  });
}

function getSourceSpineSize(book) {
  const width = Math.max(24, Math.round((book.w || 34) * 0.86));
  const height = Math.max(96, Math.round(126 + (book.h || 0.86) * 74));
  return { width, height };
}

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'finished') return 'finished';
  if (s === 'reading') return 'reading';
  if (s === 'wishlist') return 'want';
  if (s === 'want' || s === 'to read') return 'want';
  return 'want';
}

function normalizeLookupTitle(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function prettifyShelfTitle(str) {
  const value = String(str || '').trim();
  if (!value) return '';
  const hasLowercase = /[a-z]/.test(value);
  if (hasLowercase) return value;
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function shorten(str, max) {
  const text = String(str || '');
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + '…';
}

function slugify(str) {
  return String(str || 'book')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'book';
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return String(value || '').replace(/"/g, '\\"');
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

function escapeAttr(str) {
  return escapeHTML(str).replace(/'/g, '&#39;');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

window.initYearbook = initYearbook;
window.enterYearbook = enterYearbook;
