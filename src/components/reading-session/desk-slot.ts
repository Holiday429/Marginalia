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
  const isActive = active?.bookId === book.id;
  const elapsed  = isActive ? formatDuration(Date.now() - active.startedAt) : null;

  // The cover now lives on the 3D desk book itself (see RoomScene.setDeskBookCover).
  // This flat CSS3D slot is only the reading-session control, so it renders no
  // book image — it stays out of view until a session starts, and shows just a
  // compact timer + Stop control while active. Idle: a minimal Start affordance.
  if (!isActive) {
    container.innerHTML = `
      <div class="desk-slot desk-slot--idle">
        <button class="desk-slot__btn" type="button" data-desk-toggle data-book-id="${esc(String(book.id))}">
          Start Reading
        </button>
      </div>`;
    wireButton(container, book.id as string);
    return;
  }

  container.innerHTML = `
    <div class="desk-slot desk-slot--active">
      <div class="desk-slot__info">
        <div class="desk-slot__timer" data-desk-timer>${elapsed}</div>
        <button class="desk-slot__btn desk-slot__btn--stop"
          type="button" data-desk-toggle data-book-id="${esc(String(book.id))}">
          Stop Reading
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
