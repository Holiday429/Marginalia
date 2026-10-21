/* Marginalia · unattributed captures drawer (plan 2.1; loaded when the pill is first clicked)
   Lists the quick captures that have no book yet; each capture can be dragged onto any book spine (Search or Library) or attributed with the picker.
   Dragging uses pointer events, so it works with a mouse, a finger and the Apple Pencil alike.
*/

import './captures-drawer.css';
import { BooksStore } from '../../store/books-store.ts';
import { CapturesStore } from '../../store/captures-store.ts';
import { logError } from '../../services/analytics.ts';
import { showToast } from './quick-capture-sheet.ts';

let drawer: HTMLElement | null = null;

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

function bookTitle(id: string): string {
  return String((BooksStore.getById(id) as { title?: string } | undefined)?.title ?? 'the book');
}

async function attribute(id: string, bookId: string): Promise<void> {
  try {
    await CapturesStore.attribute(id, bookId);
    showToast(`Added to ${bookTitle(bookId)}.`);
  } catch (err) {
    logError(err, { context: 'attribute capture', id, bookId });
    showToast('Could not add this to the book. Try again.');
  }
}

async function renderDrawer(): Promise<void> {
  if (!drawer) return;
  const rows = await CapturesStore.list();
  const list = drawer.querySelector<HTMLElement>('[data-cd-list]')!;
  list.innerHTML = rows.length
    ? rows.map((r) => `
      <li class="cd-item" data-cd-id="${esc(r.id)}">
        <button type="button" class="cd-grip" data-cd-grip aria-label="Drag onto a book">⠿</button>
        <p class="cd-quote">${esc(r.quote)}</p>
        <div class="cd-actions">
          <button type="button" class="cd-pick" data-cd-pick>Choose a book</button>
        </div>
        <ul class="cd-books" data-cd-books hidden></ul>
      </li>`).join('')
    : '<li class="cd-empty">Nothing waiting. Every capture has a book.</li>';
}

export function closeCapturesDrawer(): void {
  drawer?.remove();
  drawer = null;
}

function startDrag(item: HTMLElement, event: PointerEvent): void {
  const id = item.dataset.cdId!;
  const ghost = document.createElement('div');
  ghost.className = 'cd-ghost';
  ghost.textContent = item.querySelector('.cd-quote')?.textContent ?? '';
  document.body.appendChild(ghost);
  item.classList.add('is-dragging');
  let target: HTMLElement | null = null;

  const move = (e: PointerEvent) => {
    ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const next = under?.closest<HTMLElement>('[data-book-id]') ?? null;
    if (next !== target) {
      target?.classList.remove('cd-drop-target');
      next?.classList.add('cd-drop-target');
      target = next;
    }
  };
  const end = (e: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    ghost.remove();
    item.classList.remove('is-dragging');
    target?.classList.remove('cd-drop-target');
    const bookId = target?.dataset.bookId;
    if (e.type === 'pointerup' && bookId) void attribute(id, bookId);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  move(event);
}

export function openCapturesDrawer(): void {
  if (drawer) return;
  drawer = document.createElement('aside');
  drawer.className = 'cd-drawer';
  drawer.setAttribute('aria-label', 'Unattributed captures');
  drawer.innerHTML = `
    <header class="cd-head">
      <h2 class="cd-title">Unattributed captures</h2>
      <button type="button" class="btn btn--icon btn--sm cd-close" data-cd-close aria-label="Close">×</button>
    </header>
    <p class="cd-hint">Drag a capture onto a book, or choose one.</p>
    <ul class="cd-list" data-cd-list></ul>`;
  document.body.appendChild(drawer);

  drawer.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-cd-close]')) { closeCapturesDrawer(); return; }
    const item = target.closest<HTMLElement>('.cd-item');
    if (!item) return;
    if (target.closest('[data-cd-pick]')) {
      const books = item.querySelector<HTMLElement>('[data-cd-books]')!;
      books.hidden = !books.hidden;
      if (!books.hidden) {
        books.innerHTML = (BooksStore.getAll() as Array<{ id: string; title?: string }>).slice(0, 40)
          .map((b) => `<li><button type="button" class="cd-book" data-cd-book="${esc(b.id)}">${esc(b.title ?? b.id)}</button></li>`).join('');
      }
      return;
    }
    const bookId = target.closest<HTMLElement>('[data-cd-book]')?.dataset.cdBook;
    if (bookId) void attribute(item.dataset.cdId!, bookId);
  });
  drawer.addEventListener('pointerdown', (event) => {
    const grip = (event.target as HTMLElement).closest('[data-cd-grip]');
    const item = grip?.closest<HTMLElement>('.cd-item');
    if (!grip || !item) return;
    event.preventDefault();
    startDrag(item, event);
  });
  void renderDrawer();
}

export function isCapturesDrawerOpen(): boolean {
  return drawer !== null;
}

/** Called by the pill whenever the number of unattributed captures changes. */
export async function refreshCapturesDrawer(count: number): Promise<void> {
  if (!drawer) return;
  if (count === 0) closeCapturesDrawer();
  else await renderDrawer();
}
