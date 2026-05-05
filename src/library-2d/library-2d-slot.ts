// Marginalia · Shelf Wall slot — condensed spine-card view for the 3D room north wall.
// Implements SlotComponent; mounted by createThreeRoomPreview via mountSlot('shelfWall').

import './library-2d-slot.css';
import type { SlotComponent } from '../three/slots.ts';
import { BooksStore } from '../store/books-store.ts';

const WIDTH  = 1200;
const HEIGHT = 760;

// Status display order and labels for the wall grouping.
const STATUS_GROUPS: Array<{ status: string; label: string }> = [
  { status: 'reading',          label: 'Reading'       },
  { status: 'want',             label: 'To Read'       },
  { status: 'finished',         label: 'Finished'      },
  { status: 'confirmed-later',  label: 'Confirm Later' },
];

interface SpineData {
  id:     string;
  title:  string;
  author: string;
  spine:  string;
  text:   string;
  w:      number;
  h:      number;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c as string] ?? c),
  );
}

function toSpineData(book: Record<string, unknown>): SpineData {
  const meta  = (book.meta  as Record<string, unknown>) ?? {};
  const cover = (book.cover as Record<string, unknown>) ?? {};
  const user  = (book.user  as Record<string, unknown>) ?? {};
  return {
    id:     String(book.id ?? ''),
    title:  String(book.title  ?? meta.title  ?? book.id ?? ''),
    author: String(book.author ?? meta.author ?? ''),
    spine:  String(book.spine  ?? cover.bg    ?? '#14263e'),
    text:   String(book.text   ?? cover.text  ?? '#e8dfc8'),
    w:      Number(book.w ?? 38),
    h:      Number(book.h ?? book.height ?? (user.h ?? 0.88)),
  };
}

function spineWidth(w: number): number {
  return Math.max(22, Math.min(58, Math.round(w)));
}

function spineHeight(h: number): number {
  return Math.max(110, Math.min(210, Math.round(h * 180)));
}

function renderSpine(s: SpineData): string {
  const w = spineWidth(s.w);
  const h = spineHeight(s.h);
  return `<button
    type="button"
    class="sw-spine"
    data-book-id="${esc(s.id)}"
    aria-label="${esc(s.title)} by ${esc(s.author)}"
    style="width:${w}px;height:${h}px;background:${esc(s.spine)};color:${esc(s.text)}"
  ><span class="sw-spine__title">${esc(s.title)}</span></button>`;
}

function renderWall(container: HTMLElement): void {
  const all = BooksStore.getAll() as Array<Record<string, unknown>>;

  if (!all.length) {
    container.innerHTML = `<div class="sw-empty">Your library will appear here once you add books.</div>`;
    return;
  }

  // Group by status; books with no matching status go into the last group.
  const groups = new Map<string, SpineData[]>(STATUS_GROUPS.map((g) => [g.status, []]));
  const overflow: SpineData[] = [];

  for (const book of all) {
    const meta  = (book.meta  as Record<string, unknown>) ?? {};
    const user  = (book.user  as Record<string, unknown>) ?? {};
    const status = String(book.status ?? user.status ?? meta.status ?? 'confirmed-later');
    const spine  = toSpineData(book);
    const bucket = groups.get(status);
    if (bucket) {
      bucket.push(spine);
    } else {
      overflow.push(spine);
    }
  }

  // Append overflow to confirm-later bucket.
  groups.get('confirmed-later')?.push(...overflow);

  let html = '<div class="sw-wall">';
  for (const { status, label } of STATUS_GROUPS) {
    const books = groups.get(status) ?? [];
    if (!books.length) continue;
    html += `<div class="sw-group">
      <div class="sw-group__label">${esc(label)}</div>
      <div class="sw-group__row">${books.map(renderSpine).join('')}</div>
    </div>`;
  }
  html += '</div>';

  container.innerHTML = html;

  // Wire click → navigate to Book panel.
  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-book-id]');
    if (!btn?.dataset.bookId) return;
    // App is still on window during P1/P2 transition. TODO(p2-cleanup): import App directly.
    (window as unknown as Record<string, { show?: (id: string, params?: object) => void }>)
      .App?.show?.('book', { id: btn.dataset.bookId });
  }, { once: false });
}

export function createShelfWallComponent(): SlotComponent {
  let _container: HTMLElement | null = null;

  function onBooksChanged(): void {
    if (_container) renderWall(_container);
  }

  return {
    mount(container: HTMLElement): void {
      _container = container;
      renderWall(container);
      window.addEventListener('marginalia:books-changed', onBooksChanged);
    },

    unmount(): void {
      window.removeEventListener('marginalia:books-changed', onBooksChanged);
      if (_container) _container.innerHTML = '';
      _container = null;
    },

    refresh(): void {
      if (_container) renderWall(_container);
    },

    getDimensions() {
      return { width: WIDTH, height: HEIGHT };
    },
  };
}
