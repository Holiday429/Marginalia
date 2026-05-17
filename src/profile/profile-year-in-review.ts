import { App } from '../core/app.js';
import { BooksStore } from '../store/books-store.ts';
import { SpineCard } from '../components/spine-card.js';
import '../booklist/booklist.css';

interface ProfileBook {
  id: string;
  title: string;
  author: string;
  spine: string;
  text: string;
  status?: string;
  finishedAt?: number;
  coverSrc?: string;
  language?: string;
  genre?: string;
}

interface SessionDay {
  date: string;
  sessions: number;
  minutes: number;
  highlights: number;
}

interface AnnualShelfOptions {
  host: HTMLElement;
  books: ProfileBook[];
  sessionDays: SessionDay[];
  allowOpenDetails?: boolean;
  showRhythm?: boolean;
}

interface AnnualShelfState {
  yearIndex: number;
  isAnimating: boolean;
  previewBookId: string;
}

export class ProfileAnnualShelf {
  private host: HTMLElement;
  private books: ProfileBook[];
  private sessionDays: SessionDay[];
  private allowOpenDetails: boolean;
  private showRhythm: boolean;
  private years: number[];
  private state: AnnualShelfState;

  constructor({ host, books, sessionDays, allowOpenDetails = false, showRhythm = true }: AnnualShelfOptions) {
    this.host = host;
    this.books = books;
    this.sessionDays = sessionDays;
    this.allowOpenDetails = allowOpenDetails;
    this.showRhythm = showRhythm;
    this.years = buildYears(books);
    this.state = { yearIndex: this.years.length - 1, isAnimating: false, previewBookId: '' };
  }

  mount(): void {
    this.render();
    this.bind();
  }

  destroy(): void {
    this.state.isAnimating = false;
  }

  private get year(): number {
    return this.years[this.state.yearIndex];
  }

  private top10ForYear(year: number): ProfileBook[] {
    return this.books
      .filter((b) => isFinishedStatus(b.status) && bookYear(b) === year)
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
      .slice(0, 10);
  }

  private render(): void {
    const year = this.year;
    const top10 = this.top10ForYear(year);
    const canPrev = this.state.yearIndex > 0;
    const canNext = this.state.yearIndex < this.years.length - 1;

    const heatmap = this.showRhythm ? buildHeatmap(year, this.sessionDays) : [];
    const maxLevel = heatmap.length ? Math.max(1, ...heatmap.map((d) => d.level)) : 1;
    const meta = describeYearActivity(year, top10, this.sessionDays);

    this.host.innerHTML = `
      <div class="prof-annual">

        ${this.showRhythm ? `
          <section class="prof-annual__block" aria-label="Reading Rhythm">
            <div class="prof-section__head">
              <h2 class="prof-section__title">Reading Rhythm</h2>
              <div class="prof-rhythm__year-nav">
                <button class="prof-rhythm__arrow" id="profAnnualPrev" type="button" aria-label="Previous year" ${canPrev ? '' : 'disabled'}>&#8249;</button>
                <span class="prof-rhythm__year">${year}</span>
                <button class="prof-rhythm__arrow" id="profAnnualNext" type="button" aria-label="Next year" ${canNext ? '' : 'disabled'}>&#8250;</button>
              </div>
            </div>
            <div class="prof-annual__card">
              <div class="prof-rhythm__meta-row">
                <span class="prof-rhythm__meta">${escHtml(meta)}</span>
              </div>
              ${heatmap.length ? `
                <div class="prof-year__heatmap">
                  <div class="prof-year__months">${renderMonthLabels(year, heatmap)}</div>
                  <div class="prof-year__grid" style="grid-template-columns:repeat(${Math.ceil((heatmap.length + firstColumnOffset(year)) / 7)}, minmax(0, 1fr));">
                    ${heatmap.map((day) => {
                      const pos = firstColumnOffset(year) + day.index;
                      const col = Math.floor(pos / 7) + 1;
                      const row = (pos % 7) + 1;
                      return `<span class="prof-year__cell${day.future ? ' is-future' : ''}${day.level > 0 ? ` is-l${Math.min(4, day.level)}` : ''}" style="grid-column:${col};grid-row:${row}" title="${escHtml(day.label)}"></span>`;
                    }).join('')}
                  </div>
                </div>
                <div class="prof-year__legend${maxLevel <= 1 ? ' is-low-signal' : ''}">
                  <span>Quiet</span>
                  <div class="prof-year__legend-swatches">
                    <span class="prof-year__cell"></span>
                    <span class="prof-year__cell is-l1"></span>
                    <span class="prof-year__cell is-l2"></span>
                    <span class="prof-year__cell is-l3"></span>
                    <span class="prof-year__cell is-l4"></span>
                  </div>
                  <span>Immersed</span>
                </div>
              ` : `<p class="prof-year__empty">No reading sessions recorded for ${year}.</p>`}
            </div>
          </section>
        ` : ''}

        <section class="prof-annual__block" aria-label="Annual Shelf">
          <div class="prof-section__head">
            <h2 class="prof-section__title">Annual Shelf</h2>
            <div class="prof-annual__shelf-controls">
              ${!this.showRhythm ? `
                <div class="prof-rhythm__year-nav">
                  <button class="prof-rhythm__arrow" id="profAnnualPrevShelf" type="button" aria-label="Previous year" ${canPrev ? '' : 'disabled'}>&#8249;</button>
                  <span class="prof-rhythm__year">${year}</span>
                  <button class="prof-rhythm__arrow" id="profAnnualNextShelf" type="button" aria-label="Next year" ${canNext ? '' : 'disabled'}>&#8250;</button>
                </div>
              ` : ''}
              <span id="profAnnualCounter" class="prof-rhythm__meta"></span>
              ${top10.length >= 2 ? `
                <button class="booklist-play-btn" id="profAnnualPlayBtn" type="button">Play</button>
              ` : ''}
            </div>
          </div>
          <div class="prof-annual__card">
            ${top10.length ? `
              <div class="booklist-top" id="profAnnualTop">
                <section class="booklist-annual">
                  <div class="booklist-racks" id="profAnnualRacks"></div>
                </section>
                <section class="booklist-stage shelf-preview-panel" id="profAnnualStage">
                  <div class="booklist-stage-rank" id="profAnnualStageRank" aria-hidden="true"></div>
                  <div class="booklist-favourite-badge" id="profAnnualFavBadge" aria-hidden="true">
                    <div class="booklist-favourite-medal">
                      <span class="booklist-favourite-ribbon booklist-favourite-ribbon--left"></span>
                      <span class="booklist-favourite-ribbon booklist-favourite-ribbon--right"></span>
                      <span class="booklist-favourite-medal-number">1</span>
                    </div>
                  </div>
                  <div class="booklist-stage-book-wrap">
                    <div class="booklist-stage-book" id="profAnnualStageBook"></div>
                    <div class="booklist-stage-meta">
                      <div class="booklist-stage-copy">
                        <h3 class="booklist-stage-title" id="profAnnualStageTitle"></h3>
                        <p class="booklist-stage-author" id="profAnnualStageAuthor"></p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
              <section class="booklist-source">
                <div class="booklist-section-head booklist-section-head--source">
                  <h3 class="booklist-subheading">Year-In-Reading Shelf</h3>
                </div>
                <div class="booklist-source-track" id="profAnnualSourceShelf"></div>
              </section>
            ` : `<p class="prof-year__empty">No finished books recorded for ${year}.</p>`}
          </div>
        </section>

      </div>
    `;

    if (top10.length) {
      this.renderRacks(top10);
      this.renderSourceShelf(top10);
      updateCounter(this.host, 0, top10.length);
      // Show first book as static preview
      this.showStaticPreview(top10[0], top10);
    }
  }

  private renderRacks(books: ProfileBook[]): void {
    const host = this.host.querySelector<HTMLElement>('#profAnnualRacks');
    if (!host) return;
    host.innerHTML = '';
    const rows = splitRows(books);
    rows.forEach((row) => {
      const rack = document.createElement('div');
      rack.className = 'booklist-rack';
      const booksRow = document.createElement('div');
      booksRow.className = 'booklist-rack-books';
      row.forEach((book, rowIdx) => {
        const isFeatured = books.indexOf(book) === 0;
        const slot = document.createElement('div');
        slot.className = `booklist-slot${isFeatured ? ' is-featured' : ''}`;
        slot.dataset.slotId = book.id;
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
        meta.innerHTML = `<h4>${escHtml(shorten(book.title, 52))}</h4>`;
        slot.appendChild(cover);
        slot.appendChild(meta);
        booksRow.appendChild(slot);
        void rowIdx;
      });
      rack.appendChild(booksRow);
      rack.insertAdjacentHTML('beforeend', `
        <div class="booklist-shelf-plank"></div>
        <div class="booklist-shelf-base"></div>
      `);
      host.appendChild(rack);
    });
  }

  private renderSourceShelf(books: ProfileBook[]): void {
    const host = this.host.querySelector<HTMLElement>('#profAnnualSourceShelf');
    if (!host) return;
    host.innerHTML = '';
    books.forEach((book) => {
      const size = getSpineSize(book);
      const spine = SpineCard.create({
        title: book.title,
        author: book.author,
        spine: book.spine,
        text: book.text,
        width: size.width,
        height: size.height,
        className: 'booklist-spine',
        extraClasses: [],
        dataAttrs: { sourceId: book.id },
        ariaLabel: `${book.title} by ${book.author}`,
        titleClass: `booklist-spine-title${containsCJK(book.title) ? ' is-cjk' : ''}`,
        authorClass: `booklist-spine-author${containsCJK(book.author) ? ' is-cjk' : ''}`,
      });
      host.appendChild(spine);
    });
  }

  private showStaticPreview(book: ProfileBook, top10: ProfileBook[]): void {
    const titleEl = this.host.querySelector<HTMLElement>('#profAnnualStageTitle');
    const authorEl = this.host.querySelector<HTMLElement>('#profAnnualStageAuthor');
    const bookHost = this.host.querySelector<HTMLElement>('#profAnnualStageBook');
    const stage = this.host.querySelector<HTMLElement>('#profAnnualStage');
    const badge = this.host.querySelector<HTMLElement>('#profAnnualFavBadge');
    if (titleEl) titleEl.textContent = shorten(book.title, 40);
    if (authorEl) authorEl.textContent = book.author;
    if (stage) { stage.classList.remove('is-idle'); stage.classList.add('is-active'); }
    if (badge) {
      badge.classList.remove('is-visible', 'is-entered');
      if (top10.indexOf(book) === 0) { badge.classList.add('is-visible', 'is-entered'); }
    }
    if (bookHost) {
      bookHost.innerHTML = '';
      bookHost.appendChild(buildPreviewFrame(book));
    }
    this.state.previewBookId = book.id;
    // Highlight the active slot
    this.host.querySelectorAll('.booklist-slot').forEach((s) => {
      (s as HTMLElement).classList.toggle('is-active', (s as HTMLElement).dataset.slotId === book.id);
    });
  }

  private bind(): void {
    const changeYear = (delta: number) => {
      const next = this.state.yearIndex + delta;
      if (next < 0 || next >= this.years.length) return;
      this.state.yearIndex = next;
      this.state.isAnimating = false;
      this.state.previewBookId = '';
      this.render();
      this.bind();
    };

    this.host.querySelector('#profAnnualPrev')?.addEventListener('click', () => changeYear(-1));
    this.host.querySelector('#profAnnualNext')?.addEventListener('click', () => changeYear(1));
    this.host.querySelector('#profAnnualPrevShelf')?.addEventListener('click', () => changeYear(-1));
    this.host.querySelector('#profAnnualNextShelf')?.addEventListener('click', () => changeYear(1));

    const playBtn = this.host.querySelector<HTMLButtonElement>('#profAnnualPlayBtn');
    playBtn?.addEventListener('click', () => { this.startAnimation(playBtn); });

    // Click slot → preview that book
    this.host.querySelector('#profAnnualRacks')?.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.booklist-slot');
      if (!slot || this.state.isAnimating) return;
      const book = this.top10ForYear(this.year).find((b) => b.id === slot.dataset.slotId);
      if (book) this.showStaticPreview(book, this.top10ForYear(this.year));
    });

    // Click stage → open book detail (owner only)
    this.host.querySelector('#profAnnualStage')?.addEventListener('click', () => {
      if (!this.allowOpenDetails || this.state.isAnimating) return;
      const book = this.top10ForYear(this.year).find((b) => b.id === this.state.previewBookId);
      if (book?.id && BooksStore.getById(book.id)) App.show('book', { id: book.id });
    });
  }

  private async startAnimation(playBtn: HTMLButtonElement): Promise<void> {
    if (this.state.isAnimating) return;
    const top10 = this.top10ForYear(this.year);
    if (top10.length < 2) return;

    this.state.isAnimating = true;
    playBtn.disabled = true;
    playBtn.textContent = 'Playing...';

    // Reset racks + source shelf
    this.renderRacks(top10);
    this.renderSourceShelf(top10);
    updateCounter(this.host, 0, top10.length);
    resetStageOverlays(this.host);

    const stage = this.host.querySelector<HTMLElement>('#profAnnualStage');
    const bookHost = this.host.querySelector<HTMLElement>('#profAnnualStageBook');
    const titleEl = this.host.querySelector<HTMLElement>('#profAnnualStageTitle');
    const authorEl = this.host.querySelector<HTMLElement>('#profAnnualStageAuthor');

    // Play 10 → 1
    const placement = [...top10].reverse(); // highest rank (10) first, No.1 last
    const total = placement.length;

    for (let i = 0; i < total; i++) {
      if (!this.state.isAnimating) break;
      const book = placement[i];
      const rankNumber = total - i; // 10, 9, … 1

      if (bookHost) bookHost.innerHTML = '';
      if (titleEl) titleEl.textContent = '';
      if (authorEl) authorEl.textContent = '';

      await playRankReveal(this.host, rankNumber);
      if (!this.state.isAnimating) break;

      const sourceEl = this.host.querySelector<HTMLElement>(`.booklist-spine[data-source-id="${cssEscape(book.id)}"]`);
      const slotCover = this.host.querySelector<HTMLElement>(`.booklist-slot[data-slot-id="${cssEscape(book.id)}"] .booklist-slot-cover`);
      if (!sourceEl || !slotCover) { updateCounter(this.host, i + 1, total); continue; }

      sourceEl.classList.add('is-lifting');
      await delay(260);
      if (!this.state.isAnimating) break;

      const sourceRect = sourceEl.getBoundingClientRect();
      const centerRect = getCenterRect(this.host);
      const targetRect = slotCover.getBoundingClientRect();
      sourceEl.classList.add('is-gone');

      await animateFlyer(book, sourceRect, centerRect, targetRect, async () => {
        if (!stage || !bookHost || !titleEl || !authorEl) return;
        stage.classList.remove('is-idle');
        stage.classList.add('is-active');
        if (titleEl) titleEl.textContent = shorten(book.title, 40);
        if (authorEl) authorEl.textContent = book.author;
        const frame = buildPreviewFrame(book);
        frame.classList.add('is-entering');
        bookHost.innerHTML = '';
        bookHost.appendChild(frame);
        await waitFrame();
        frame.classList.add('is-entered');
        if (rankNumber === 1) revealBadge(this.host);
        await delay(520);
      });

      revealSlot(this.host, book.id);
      updateCounter(this.host, i + 1, total);
      this.state.previewBookId = book.id;
      await delay(170);
    }

    if (stage) stage.classList.add('is-idle');
    playBtn.disabled = false;
    playBtn.textContent = 'Replay';
    this.state.isAnimating = false;

    // Keep No.1 book on stage
    const favourite = top10[0];
    if (favourite) this.showStaticPreview(favourite, top10);
  }
}

// ─── Helpers (mirrored from booklist.js) ──────────────────────────────────────

function splitRows(books: ProfileBook[]): ProfileBook[][] {
  if (books.length <= 6) return [books];
  const firstCount = Math.ceil(books.length / 2);
  return [books.slice(0, firstCount), books.slice(firstCount)];
}

function buildPreviewFrame(book: ProfileBook): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'booklist-preview-cover is-cover-only';
  frame.style.background = book.spine;
  if (book.coverSrc) {
    const img = document.createElement('img');
    img.src = book.coverSrc;
    img.alt = `${book.title} cover`;
    frame.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'booklist-preview-placeholder';
    ph.textContent = book.title;
    frame.appendChild(ph);
  }
  return frame;
}

async function playRankReveal(host: HTMLElement, rankNumber: number): Promise<void> {
  const rankEl = host.querySelector<HTMLElement>('#profAnnualStageRank');
  const stage = host.querySelector<HTMLElement>('#profAnnualStage');
  if (!rankEl) return;
  if (stage) stage.classList.add('is-ranking');
  rankEl.textContent = String(rankNumber);
  rankEl.classList.remove('is-visible', 'is-pop');
  void rankEl.offsetWidth;
  rankEl.classList.add('is-visible', 'is-pop');
  await delay(980);
  rankEl.classList.remove('is-pop', 'is-visible');
  await delay(180);
  if (stage) stage.classList.remove('is-ranking');
}

function revealBadge(host: HTMLElement): void {
  const badge = host.querySelector<HTMLElement>('#profAnnualFavBadge');
  if (!badge) return;
  badge.classList.remove('is-visible', 'is-entered');
  badge.classList.add('is-visible');
  requestAnimationFrame(() => badge.classList.add('is-entered'));
}

function resetStageOverlays(host: HTMLElement): void {
  host.querySelector('#profAnnualStageRank')?.classList.remove('is-visible', 'is-pop');
  host.querySelector('#profAnnualFavBadge')?.classList.remove('is-visible', 'is-entered');
  host.querySelector('#profAnnualStage')?.classList.remove('is-ranking');
}

function revealSlot(host: HTMLElement, id: string): void {
  const slot = host.querySelector<HTMLElement>(`.booklist-slot[data-slot-id="${cssEscape(id)}"]`);
  if (!slot) return;
  slot.classList.add('is-filled');
  const img = slot.querySelector('img');
  if (img?.getAttribute('src')) { img.hidden = false; slot.classList.add('has-image'); }
}

function updateCounter(host: HTMLElement, done: number, total: number): void {
  const el = host.querySelector<HTMLElement>('#profAnnualCounter');
  if (el) el.textContent = `${done} / ${total} shelved`;
}

function getCenterRect(host: HTMLElement): DOMRect | { left: number; top: number; width: number; height: number } {
  const el = host.querySelector<HTMLElement>('#profAnnualStageBook');
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 10 && r.height > 10) return r;
  }
  return { left: window.innerWidth / 2 - 91, top: window.innerHeight / 2 - 136, width: 182, height: 272 };
}

async function animateFlyer(
  book: ProfileBook,
  sourceRect: DOMRect | { left: number; top: number; width: number; height: number },
  centerRect: DOMRect | { left: number; top: number; width: number; height: number },
  targetRect: DOMRect | { left: number; top: number; width: number; height: number },
  onCenter: () => Promise<void>,
): Promise<void> {
  const flyer = document.createElement('div');
  const hasCover = Boolean(book.coverSrc);
  flyer.className = `booklist-flyer${hasCover ? ' has-cover' : ''}`;
  flyer.style.background = book.spine;
  flyer.style.color = book.text;
  flyer.innerHTML = hasCover
    ? `<img class="booklist-flyer-cover" src="${escAttr(book.coverSrc!)}" alt="${escAttr(book.title)} cover">`
    : `<div class="booklist-flyer-inner"><div class="booklist-flyer-title">${escHtml(shorten(book.title, 40))}</div></div>`;
  document.body.appendChild(flyer);
  applyRect(flyer, sourceRect);
  await waitFrame();
  moveRect(flyer, centerRect, 540, 'cubic-bezier(.2,.8,.2,1)', 1);
  await delay(560);
  await onCenter();
  moveRect(flyer, targetRect, 560, 'cubic-bezier(.4,0,.2,1)', 0);
  await delay(610);
  flyer.remove();
}

function applyRect(el: HTMLElement, r: { left: number; top: number; width: number; height: number }): void {
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${Math.max(24, r.width)}px`;
  el.style.height = `${Math.max(36, r.height)}px`;
  el.style.opacity = '1';
}

function moveRect(el: HTMLElement, r: { left: number; top: number; width: number; height: number }, ms: number, ease: string, opacity: number): void {
  el.style.transition = [`left ${ms}ms ${ease}`, `top ${ms}ms ${ease}`, `width ${ms}ms ${ease}`, `height ${ms}ms ${ease}`, `opacity ${Math.min(260, ms)}ms ease`].join(', ');
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${Math.max(24, r.width)}px`;
  el.style.height = `${Math.max(36, r.height)}px`;
  el.style.opacity = String(opacity);
}

function cssEscape(value: string): string {
  return value.replace(/[^\w-]/g, (c) => `\\${c}`);
}

function escAttr(value: string): string {
  return escHtml(value);
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildYears(books: ProfileBook[]): number[] {
  const finishedYears = books
    .filter((b) => isFinishedStatus(b.status))
    .map((b) => bookYear(b))
    .filter((y): y is number => Number.isFinite(y as number));
  const currentYear = new Date().getFullYear();
  const minYear = finishedYears.length ? Math.min(...finishedYears, currentYear - 1) : currentYear - 1;
  const years: number[] = [];
  for (let y = minYear; y <= currentYear; y++) years.push(y);
  return years.slice(-6);
}

function bookYear(book: ProfileBook): number | null {
  if (!book.finishedAt) return null;
  const y = new Date(book.finishedAt).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function isFinishedStatus(status: unknown): boolean {
  return status === 'read' || status === 'finished';
}

function describeYearActivity(year: number, finishedBooks: ProfileBook[], sessionDays: SessionDay[]): string {
  const sessionCount = sessionDays.filter((d) => d.date.startsWith(`${year}-`)).reduce((sum, d) => sum + d.sessions, 0);
  if (!sessionCount && !finishedBooks.length) return `No reading data for ${year}`;
  if (!sessionCount) return `${finishedBooks.length} finished ${finishedBooks.length === 1 ? 'book' : 'books'}`;
  return `${sessionCount} sessions · ${finishedBooks.length} ${finishedBooks.length === 1 ? 'book' : 'books'}`;
}

function buildHeatmap(year: number, sessionDays: SessionDay[]): Array<{ index: number; level: number; future: boolean; label: string }> {
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInYear = isLeap(year) ? 366 : 365;
  const dayMap = new Map(sessionDays.map((d) => [d.date, d]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const values: number[] = [];
  const rows: Array<{ index: number; level: number; future: boolean; label: string }> = [];

  for (let i = 0; i < daysInYear; i++) {
    const date = new Date(year, 0, i + 1);
    const key = dateKey(date);
    const entry = dayMap.get(key);
    const value = entry ? entry.sessions + entry.highlights * 0.6 + entry.minutes / 45 : 0;
    if (value > 0) values.push(value);
    rows.push({
      index: i,
      level: 0,
      future: year === today.getFullYear() && date > today,
      label: entry ? `${key} · ${entry.sessions} sessions · ${entry.minutes} min · ${entry.highlights} highlights` : `${key} · Quiet day`,
    });
  }

  const maxValue = Math.max(1, ...values);
  rows.forEach((row, i) => {
    if (row.future) return;
    const entry = dayMap.get(dateKey(new Date(year, 0, i + 1)));
    const value = entry ? entry.sessions + entry.highlights * 0.6 + entry.minutes / 45 : 0;
    if (value <= 0) return;
    const ratio = value / maxValue;
    row.level = ratio > 0.78 ? 4 : ratio > 0.56 ? 3 : ratio > 0.34 ? 2 : 1;
  });
  return rows;
}

function firstColumnOffset(year: number): number {
  return (new Date(year, 0, 1).getDay() + 6) % 7;
}

function renderMonthLabels(year: number, heatmap: Array<{ index: number }>): string {
  const offset = firstColumnOffset(year);
  return Array.from({ length: 12 }, (_, month) => {
    const first = new Date(year, month, 1);
    const dayIndex = heatmap.findIndex((_, i) => {
      const d = new Date(year, 0, i + 1);
      return d.getMonth() === month && d.getDate() === 1;
    });
    if (dayIndex < 0) return '';
    const col = Math.floor((offset + dayIndex) / 7) + 1;
    return `<span class="prof-year__month" style="grid-column:${col}">${first.toLocaleDateString('en-US', { month: 'short' })}</span>`;
  }).join('');
}


function getSpineSize(book: ProfileBook): { width: number; height: number } {
  const len = book.title.length;
  const width = len > 28 ? 52 : len > 18 ? 46 : 40;
  const seed = book.id.charCodeAt(0) % 5;
  return { width, height: 140 + seed * 8 };
}

function containsCJK(text: string): boolean {
  return /[一-鿿㐀-䶿　-〿＀-￯]/.test(text);
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
