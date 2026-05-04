// Marginalia · Desk slot — shows currently-reading book + session start/stop
// Implements SlotComponent; mounted by createThreeRoomPreview via mountSlot('desk').

import type { SlotComponent } from '../../three/slots.ts';
import { BooksStore } from '../../store/books-store.ts';
import {
  getActive,
  start as sessionStart,
  stop as sessionStop,
  formatDuration,
} from './reading-session.ts';

const WIDTH  = 420;
const HEIGHT = 180;

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c as string] ?? c,
  );
}

function render(container: HTMLElement): void {
  const books = BooksStore.getByStatus('reading');
  const active = getActive();

  if (!books.length) {
    container.innerHTML = `<div class="desk-slot"></div>`;
    return;
  }

  const book = active ? (books.find((b) => b.id === active.bookId) ?? books[0]) : books[0];
  const cv = (book.cover as Record<string, string>) ?? {};
  const isActive = active?.bookId === book.id;
  const elapsed  = isActive ? formatDuration(Date.now() - active.startedAt) : null;

  const coverHtml = cv.image
    ? `<img class="desk-slot__cover-img" src="${esc(cv.image)}" alt="${esc(book.title)} cover">`
    : `<div class="desk-slot__cover-fallback" style="--cv-bg:${esc(cv.bg || '#14263e')};--cv-text:${esc(cv.text || '#e8dfc8')}">
         <span>${esc(book.title as string)}</span>
       </div>`;

  container.innerHTML = `
    <div class="desk-slot">
      <div class="desk-slot__cover">${coverHtml}</div>
      <div class="desk-slot__info">
        <div class="desk-slot__title">${esc(book.title as string)}</div>
        <div class="desk-slot__author">${esc(book.author as string)}</div>
        ${isActive ? `<div class="desk-slot__timer" data-desk-timer>${elapsed}</div>` : ''}
        <button class="desk-slot__btn${isActive ? ' desk-slot__btn--stop' : ''}"
          type="button" data-desk-toggle data-book-id="${esc(String(book.id))}">
          ${isActive ? 'Stop Reading' : 'Start Reading'}
        </button>
      </div>
    </div>`;

  wireButton(container, book.id as string);
  if (isActive && active) startTicker(container, active.startedAt);
}

let _ticker: ReturnType<typeof setInterval> | null = null;

function startTicker(container: HTMLElement, startedAt: number): void {
  if (_ticker) clearInterval(_ticker);
  _ticker = setInterval(() => {
    const timerEl = container.querySelector('[data-desk-timer]');
    if (timerEl) timerEl.textContent = formatDuration(Date.now() - startedAt);
  }, 1000);
}

function wireButton(container: HTMLElement, bookId: string): void {
  const btn = container.querySelector<HTMLButtonElement>('[data-desk-toggle]');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const active = getActive();
    if (active?.bookId === bookId) {
      if (_ticker) { clearInterval(_ticker); _ticker = null; }
      await sessionStop();
    } else {
      await sessionStart(bookId);
    }
    btn.disabled = false;
    render(container);
  });
}

export function createDeskSlotComponent(): SlotComponent {
  let _container: HTMLElement | null = null;

  function onSessionChanged(): void {
    if (_container) render(_container);
  }

  function onBooksChanged(): void {
    if (_container) render(_container);
  }

  return {
    mount(container: HTMLElement): void {
      _container = container;
      render(container);
      window.addEventListener('marginalia:session-changed', onSessionChanged);
      window.addEventListener('marginalia:books-changed', onBooksChanged);
    },

    unmount(): void {
      if (_ticker) { clearInterval(_ticker); _ticker = null; }
      window.removeEventListener('marginalia:session-changed', onSessionChanged);
      window.removeEventListener('marginalia:books-changed', onBooksChanged);
      if (_container) _container.innerHTML = '';
      _container = null;
    },

    refresh(): void {
      if (_container) render(_container);
    },

    getDimensions() {
      return { width: WIDTH, height: HEIGHT };
    },
  };
}
