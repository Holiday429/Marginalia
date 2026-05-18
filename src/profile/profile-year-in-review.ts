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
  sourceIndex?: number;
  rank?: number;
  isFeatured?: boolean;
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
  isOwner?: boolean;
  db?: any;
  uid?: string;
  savedOrder?: string[] | null;
}

interface AnnualShelfState {
  yearIndex: number;
  isAnimating: boolean;
  previewBookId: string;
  playMode: 'play' | 'organize' | 'replay';
  curateMode: boolean;
  curatedOrder: string[];
}

interface YearShelfData {
  sourceBooks: ProfileBook[];
  selectedBooks: ProfileBook[];
  yearBooks: ProfileBook[];
}

const ANNUAL_TARGET_COUNT = 10;
const SOURCE_SHELF_MIN_COUNT = 12;
const SOURCE_SHELF_MAX_COUNT = 16;

export class ProfileAnnualShelf {
  private host: HTMLElement;
  private books: ProfileBook[];
  private sessionDays: SessionDay[];
  private allowOpenDetails: boolean;
  private showRhythm: boolean;
  private isOwner: boolean;
  private db: any;
  private uid: string;
  private savedOrder: string[] | null;
  private years: number[];
  private state: AnnualShelfState;

  constructor({ host, books, sessionDays, allowOpenDetails = false, showRhythm = true, isOwner = false, db = null, uid = '', savedOrder = null }: AnnualShelfOptions) {
    this.host = host;
    this.books = books;
    this.sessionDays = sessionDays;
    this.allowOpenDetails = allowOpenDetails;
    this.showRhythm = showRhythm;
    this.isOwner = isOwner;
    this.db = db;
    this.uid = uid;
    this.savedOrder = savedOrder;
    this.years = buildYears(books);
    this.state = { yearIndex: this.years.length - 1, isAnimating: false, previewBookId: '', playMode: 'play', curateMode: false, curatedOrder: [] };
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

  private shelfDataForYear(year: number): YearShelfData {
    return buildYearShelfData(this.books, year, this.savedOrder);
  }

  private render(): void {
    const year = this.year;
    const shelfData = this.shelfDataForYear(year);
    const selectedBooks = shelfData.selectedBooks;
    const canPrev = this.state.yearIndex > 0;
    const canNext = this.state.yearIndex < this.years.length - 1;

    const streak = buildStreakSnapshot(year, this.sessionDays);
    const heatmap = this.showRhythm ? streak.heatmap : [];
    const maxLevel = heatmap.length ? Math.max(1, ...heatmap.map((d) => d.level)) : 1;
    const meta = describeYearActivity(year, shelfData.yearBooks, shelfData.sourceBooks, this.sessionDays);

    this.host.innerHTML = `
      <div class="prof-annual">

        ${this.showRhythm ? `
          <section class="prof-annual__block" aria-label="Reading Streak">
            <div class="prof-section__head">
              <div>
                <h2 class="prof-section__title">Reading Streak</h2>
                <p class="prof-section__subcopy">A warm trace of how steadily the reading fire kept going.</p>
              </div>
              <div class="prof-annual__shelf-controls">
                <div class="prof-rhythm__year-nav">
                  <button class="prof-rhythm__arrow" id="profAnnualPrev" type="button" aria-label="Previous year" ${canPrev ? '' : 'disabled'}>&#8249;</button>
                  <span class="prof-rhythm__year">${year}</span>
                  <button class="prof-rhythm__arrow" id="profAnnualNext" type="button" aria-label="Next year" ${canNext ? '' : 'disabled'}>&#8250;</button>
                </div>
              </div>
            </div>
            <div class="prof-streak-card">
              <div class="prof-streak-card__summary">
                <span class="prof-streak-card__eyebrow">${escHtml(streak.eyebrow)}</span>
                <span class="prof-streak-card__flame" aria-hidden="true"><span></span></span>
                <div class="prof-streak-card__days">${streak.displayDays}</div>
                <div class="prof-streak-card__label">${escHtml(streak.dayLabel)}</div>
                <p class="prof-streak-card__note">${escHtml(streak.note)}</p>
                <div class="prof-streak-card__meta">
                  <div class="prof-streak-card__meta-item">
                    <span>Longest ${year}</span>
                    <strong>${streak.longestYear}</strong>
                  </div>
                  <div class="prof-streak-card__meta-item">
                    <span>Reading Days</span>
                    <strong>${streak.readingDays}</strong>
                  </div>
                </div>
              </div>
              <div class="prof-streak-card__heatmap">
                <div class="prof-rhythm__meta-row">
                  <span class="prof-rhythm__meta">${escHtml(meta)}</span>
                </div>
                ${streak.insight ? `<p class="prof-rhythm__insight">${escHtml(streak.insight)}</p>` : ''}
              ${heatmap.length
                ? `
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
              `
                : `<p class="prof-year__empty">No reading sessions recorded for ${year}.</p>`}
              </div>
            </div>
          </section>
        ` : ''}

        <section class="prof-annual__block" aria-label="Reading Shelf">
          <div class="prof-section__head">
            <div>
              <h2 class="prof-section__title">Reading Shelf</h2>
              <p class="prof-section__subcopy">Top 10 books that shaped this year</p>
            </div>
            <div class="prof-annual__shelf-controls">
              ${!this.showRhythm ? `
                <div class="prof-rhythm__year-nav">
                  <button class="prof-rhythm__arrow" id="profAnnualPrevShelf" type="button" aria-label="Previous year" ${canPrev ? '' : 'disabled'}>&#8249;</button>
                  <span class="prof-rhythm__year">${year}</span>
                  <button class="prof-rhythm__arrow" id="profAnnualNextShelf" type="button" aria-label="Next year" ${canNext ? '' : 'disabled'}>&#8250;</button>
                </div>
              ` : ''}
              <span id="profAnnualCounter" class="prof-rhythm__meta"></span>
              ${selectedBooks.length >= 2 ? `
                <button class="booklist-play-btn booklist-play-btn--icon" id="profAnnualPlayBtn" type="button" data-mode="${this.state.playMode}" aria-label="Play annual shelf">
                  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><polygon points="4,2 14,8 4,14"/></svg>
                </button>
              ` : ''}
              ${this.isOwner ? `
                <button class="prof-annual__curate-toggle" id="profAnnualCurateToggle" type="button">${this.state.curateMode ? 'Done' : 'Curate'}</button>
              ` : ''}
            </div>
          </div>
          ${this.state.curateMode ? `
            <div class="prof-annual__curate-bar">
              <span class="prof-annual__curate-label">Drag to rank your top ${ANNUAL_TARGET_COUNT}</span>
              <div class="prof-annual__curate-actions">
                <button id="profAnnualPreviewBtn" type="button" class="prof-annual__curate-btn" ${this.state.curatedOrder.length >= 2 ? '' : 'disabled'}>
                  Preview animation
                </button>
                <button id="profAnnualSaveBtn" type="button" class="prof-annual__curate-btn prof-annual__curate-btn--primary" ${this.state.curatedOrder.length >= 2 ? '' : 'disabled'}>
                  Save &amp; publish
                </button>
              </div>
            </div>
          ` : ''}
          <div class="prof-annual__card">
            ${selectedBooks.length ? `
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
                  <h3 class="booklist-subheading">Shelf spread</h3>
                </div>
                <div class="booklist-source-track" id="profAnnualSourceShelf"></div>
              </section>
            ` : `<p class="prof-year__empty">No shelf books available for ${year}.</p>`}
          </div>
        </section>

      </div>
    `;

    if (selectedBooks.length) {
      this.renderRacks(selectedBooks);
      this.renderSourceShelf(shelfData.sourceBooks, selectedBooks);
      updateCounter(this.host, 0, selectedBooks.length);
      // Show first book as static preview
      this.showStaticPreview(selectedBooks[0], selectedBooks);
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

        if (this.state.curateMode) {
          const rankIdx = this.state.curatedOrder.indexOf(book.id);
          const rankLabel = rankIdx >= 0 ? String(rankIdx + 1) : '—';
          const rankEl = document.createElement('span');
          rankEl.className = 'prof-annual__slot-rank';
          rankEl.setAttribute('aria-hidden', 'true');
          rankEl.textContent = rankLabel;
          slot.appendChild(rankEl);

          slot.setAttribute('draggable', 'true');
          slot.dataset.dragType = 'slot';
        }

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

  private renderSourceShelf(sourceBooks: ProfileBook[], selectedBooks: ProfileBook[]): void {
    const host = this.host.querySelector<HTMLElement>('#profAnnualSourceShelf');
    if (!host) return;
    host.innerHTML = '';
    const selectedIds = new Set(selectedBooks.map((book) => book.id));
    sourceBooks.forEach((book, i) => {
      const size = getSpineSize(book);
      const inCurated = this.state.curateMode && this.state.curatedOrder.includes(book.id);
      const hideAuthor = shouldHideSpineAuthor(book.title, book.author);
      // Last two spines lean, as if they've fallen against the others.
      const tilt = !this.state.curateMode && i === sourceBooks.length - 1
        ? -3
        : !this.state.curateMode && i === sourceBooks.length - 2
          ? -1
          : 0;
      const spine = SpineCard.create({
        title: book.title,
        author: hideAuthor ? '' : book.author,
        spine: book.spine,
        text: book.text,
        width: size.width,
        height: size.height,
        className: 'booklist-spine',
        extraClasses: [
          ...(selectedIds.has(book.id) ? ['is-picked'] : []),
          ...(inCurated ? ['is-curated'] : []),
        ],
        dataAttrs: {
          sourceId: book.id,
          ...(this.state.curateMode ? { draggable: 'true', dragType: 'source' } : {}),
        },
        ariaLabel: `${book.title} by ${book.author}`,
        titleClass: `booklist-spine-title${containsCJK(book.title) ? ' is-cjk' : ''}`,
        authorClass: `booklist-spine-author${containsCJK(book.author) ? ' is-cjk' : ''}`,
      });
      if (this.state.curateMode) {
        // Curate mode: flat draggable spines, no tilt/tooltip wrapper.
        spine.setAttribute('draggable', 'true');
        host.appendChild(spine);
        return;
      }
      if (tilt) spine.style.setProperty('--spine-tilt', `${tilt}deg`);
      spine.classList.add('booklist-spine--leanable');
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
      this.state.playMode = 'play';
      this.state.curateMode = false;
      this.state.curatedOrder = [];
      this.render();
      this.bind();
    };

    this.host.querySelector('#profAnnualPrev')?.addEventListener('click', () => changeYear(-1));
    this.host.querySelector('#profAnnualNext')?.addEventListener('click', () => changeYear(1));
    this.host.querySelector('#profAnnualPrevShelf')?.addEventListener('click', () => changeYear(-1));
    this.host.querySelector('#profAnnualNextShelf')?.addEventListener('click', () => changeYear(1));

    const playBtn = this.host.querySelector<HTMLButtonElement>('#profAnnualPlayBtn');
    playBtn?.addEventListener('click', () => {
      const mode = playBtn.dataset.mode || 'play';
      if (mode === 'organize') this.runOrganize(playBtn);
      else this.startAnimation(playBtn);
    });

    // Curate toggle button
    this.host.querySelector<HTMLButtonElement>('#profAnnualCurateToggle')?.addEventListener('click', () => {
      this.state.curateMode = !this.state.curateMode;
      if (!this.state.curateMode) this.state.curatedOrder = [];
      this.render();
      this.bind();
    });

    // Click slot → preview or curate-remove
    this.host.querySelector('#profAnnualRacks')?.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.booklist-slot');
      if (!slot || this.state.isAnimating) return;
      if (this.state.curateMode) {
        const id = slot.dataset.slotId ?? '';
        const idx = this.state.curatedOrder.indexOf(id);
        if (idx >= 0) {
          this.state.curatedOrder.splice(idx, 1);
          this.refreshCurateUI();
        }
        return;
      }
      const selectedBooks = this.shelfDataForYear(this.year).selectedBooks;
      const book = selectedBooks.find((b) => b.id === slot.dataset.slotId);
      if (book) this.showStaticPreview(book, selectedBooks);
    });

    // Click source spine → curate-add
    this.host.querySelector('#profAnnualSourceShelf')?.addEventListener('click', (e) => {
      if (!this.state.curateMode) return;
      const spine = (e.target as HTMLElement).closest<HTMLElement>('.booklist-spine');
      if (!spine) return;
      const id = spine.dataset.sourceId ?? '';
      if (!id || this.state.curatedOrder.includes(id)) return;
      if (this.state.curatedOrder.length >= ANNUAL_TARGET_COUNT) return;
      this.state.curatedOrder.push(id);
      this.refreshCurateUI();
    });

    // Curate mode: drag-and-drop
    if (this.state.curateMode) this.bindCurateDrag();

    // Preview button
    this.host.querySelector<HTMLButtonElement>('#profAnnualPreviewBtn')?.addEventListener('click', async () => {
      if (this.state.curatedOrder.length < 2) return;
      const prevCurateMode = this.state.curateMode;
      this.state.curateMode = false;
      const playBtn2 = this.host.querySelector<HTMLButtonElement>('#profAnnualPlayBtn');
      if (playBtn2) await this.startAnimation(playBtn2);
      this.state.curateMode = prevCurateMode;
      this.render();
      this.bind();
    });

    // Save button
    this.host.querySelector<HTMLButtonElement>('#profAnnualSaveBtn')?.addEventListener('click', async () => {
      if (!this.db || !this.uid || this.state.curatedOrder.length < 2) return;
      const btn = this.host.querySelector<HTMLButtonElement>('#profAnnualSaveBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const { saveAnnualShelf } = await import('./annual-shelf-store.ts');
        await saveAnnualShelf(this.db, this.uid, this.year, this.state.curatedOrder);
        this.savedOrder = [...this.state.curatedOrder];
        if (btn) { btn.textContent = 'Saved'; setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = 'Save & publish'; } }, 2000); }
      } catch {
        if (btn) { btn.disabled = false; btn.textContent = 'Save & publish'; }
      }
    });

    // Click stage → open book detail (owner only)
    this.host.querySelector('#profAnnualStage')?.addEventListener('click', () => {
      if (!this.allowOpenDetails || this.state.isAnimating || this.state.curateMode) return;
      const book = this.shelfDataForYear(this.year).selectedBooks.find((b) => b.id === this.state.previewBookId);
      if (book?.id && BooksStore.getById(book.id)) App.show('book', { id: book.id });
    });
  }

  private refreshCurateUI(): void {
    // Update rank overlays on all rack slots
    this.host.querySelectorAll<HTMLElement>('.booklist-slot').forEach((slot) => {
      const id = slot.dataset.slotId ?? '';
      const rankEl = slot.querySelector<HTMLElement>('.prof-annual__slot-rank');
      if (rankEl) {
        const idx = this.state.curatedOrder.indexOf(id);
        rankEl.textContent = idx >= 0 ? String(idx + 1) : '—';
      }
    });
    // Highlight curated spines
    this.host.querySelectorAll<HTMLElement>('.booklist-spine').forEach((spine) => {
      const id = spine.dataset.sourceId ?? '';
      spine.classList.toggle('is-curated', this.state.curatedOrder.includes(id));
    });
    // Enable/disable buttons
    const hasEnough = this.state.curatedOrder.length >= 2;
    this.host.querySelector<HTMLButtonElement>('#profAnnualPreviewBtn')?.toggleAttribute('disabled', !hasEnough);
    this.host.querySelector<HTMLButtonElement>('#profAnnualSaveBtn')?.toggleAttribute('disabled', !hasEnough);
  }

  private bindCurateDrag(): void {
    let dragBookId = '';
    let dragType: 'source' | 'slot' = 'source';

    const onDragStart = (e: DragEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[draggable="true"]');
      if (!el) return;
      dragBookId = el.dataset.sourceId ?? el.dataset.slotId ?? '';
      dragType = (el.dataset.dragType as 'source' | 'slot') ?? 'source';
      e.dataTransfer?.setData('text/plain', dragBookId);
    };

    const onDragOver = (e: DragEvent) => { e.preventDefault(); };

    const onDropOnSlot = (e: DragEvent) => {
      e.preventDefault();
      const slot = (e.target as HTMLElement).closest<HTMLElement>('.booklist-slot');
      if (!slot || !dragBookId) return;
      const targetId = slot.dataset.slotId ?? '';
      if (dragType === 'source') {
        if (!this.state.curatedOrder.includes(dragBookId) && this.state.curatedOrder.length < ANNUAL_TARGET_COUNT) {
          const targetIdx = this.state.curatedOrder.indexOf(targetId);
          if (targetIdx >= 0) {
            this.state.curatedOrder.splice(targetIdx, 0, dragBookId);
          } else {
            this.state.curatedOrder.push(dragBookId);
          }
          this.refreshCurateUI();
        }
      } else {
        // Reorder within rack
        const fromIdx = this.state.curatedOrder.indexOf(dragBookId);
        const toIdx = this.state.curatedOrder.indexOf(targetId);
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          this.state.curatedOrder.splice(fromIdx, 1);
          this.state.curatedOrder.splice(toIdx, 0, dragBookId);
          this.refreshCurateUI();
        }
      }
      dragBookId = '';
    };

    const onDropOnSource = (e: DragEvent) => {
      e.preventDefault();
      if (dragType === 'slot' && dragBookId) {
        const idx = this.state.curatedOrder.indexOf(dragBookId);
        if (idx >= 0) {
          this.state.curatedOrder.splice(idx, 1);
          this.refreshCurateUI();
        }
      }
      dragBookId = '';
    };

    this.host.addEventListener('dragstart', onDragStart as EventListener);
    const racksEl = this.host.querySelector<HTMLElement>('#profAnnualRacks');
    racksEl?.addEventListener('dragover', onDragOver as EventListener);
    racksEl?.addEventListener('drop', onDropOnSlot as EventListener);
    const sourceEl = this.host.querySelector<HTMLElement>('#profAnnualSourceShelf');
    sourceEl?.addEventListener('dragover', onDragOver as EventListener);
    sourceEl?.addEventListener('drop', onDropOnSource as EventListener);
  }

  private async startAnimation(playBtn: HTMLButtonElement): Promise<void> {
    if (this.state.isAnimating) return;
    const shelfData = this.shelfDataForYear(this.year);
    const selectedBooks = shelfData.selectedBooks;
    if (selectedBooks.length < 2) return;

    this.state.isAnimating = true;
    playBtn.disabled = true;
    playBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>';

    // Reset racks + source shelf
    this.renderRacks(selectedBooks);
    this.renderSourceShelf(shelfData.sourceBooks, selectedBooks);
    updateCounter(this.host, 0, selectedBooks.length);
    resetStageOverlays(this.host);

    const stage = this.host.querySelector<HTMLElement>('#profAnnualStage');
    const bookHost = this.host.querySelector<HTMLElement>('#profAnnualStageBook');
    const titleEl = this.host.querySelector<HTMLElement>('#profAnnualStageTitle');
    const authorEl = this.host.querySelector<HTMLElement>('#profAnnualStageAuthor');

    // Play 10 → 1
    const placement = [...selectedBooks].reverse(); // highest rank (10) first, No.1 last
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
        if (rankNumber === 1) {
          revealBadge(this.host);
          await this.triggerNo1Reveal(book, this.year);
        }
        await delay(520);
      });

      revealSlot(this.host, book.id);
      updateCounter(this.host, i + 1, total);
      this.state.previewBookId = book.id;
      await delay(170);
    }

    if (stage) stage.classList.add('is-idle');

    this.state.isAnimating = false;
    this.state.playMode = 'organize';
    playBtn.disabled = false;
    playBtn.dataset.mode = 'organize';
    playBtn.innerHTML = 'Organize';
    playBtn.classList.remove('booklist-play-btn--icon');
    playBtn.style.width = '';

    // Keep No.1 book on stage
    const favourite = selectedBooks[0];
    if (favourite) this.showStaticPreview(favourite, selectedBooks);
  }

  private async runOrganize(playBtn: HTMLButtonElement): Promise<void> {
    if (this.state.isAnimating) return;
    this.state.isAnimating = true;
    playBtn.disabled = true;
    playBtn.innerHTML = 'Organizing…';

    await this.compactSourceShelf();

    const selectedBooks = this.shelfDataForYear(this.year).selectedBooks;
    const favourite = selectedBooks[0];
    if (favourite) this.showStaticPreview(favourite, selectedBooks);

    this.state.isAnimating = false;
    this.state.playMode = 'replay';
    playBtn.disabled = false;
    playBtn.dataset.mode = 'replay';
    playBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><polygon points="4,2 14,8 4,14"/></svg>';
    playBtn.classList.add('booklist-play-btn--icon');
  }

  private async compactSourceShelf(): Promise<void> {
    const track = this.host.querySelector<HTMLElement>('#profAnnualSourceShelf');
    if (!track) return;

    const moving = [...track.querySelectorAll<HTMLElement>('.booklist-spine:not(.is-gone)')];
    const before = new Map(moving.map((el) => [el.dataset.sourceId ?? '', el.getBoundingClientRect()]));

    track.querySelectorAll('.booklist-spine.is-gone').forEach((el) => el.remove());
    moving.forEach((el) => el.classList.remove('is-lifting', 'is-gone', 'is-dimmed'));

    void track.offsetWidth;

    moving.forEach((el) => {
      const id = el.dataset.sourceId ?? '';
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

  private async triggerNo1Reveal(book: ProfileBook, year: number): Promise<void> {
    const overlay = document.getElementById('annualRevealOverlay');
    const titleEl = document.getElementById('annualRevealTitle');
    const authorEl = document.getElementById('annualRevealAuthor');
    const kickerEl = overlay?.querySelector<HTMLElement>('.annual-reveal-kicker');
    const yearEl = document.getElementById('annualRevealYear');

    if (!overlay || !titleEl || !authorEl) return;

    if (yearEl) yearEl.textContent = String(year);
    if (kickerEl && !yearEl) kickerEl.textContent = `No. 1 · ${year}`;
    titleEl.textContent = book.title;
    authorEl.textContent = book.author;

    overlay.classList.add('is-active');
    overlay.setAttribute('aria-hidden', 'false');

    await delay(2800);
    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-hidden', 'true');
    await delay(450);
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

function buildYearShelfData(books: ProfileBook[], year: number, savedOrder: string[] | null = null): YearShelfData {
  const uniqueBooks = dedupeBooks(books)
    .filter((book) => book.title && book.author)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || a.title.localeCompare(b.title));

  const yearBooks = uniqueBooks.filter((book) => isFinishedStatus(book.status) && bookYear(book) === year);
  const chosen = new Set(yearBooks.map((book) => book.id));

  const sourceBooks = [...yearBooks];
  const backfill = uniqueBooks
    .filter((book) => !chosen.has(book.id))
    .sort((a, b) => annualYearAffinity(b, year) - annualYearAffinity(a, year) || annualScore(b, year) - annualScore(a, year));

  const sourceTarget = Math.min(
    SOURCE_SHELF_MAX_COUNT,
    Math.max(SOURCE_SHELF_MIN_COUNT, Math.min(uniqueBooks.length, ANNUAL_TARGET_COUNT + 2)),
  );

  for (const book of backfill) {
    if (sourceBooks.length >= sourceTarget) break;
    sourceBooks.push(book);
  }

  const sourceWithIndex = sourceBooks.map((book, index) => ({ ...book, sourceIndex: index }));
  let selectedBooks = selectAnnualBooks(sourceWithIndex, Math.min(ANNUAL_TARGET_COUNT, sourceWithIndex.length), year);

  if (savedOrder && savedOrder.length > 0) {
    const idToBook = new Map(sourceWithIndex.map((b) => [b.id, b]));
    const ordered: ProfileBook[] = [];
    savedOrder.forEach((id, idx) => {
      const b = idToBook.get(id);
      if (b) ordered.push({ ...b, rank: idx, isFeatured: idx === 0 });
    });
    if (ordered.length > 0) selectedBooks = ordered;
  }

  return { sourceBooks: sourceWithIndex, selectedBooks, yearBooks };
}

function dedupeBooks(books: ProfileBook[]): ProfileBook[] {
  const seen = new Set<string>();
  return books.filter((book) => {
    const key = String(book.id || `${book.title}::${book.author}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAnnualStatus(status: unknown): 'finished' | 'reading' | 'want' {
  if (status === 'read' || status === 'finished') return 'finished';
  if (status === 'reading') return 'reading';
  return 'want';
}

function annualYearAffinity(book: ProfileBook, year: number): number {
  const bookFinishedYear = bookYear(book);
  if (bookFinishedYear === year) return 2000;
  if (bookFinishedYear === null) return normalizeAnnualStatus(book.status) === 'reading' ? 420 : 160;
  return Math.max(0, 240 - Math.abs(bookFinishedYear - year) * 80);
}

function selectAnnualBooks(sourceBooks: ProfileBook[], count: number, year: number): ProfileBook[] {
  const seen = new Set<string>();
  const ranked: ProfileBook[] = [];

  (['finished', 'reading', 'want'] as const).forEach((status) => {
    sourceBooks
      .filter((book) => normalizeAnnualStatus(book.status) === status)
      .sort((a, b) => annualScore(b, year) - annualScore(a, year))
      .forEach((book) => {
        if (seen.has(book.id)) return;
        seen.add(book.id);
        ranked.push(book);
      });
  });

  const spread: ProfileBook[] = [];
  const used = new Set<string>();
  while (spread.length < count && spread.length < ranked.length) {
    let best: ProfileBook | null = null;
    let bestScore = -Infinity;

    ranked.forEach((candidate) => {
      if (used.has(candidate.id)) return;
      let score = annualScore(candidate, year);
      if (spread.length) {
        const nearest = Math.min(...spread.map((pick) => Math.abs((pick.sourceIndex ?? 0) - (candidate.sourceIndex ?? 0))));
        if (nearest <= 1) score -= 520;
        else if (nearest === 2) score -= 170;
      }
      score += seededNoiseYB(((candidate.sourceIndex ?? 0) + 1) * 173 + (spread.length + 1) * 37) * 36;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    if (!best) break;
    const chosenBook: ProfileBook = best as ProfileBook;
    used.add(chosenBook.id);
    spread.push(chosenBook);
  }

  return spread.map((book, index) => ({
    ...book,
    rank: index,
    isFeatured: index === 0,
  }));
}

function annualScore(book: ProfileBook, year: number): number {
  let score = annualYearAffinity(book, year);
  const status = normalizeAnnualStatus(book.status);
  if (status === 'finished') score += 820;
  else if (status === 'reading') score += 420;
  else score += 80;

  if (book.coverSrc) score += 24;
  if (book.genre) score += 12;
  if (book.language) score += 8;
  score += (book.finishedAt ?? 0) / 100000000000;
  return score;
}

function seededNoiseYB(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
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

function describeYearActivity(year: number, finishedBooks: ProfileBook[], sourceBooks: ProfileBook[], sessionDays: SessionDay[]): string {
  const sessionCount = sessionDays.filter((d) => d.date.startsWith(`${year}-`)).reduce((sum, d) => sum + d.sessions, 0);
  if (!sessionCount && !finishedBooks.length && sourceBooks.length) return `Previewing ${sourceBooks.length} shelf books`;
  if (!sessionCount && !finishedBooks.length) return `No reading data for ${year}`;
  if (!sessionCount) return `${finishedBooks.length} finished ${finishedBooks.length === 1 ? 'book' : 'books'}`;
  return `${sessionCount} sessions · ${finishedBooks.length} ${finishedBooks.length === 1 ? 'book' : 'books'}`;
}

function describeRhythmInsight(year: number, sessionDays: SessionDay[]): string {
  const yearDays = sessionDays.filter((day) => day.date.startsWith(`${year}-`));
  if (!yearDays.length) return '';

  const totalMinutes = yearDays.reduce((sum, day) => sum + day.minutes, 0);
  const activeDays = yearDays.filter((day) => day.sessions > 0);
  const avgMinutes = activeDays.length ? Math.round(totalMinutes / activeDays.length) : 0;
  const longestStreak = longestReadingStreak(activeDays.map((day) => day.date));
  const peakMonth = busiestMonth(yearDays);

  if (longestStreak >= 10) {
    return `${peakMonth} carried the strongest stretch, with a ${longestStreak}-day reading streak and ${avgMinutes} minutes on active days.`;
  }
  if (activeDays.length >= 18) {
    return `${peakMonth} was the busiest month; the rhythm stayed steady at about ${avgMinutes} minutes each time you showed up to read.`;
  }
  return `The rhythm was more episodic than daily, with the clearest cluster in ${peakMonth} and ${avgMinutes} minutes on active reading days.`;
}

function buildStreakSnapshot(year: number, sessionDays: SessionDay[]): {
  displayDays: number;
  dayLabel: string;
  eyebrow: string;
  note: string;
  longestYear: number;
  readingDays: number;
  insight: string;
  heatmap: Array<{ index: number; level: number; future: boolean; label: string }>;
} {
  const yearDays = sessionDays.filter((day) => day.date.startsWith(`${year}-`));
  const readingDays = yearDays.filter((day) => day.sessions > 0).length;
  const longestYear = longestReadingStreak(yearDays.filter((day) => day.sessions > 0).map((day) => day.date));
  const currentAcrossAll = trailingReadingStreak(sessionDays.filter((day) => day.sessions > 0).map((day) => day.date));
  const displayDays = Math.max(1, currentAcrossAll || longestYear || 0);
  const heatmap = buildHeatmap(year, sessionDays);
  return {
    displayDays,
    dayLabel: currentAcrossAll > 0 ? 'days in a row' : 'day stretch',
    eyebrow: currentAcrossAll > 0 ? 'Current Streak' : `Best Run of ${year}`,
    note: currentAcrossAll > 0 ? 'Keep it glowing.' : (longestYear > 0 ? 'The brightest cluster this year.' : 'The spark starts with a single page.'),
    longestYear,
    readingDays,
    insight: describeRhythmInsight(year, sessionDays),
    heatmap,
  };
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

/** Bucket a year's session minutes into 52 weekly totals. */
function buildWeeklyMinutes(year: number, sessionDays: SessionDay[]): number[] {
  const weeks = new Array<number>(52).fill(0);
  sessionDays.forEach((day) => {
    const date = new Date(day.date);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) return;
    const dayOfYear = Math.floor((date.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
    const week = Math.min(51, Math.max(0, Math.floor(dayOfYear / 7)));
    weeks[week] += day.minutes;
  });
  return weeks;
}

function longestReadingStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const normalized = [...new Set(dates)].sort();
  let best = 1;
  let current = 1;
  for (let index = 1; index < normalized.length; index++) {
    const prev = new Date(`${normalized[index - 1]}T00:00:00Z`).getTime();
    const next = new Date(`${normalized[index]}T00:00:00Z`).getTime();
    if (next - prev === 86400000) current += 1;
    else current = 1;
    if (current > best) best = current;
  }
  return best;
}

function trailingReadingStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const normalized = [...new Set(dates)].sort();
  let streak = 1;
  for (let index = normalized.length - 1; index > 0; index--) {
    const previous = new Date(`${normalized[index - 1]}T00:00:00Z`).getTime();
    const current = new Date(`${normalized[index]}T00:00:00Z`).getTime();
    if (current - previous === 86400000) streak += 1;
    else break;
  }
  return streak;
}

function busiestMonth(sessionDays: SessionDay[]): string {
  const monthTotals = new Array<number>(12).fill(0);
  sessionDays.forEach((day) => {
    const date = new Date(day.date);
    if (Number.isNaN(date.getTime())) return;
    monthTotals[date.getMonth()] += day.minutes + day.sessions * 12 + day.highlights * 6;
  });
  const peakMonth = monthTotals.indexOf(Math.max(...monthTotals));
  return new Date(2000, Math.max(0, peakMonth), 1).toLocaleDateString('en-US', { month: 'long' });
}

/** 52-week bar chart — alternate view of the streak heatmap. */
function renderRhythmChart(year: number, sessionDays: SessionDay[]): string {
  const weeks = buildWeeklyMinutes(year, sessionDays);
  const max = Math.max(1, ...weeks);
  const peakIdx = weeks.indexOf(Math.max(...weeks));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const bars = weeks.map((minutes, i) => {
    const heightPct = Math.round((minutes / max) * 100);
    const isPeak = i === peakIdx && minutes > 0;
    return `
      <div class="prof-rhythm-chart__bar${isPeak ? ' is-peak' : ''}" style="height:${Math.max(2, heightPct)}%">
        ${isPeak ? '<span class="prof-rhythm-chart__peak-note">↓ peak week</span>' : ''}
        <span class="prof-rhythm-chart__bar-tip">wk ${i + 1} · ${minutes} min</span>
      </div>
    `;
  }).join('');

  return `
    <div class="prof-rhythm-chart">
      <div class="prof-rhythm-chart__months">${months.map((m) => `<span>${m}</span>`).join('')}</div>
      <div class="prof-rhythm-chart__bars">${bars}</div>
    </div>
  `;
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

function shouldHideSpineAuthor(title: string, author: string): boolean {
  if (!author.trim()) return true;
  if (containsCJK(title)) return title.length >= 7;
  return title.length >= 22;
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
