/* Marginalia · global search panel (plan 2.7): ⌘K / Ctrl+K. Results are grouped by type with the matched
   words marked; arrow keys move, Enter opens, Escape closes. Loaded the first time it is opened. */

import './global-search.css';
import { PanelManager } from '../../core/panel-manager.ts';
import { logError } from '../../services/analytics.ts';
import { collectSearchDocs } from './data.ts';
import { GlobalIndex, groupHits, type SearchDocType, type SearchHit } from './index.ts';
import { buildSnippet } from './snippet.ts';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const GROUP_LABEL: Record<SearchDocType, string> = { book: 'Books', highlight: 'Highlights', note: 'Notes', action: 'Actions' };
const TAB_FOR: Partial<Record<SearchDocType, string>> = { highlight: 'highlights', note: 'notes', action: 'actions' };

let index: GlobalIndex | null = null;
let dirty = true;
let building: Promise<void> | null = null;
let dialog: HTMLElement | null = null;
let backdrop: HTMLElement | null = null;
let hits: SearchHit[] = [];
let restoreFocus: HTMLElement | null = null;

// Anything the index is built from changing means it is rebuilt the next time the panel opens.
['marginalia:books-changed', 'marginalia:highlights-changed', 'marginalia:actions-changed', 'marginalia:notes-changed', 'marginalia:auth-changed']
  .forEach((name) => window.addEventListener(name, () => { dirty = true; }));

async function ensureIndex(): Promise<GlobalIndex> {
  if (!index) index = new GlobalIndex();
  if (dirty) {
    dirty = false;
    building = collectSearchDocs().then((docs) => { index!.replaceAll(docs); }).catch((err) => { dirty = true; logError(err, { context: 'global search index' }); });
  }
  await building;
  return index;
}

export function closeGlobalSearch(): void {
  dialog?.remove();
  backdrop?.remove();
  dialog = null;
  backdrop = null;
  hits = [];
  restoreFocus?.focus?.();
  restoreFocus = null;
}

function openHit(hit: SearchHit): void {
  const { type, bookId, id } = hit.doc;
  closeGlobalSearch();
  if (!bookId) {
    // A capture that has no book yet: show the list of unattributed captures instead.
    document.querySelector<HTMLElement>('.cd-pill')?.click();
    return;
  }
  const params: Record<string, unknown> = { id: bookId };
  const tab = TAB_FOR[type];
  if (tab) params.tab = tab;
  if (type === 'highlight') params.focusHighlight = id;
  PanelManager.open('book', params);
}

function renderResults(query: string): void {
  const host = dialog?.querySelector<HTMLElement>('[data-gs-results]');
  if (!host) return;
  const groups = groupHits(hits, 6);
  if (!query.trim()) { host.innerHTML = '<p class="gs-hint">Search every book, highlight, note and action. Chinese works by character or word.</p>'; return; }
  if (!groups.length) { host.innerHTML = `<p class="gs-hint" role="status">Nothing found for "${esc(query)}".</p>`; return; }
  host.innerHTML = groups.map((g) => `
    <section class="gs-group" aria-label="${esc(GROUP_LABEL[g.type])}">
      <h3 class="gs-group__title">${esc(GROUP_LABEL[g.type])} <span>${g.total}</span></h3>
      <ul class="gs-list" role="listbox">
        ${g.hits.map((h) => `
          <li role="option" aria-selected="false">
            <button type="button" class="gs-hit" data-gs-key="${esc(h.key)}">
              <span class="gs-hit__title">${g.type === 'book' ? buildSnippet(h.doc.title, query, 80) : esc(h.doc.title || (h.doc.bookId ? '' : 'Not attributed to a book yet'))}</span>
              <span class="gs-hit__text">${g.type === 'book' ? esc(h.doc.author ?? '') : buildSnippet(h.doc.body, query)}</span>
            </button>
          </li>`).join('')}
      </ul>
    </section>`).join('');
  select(0);
}

function buttons(): HTMLButtonElement[] {
  return [...(dialog?.querySelectorAll<HTMLButtonElement>('[data-gs-key]') ?? [])];
}

function select(i: number): void {
  const all = buttons();
  all.forEach((b, n) => { b.closest('li')?.setAttribute('aria-selected', String(n === i)); b.classList.toggle('is-selected', n === i); });
  all[i]?.scrollIntoView({ block: 'nearest' });
}

export async function openGlobalSearch(): Promise<void> {
  if (dialog) { dialog.querySelector<HTMLInputElement>('[data-gs-input]')?.focus(); return; }
  restoreFocus = document.activeElement as HTMLElement | null;
  backdrop = document.createElement('div');
  backdrop.className = 'gs-backdrop';
  dialog = document.createElement('section');
  dialog.className = 'gs-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Search everything');
  dialog.innerHTML = `
    <input class="gs-input" data-gs-input type="search" autocomplete="off" spellcheck="false" placeholder="Search books, highlights, notes and actions" aria-label="Search">
    <div class="gs-results" data-gs-results></div>
    <footer class="gs-foot">Up and down to move · Enter to open · Esc to close</footer>`;
  document.body.append(backdrop, dialog);
  const input = dialog.querySelector<HTMLInputElement>('[data-gs-input]')!;
  input.focus();
  renderResults('');

  const idx = await ensureIndex();
  const run = () => { hits = idx.search(input.value, { limit: 60 }); renderResults(input.value); };
  input.addEventListener('input', run);
  if (input.value) run();

  dialog.addEventListener('keydown', (event) => {
    const all = buttons();
    const current = all.findIndex((b) => b.classList.contains('is-selected'));
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeGlobalSearch(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); select(Math.min(all.length - 1, current + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); select(Math.max(0, current - 1)); }
    else if (event.key === 'Enter') {
      const target = all[Math.max(0, current)];
      if (target) { event.preventDefault(); target.click(); }
    }
  });
  dialog.addEventListener('click', (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-gs-key]')?.dataset.gsKey;
    const hit = key ? hits.find((h) => h.key === key) : null;
    if (hit) openHit(hit);
  });
  backdrop.addEventListener('click', closeGlobalSearch);
}
