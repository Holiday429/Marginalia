import { App } from '../core/app.js';
import { BooksStore } from '../store/books-store.ts';

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

interface YearReviewOptions {
  host: HTMLElement;
  books: ProfileBook[];
  sessionDays: SessionDay[];
  allowOpenDetails?: boolean;
}

interface YearReviewState {
  year: number;
  years: number[];
  filteredBooks: ProfileBook[];
  activeBookId: string;
  playTimer: ReturnType<typeof setTimeout> | null;
  playing: boolean;
}

export class ProfileYearInReview {
  private host: HTMLElement;
  private books: ProfileBook[];
  private sessionDays: SessionDay[];
  private allowOpenDetails: boolean;
  private state: YearReviewState;

  constructor({ host, books, sessionDays, allowOpenDetails = false }: YearReviewOptions) {
    this.host = host;
    this.books = books;
    this.sessionDays = sessionDays;
    this.allowOpenDetails = allowOpenDetails;
    const years = this.buildYears();
    this.state = {
      year: years[years.length - 1],
      years,
      filteredBooks: [],
      activeBookId: '',
      playTimer: null,
      playing: false,
    };
  }

  mount(): void {
    this.render();
    this.bind();
  }

  destroy(): void {
    if (this.state.playTimer) clearTimeout(this.state.playTimer);
    this.state.playTimer = null;
    this.state.playing = false;
  }

  private buildYears(): number[] {
    const finishedYears = this.books
      .map((book) => this.bookYear(book))
      .filter((year): year is number => Number.isFinite(year));
    const currentYear = new Date().getFullYear();
    const minYear = finishedYears.length ? Math.min(...finishedYears, currentYear - 3) : currentYear - 3;
    const years: number[] = [];
    for (let year = minYear; year <= currentYear; year++) years.push(year);
    return years.slice(-4);
  }

  private render(): void {
    const year = this.state.year;
    const filteredBooks = this.booksForYear(year);
    this.state.filteredBooks = filteredBooks;
    if (!filteredBooks.find((book) => book.id === this.state.activeBookId)) {
      this.state.activeBookId = filteredBooks[0]?.id ?? '';
    }
    const activeBook = filteredBooks.find((book) => book.id === this.state.activeBookId) ?? filteredBooks[0] ?? null;
    const heatmap = this.buildHeatmap(year);
    const maxLevel = Math.max(1, ...heatmap.map((day) => day.level));

    this.host.innerHTML = `
      <div class="prof-year">
        <div class="prof-year__topline">
          <div class="prof-year__switcher" id="profYearSwitcher">
            ${this.state.years.map((candidate) => `
              <button
                class="prof-year__chip${candidate === year ? ' is-active' : ''}"
                type="button"
                data-year="${candidate}"
              >${candidate}</button>
            `).join('')}
          </div>
          <button class="prof-year__play" id="profYearPlayBtn" type="button" ${filteredBooks.length <= 1 ? 'disabled' : ''}>
            ${this.state.playing ? 'Pause' : 'Play'}
          </button>
        </div>

        <div class="prof-year__rhythm">
          <div class="prof-year__rhythm-head">
            <h3 class="prof-year__subhead">Reading Rhythm</h3>
            <span class="prof-year__submeta">${this.describeYearActivity(year, filteredBooks)}</span>
          </div>
          ${heatmap.length
            ? `
              <div class="prof-year__heatmap">
                <div class="prof-year__months">${this.renderMonthLabels(year)}</div>
                <div class="prof-year__grid" id="profYearGrid" style="grid-template-columns:repeat(${Math.ceil((heatmap.length + this.firstColumnOffset(year)) / 7)}, minmax(0, 1fr));">
                  ${heatmap.map((day) => {
                    const pos = this.firstColumnOffset(year) + day.index;
                    const col = Math.floor(pos / 7) + 1;
                    const row = (pos % 7) + 1;
                    return `
                      <span
                        class="prof-year__cell${day.future ? ' is-future' : ''}${day.level > 0 ? ` is-l${Math.min(4, day.level)}` : ''}"
                        style="grid-column:${col};grid-row:${row}"
                        title="${day.label}"
                      ></span>
                    `;
                  }).join('')}
                </div>
              </div>
            `
            : `<p class="prof-year__empty">No reading sessions recorded for ${year}.</p>`}
          <div class="prof-year__legend">
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
        </div>

        <div class="prof-year__shelf-block">
          <div class="prof-year__shelf-head">
            <div>
              <h3 class="prof-year__subhead">Year-In-Reading Shelf</h3>
              <p class="prof-year__shelf-copy">A replay of the books that shaped ${year}.</p>
            </div>
            <span class="prof-year__submeta">${filteredBooks.length} ${filteredBooks.length === 1 ? 'arrival' : 'arrivals'}</span>
          </div>
          ${filteredBooks.length
            ? `
              <div class="prof-year__shelf-track" id="profYearShelfTrack">
                ${filteredBooks.map((book, index) => `
                  <button
                    class="prof-year__spine${book.id === activeBook?.id ? ' is-active' : ''}"
                    type="button"
                    data-book-id="${this.escape(book.id)}"
                    style="background:${this.escape(book.spine)};color:${this.escape(book.text)}"
                    title="${this.escape(book.title)}"
                  >
                    <span class="prof-year__spine-order">${String(index + 1).padStart(2, '0')}</span>
                    <span class="prof-year__spine-title">${this.escape(book.title)}</span>
                  </button>
                `).join('')}
              </div>
              <div class="prof-year__stage${activeBook ? ' has-book' : ''}" id="profYearStage">
                ${activeBook ? this.renderActiveBook(activeBook, year) : ''}
              </div>
            `
            : `<p class="prof-year__empty">No finished books in ${year} yet.</p>`}
        </div>
      </div>
    `;

    if (maxLevel <= 1) {
      this.host.querySelector('.prof-year__legend')?.classList.add('is-low-signal');
    }
  }

  private bind(): void {
    this.host.querySelector('#profYearSwitcher')?.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-year]');
      if (!btn) return;
      const nextYear = Number(btn.dataset.year);
      if (!Number.isFinite(nextYear) || nextYear === this.state.year) return;
      this.stopPlayback();
      this.state.year = nextYear;
      this.render();
      this.bind();
    });

    this.host.querySelector('#profYearPlayBtn')?.addEventListener('click', () => {
      if (this.state.playing) {
        this.stopPlayback();
      } else {
        this.startPlayback();
      }
      this.render();
      this.bind();
    });

    this.host.querySelector('#profYearShelfTrack')?.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-book-id]');
      if (!btn) return;
      const bookId = btn.dataset.bookId ?? '';
      this.stopPlayback();
      this.state.activeBookId = bookId;
      this.render();
      this.bind();
    });

    this.host.querySelector('#profYearStage')?.addEventListener('click', () => {
      if (!this.allowOpenDetails) return;
      const activeBook = this.state.filteredBooks.find((book) => book.id === this.state.activeBookId);
      if (!activeBook?.id || !BooksStore.getById(activeBook.id)) return;
      App.show('book', { id: activeBook.id });
    });
  }

  private startPlayback(): void {
    if (this.state.filteredBooks.length <= 1) return;
    this.state.playing = true;
    const currentIndex = Math.max(0, this.state.filteredBooks.findIndex((book) => book.id === this.state.activeBookId));
    const nextIndex = currentIndex >= this.state.filteredBooks.length - 1 ? 0 : currentIndex + 1;
    this.state.activeBookId = this.state.filteredBooks[nextIndex]?.id ?? this.state.activeBookId;
    this.state.playTimer = window.setTimeout(() => {
      if (!this.state.playing) return;
      this.render();
      this.bind();
      this.startPlayback();
    }, 1800);
  }

  private stopPlayback(): void {
    if (this.state.playTimer) clearTimeout(this.state.playTimer);
    this.state.playTimer = null;
    this.state.playing = false;
  }

  private booksForYear(year: number): ProfileBook[] {
    return this.books
      .filter((book) => isFinishedStatus(book.status) && this.bookYear(book) === year)
      .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  }

  private bookYear(book: ProfileBook): number | null {
    if (!book.finishedAt) return null;
    const year = new Date(book.finishedAt).getFullYear();
    return Number.isFinite(year) ? year : null;
  }

  private renderActiveBook(book: ProfileBook, year: number): string {
    const finished = book.finishedAt ? new Date(book.finishedAt) : null;
    const dateLabel = finished
      ? finished.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : `In ${year}`;
    return `
      <div class="prof-year__stage-card${this.allowOpenDetails && BooksStore.getById(book.id) ? ' is-openable' : ''}">
        <div class="prof-year__stage-cover" style="background:${this.escape(book.spine)};color:${this.escape(book.text)}">
          ${book.coverSrc
            ? `<img src="${this.escape(book.coverSrc)}" alt="${this.escape(book.title)} cover">`
            : `<span class="prof-year__stage-cover-title">${this.escape(book.title)}</span>`}
        </div>
        <div class="prof-year__stage-copy">
          <span class="prof-year__stage-kicker">${dateLabel}</span>
          <h4 class="prof-year__stage-title">${this.escape(book.title)}</h4>
          <p class="prof-year__stage-author">${this.escape(book.author)}</p>
          <p class="prof-year__stage-meta">${[book.genre, book.language].filter(Boolean).map((value) => this.escape(String(value))).join(' · ')}</p>
        </div>
      </div>
    `;
  }

  private buildHeatmap(year: number): Array<{ index: number; level: number; future: boolean; label: string }> {
    const daysInYear = new Date(year, 11, 31).getDate() === 31 ? 365 + (this.isLeapYear(year) ? 1 : 0) : 365;
    const dayMap = new Map(this.sessionDays.map((day) => [day.date, day]));
    const values: number[] = [];
    const rows: Array<{ index: number; level: number; future: boolean; label: string }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let index = 0; index < daysInYear; index++) {
      const date = new Date(year, 0, index + 1);
      const dateKey = this.dateKey(date);
      const entry = dayMap.get(dateKey);
      const value = entry ? entry.sessions + entry.highlights * 0.6 + entry.minutes / 45 : 0;
      if (value > 0) values.push(value);
      rows.push({ index, level: 0, future: year === today.getFullYear() && date > today, label: `${dateKey} · Quiet day` });
      if (entry) {
        rows[index].label = `${dateKey} · ${entry.sessions} sessions · ${entry.minutes} min · ${entry.highlights} highlights`;
      }
    }

    const maxValue = Math.max(1, ...values);
    rows.forEach((row, index) => {
      if (row.future) return;
      const date = new Date(year, 0, index + 1);
      const entry = dayMap.get(this.dateKey(date));
      const value = entry ? entry.sessions + entry.highlights * 0.6 + entry.minutes / 45 : 0;
      if (value <= 0) return;
      const ratio = value / maxValue;
      row.level = ratio > 0.78 ? 4 : ratio > 0.56 ? 3 : ratio > 0.34 ? 2 : 1;
    });
    return rows;
  }

  private renderMonthLabels(year: number): string {
    const offset = this.firstColumnOffset(year);
    return Array.from({ length: 12 }, (_, month) => {
      const first = new Date(year, month, 1);
      const dayIndex = this.dayOfYear(first) - 1;
      const col = Math.floor((offset + dayIndex) / 7) + 1;
      return `<span class="prof-year__month" style="grid-column:${col}">${first.toLocaleDateString('en-US', { month: 'short' })}</span>`;
    }).join('');
  }

  private firstColumnOffset(year: number): number {
    return (new Date(year, 0, 1).getDay() + 6) % 7;
  }

  private dayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date.getTime() - start.getTime()) / 86400000);
  }

  private describeYearActivity(year: number, filteredBooks: ProfileBook[]): string {
    const sessionCount = this.sessionDays.filter((day) => day.date.startsWith(`${year}-`)).reduce((sum, day) => sum + day.sessions, 0);
    if (!sessionCount && !filteredBooks.length) return `Waiting for the first finished book in ${year}`;
    if (!sessionCount) return `${filteredBooks.length} finished books`;
    return `${sessionCount} reading sessions · ${filteredBooks.length} finished books`;
  }

  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  private escape(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

function isFinishedStatus(status: unknown): boolean {
  return status === 'read' || status === 'finished';
}
