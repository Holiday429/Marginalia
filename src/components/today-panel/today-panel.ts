/* Marginalia · Today panel (plan 2.8)
   The room is home, and this card is what the reader finds on it each day: the book they are reading, up to three
   highlights worth another look, the one action that is due. The timer lives in the focus dock, not here. It only reads the stores;
   answering a highlight happens in the existing review list on the notes wall.
   Shown to signed-in readers only; collapsed by default; opening it is remembered for the session.
*/

import { pickDueAction, type ActionRow } from '../../../shared/resurface.ts';
import { MarginaliaAuth } from '../../firebase/auth.ts';
import { logError } from '../../services/analytics.ts';
import { ActionsStore } from '../../store/actions-store.ts';
import { BooksStore } from '../../store/books-store.ts';
import { ResurfaceStore } from '../../store/resurface-store.ts';

export interface TodayHooks {
  /** Open a book's page. */
  openBook(bookId: string, tab?: string): void;
  /** Open Add Book (nothing is being read). */
  addBook(): void;
  /** Go to the review list of due highlights. */
  openReview(): void;
}

const COLLAPSED_KEY = 'marginalia:today-collapsed';
const REFRESH_EVENTS = [
  'marginalia:books-changed',
  'marginalia:highlights-changed',
  'marginalia:actions-changed',
  'marginalia:auth-changed',
];

interface BookLike { id: string; title?: string; titleZh?: string; author?: string; authorZh?: string; status?: string }

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Collapsed unless the reader opened it this session. */
function readCollapsed(): boolean {
  try { return sessionStorage.getItem(COLLAPSED_KEY) !== '0'; } catch { return true; }
}

function writeCollapsed(value: boolean): void {
  try { sessionStorage.setItem(COLLAPSED_KEY, value ? '1' : '0'); } catch { /* private mode: the choice just is not remembered */ }
}

function titleOf(book: BookLike | undefined): string {
  return book?.titleZh || book?.title || '';
}

/** The book being read now, or null. Same rule as the desk book. */
export function readingNowBook(): BookLike | null {
  const books = BooksStore.getAll() as BookLike[];
  return books.find((b) => String(b?.status || '').toLowerCase() === 'reading') ?? null;
}

export function mountTodayPanel(host: HTMLElement, hooks: TodayHooks): () => void {
  const el = document.createElement('section');
  el.className = 'today';
  el.id = 'roomTodayPanel';
  el.setAttribute('aria-label', 'Today');
  host.appendChild(el);
  let collapsed = readCollapsed();

  function render(): void {
    if (!MarginaliaAuth?.user) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;

    const reading = readingNowBook();
    const due = ResurfaceStore.due(3);
    const action = pickDueAction(ActionsStore.getAll() as unknown as ActionRow[], Date.now());
    const actionBook = action?.bookId ? (BooksStore.getById(action.bookId) as BookLike | undefined) : undefined;
    const toRevisit = due.length + (action ? 1 : 0);

    el.dataset.collapsed = String(collapsed);
    el.innerHTML = collapsed
      ? `<button class="today__pill" type="button" data-today="toggle" aria-expanded="false">
           <span class="today__title">Today</span>
           <span class="today__count">${toRevisit ? `<span class="today__count-num">${toRevisit}</span><span class="today__count-text"> to revisit</span>` : '<span class="today__count-text">Nothing due</span>'}</span>
         </button>`
      : `
        <header class="today__head">
          <h2 class="today__title">Today</h2>
          <button class="btn btn--sm btn--quiet today__btn today__btn--quiet" type="button" data-today="toggle" aria-expanded="true">Hide</button>
        </header>
        <div class="today__body">
          <div class="today__col" data-today-col="reading">
            <h3 class="today__label">Reading Now</h3>
            ${reading
              ? `<p class="today__book">${esc(titleOf(reading))}</p>
                 <p class="today__meta">${esc(reading.authorZh || reading.author || '')}</p>
                 <div class="today__row">
                   <button class="btn btn--sm today__btn" type="button" data-today="open-book" data-book-id="${esc(reading.id)}">Open book</button>
                 </div>`
              : `<p class="today__empty">Nothing in progress.</p>
                 <div class="today__row">
                   <button class="btn btn--sm today__btn" type="button" data-today="add-book">Add a book</button>
                 </div>`}
          </div>
          <div class="today__col" data-today-col="review">
            <h3 class="today__label">Worth Another Look</h3>
            ${due.length
              ? `<ul class="today__list">${due.map((h) => `<li class="today__quote"><span>${esc(clip(h.quote, 90))}</span>${h.bookTitle ? `<em>${esc(h.bookTitle)}</em>` : ''}</li>`).join('')}</ul>
                 <div class="today__row"><button class="btn btn--sm today__btn" type="button" data-today="review">Review</button></div>`
              : '<p class="today__empty">Nothing to revisit today.</p>'}
          </div>
          <div class="today__col" data-today-col="action">
            <h3 class="today__label">Action Due</h3>
            ${action
              ? `<p class="today__book">${esc(clip(String(action.text), 110))}</p>
                 ${actionBook ? `<p class="today__meta">${esc(titleOf(actionBook))}</p>` : ''}
                 ${action.bookId ? `<div class="today__row"><button class="btn btn--sm today__btn" type="button" data-today="open-action" data-book-id="${esc(action.bookId)}">Open book</button></div>` : ''}`
              : '<p class="today__empty">No action due.</p>'}
          </div>
        </div>`;
  }

  function onClick(event: MouseEvent): void {
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-today]');
    if (!trigger) return;
    const what = trigger.dataset.today;
    try {
      if (what === 'toggle') { collapsed = !collapsed; writeCollapsed(collapsed); render(); }
      else if (what === 'open-book') hooks.openBook(trigger.dataset.bookId || '');
      else if (what === 'open-action') hooks.openBook(trigger.dataset.bookId || '', 'actions');
      else if (what === 'add-book') hooks.addBook();
      else if (what === 'review') hooks.openReview();
    } catch (err) {
      logError(err, { context: 'today panel', action: what });
    }
  }

  const refresh = () => render();
  el.addEventListener('click', onClick);
  REFRESH_EVENTS.forEach((name) => window.addEventListener(name, refresh));
  render();

  return () => {
    el.removeEventListener('click', onClick);
    REFRESH_EVENTS.forEach((name) => window.removeEventListener(name, refresh));
    el.remove();
  };
}
