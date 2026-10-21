/* Marginalia · quick capture sheet (plan 2.1; loaded on first use, see quick-capture.ts)
   A "+" button on every page (and the C key) opens a bottom sheet: type, Save. The book is optional;
   a capture without one is attributed later (captures drawer). It is also what opens when a reading
   session ends, with that book preselected.
*/

import { BooksStore } from '../../store/books-store.ts';
import { CapturesStore, CAPTURE_MAX_CHARS } from '../../store/captures-store.ts';
import { getActive } from '../reading-session/reading-session.ts';
import { logError } from '../../services/analytics.ts';
import { keyboardInset, suggestBooks, type BookChoice } from './quick-capture-helpers.ts';

export interface OpenQuickCaptureOptions {
  bookId?: string | null;
  heading?: string;
}

let sheet: HTMLElement | null = null;
let backdrop: HTMLElement | null = null;
let toastTimer: number | null = null;
let selected: BookChoice | null = null;
let restoreFocus: HTMLElement | null = null;
let removeViewportListeners: (() => void) | null = null;

const setFabHidden = (hidden: boolean) => {
  const fab = document.querySelector<HTMLButtonElement>('.qc-fab');
  if (fab) fab.hidden = hidden;
};

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

function allBooks(): BookChoice[] {
  return (BooksStore.getAll() as Array<Record<string, any>>).map((b) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any -- store records are loosely typed
    id: String(b.id), title: String(b.title ?? ''), author: String(b.author ?? ''), status: String(b.status ?? ''),
  }));
}

/** The book the reader most likely means: the open book page, else the running timer's book. */
function contextBookId(): string | null {
  const panel = document.getElementById('panel-book');
  if (panel?.dataset.panelActive === 'true' && panel.dataset.bookId) return panel.dataset.bookId;
  return getActive()?.bookId ?? null;
}

export function showToast(text: string): void {
  let toast = document.getElementById('qcToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'qcToast';
    toast.className = 'qc-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('is-visible');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove('is-visible'), 3200);
}

function applyViewport(): void {
  const vv = window.visualViewport;
  if (!sheet || !vv) return;
  sheet.style.setProperty('--qc-keyboard', `${keyboardInset(window.innerHeight, vv)}px`);
  sheet.style.setProperty('--qc-max-height', `${Math.max(240, Math.round(vv.height - 16))}px`);
}

function renderSelected(): void {
  const row = sheet?.querySelector<HTMLElement>('[data-qc-selected]');
  const input = sheet?.querySelector<HTMLInputElement>('[data-qc-book]');
  if (!row || !input) return;
  row.hidden = !selected;
  input.hidden = !!selected;
  row.innerHTML = selected
    ? `<span class="qc-selected__title">${esc(selected.title)}</span><button type="button" class="btn btn--quiet btn--sm qc-selected__clear" data-qc-clear aria-label="Remove book">×</button>`
    : '';
}

function renderSuggestions(query: string): void {
  const list = sheet?.querySelector<HTMLElement>('[data-qc-suggestions]');
  if (!list) return;
  const items = selected ? [] : suggestBooks(allBooks(), query);
  list.hidden = items.length === 0;
  list.innerHTML = items.map((b) => `<li><button type="button" class="qc-suggestion" data-qc-pick="${esc(b.id)}"><span>${esc(b.title)}</span><span class="qc-suggestion__meta">${esc(b.author)}</span></button></li>`).join('');
}

export function closeQuickCapture(): void {
  if (!sheet) return;
  removeViewportListeners?.();
  removeViewportListeners = null;
  sheet.remove();
  backdrop?.remove();
  sheet = null;
  backdrop = null;
  setFabHidden(false);
  restoreFocus?.focus?.();
  restoreFocus = null;
}

async function submit(): Promise<void> {
  if (!sheet) return;
  const textarea = sheet.querySelector<HTMLTextAreaElement>('[data-qc-text]')!;
  const errorEl = sheet.querySelector<HTMLElement>('[data-qc-error]')!;
  const quote = textarea.value.trim();
  if (!quote) { errorEl.textContent = 'Write something first.'; errorEl.hidden = false; textarea.focus(); return; }
  const saveBtn = sheet.querySelector<HTMLButtonElement>('[data-qc-save]')!;
  saveBtn.disabled = true;
  try {
    await CapturesStore.add({ quote, bookId: selected?.id ?? null });
    const where = selected ? ` to ${selected.title}` : '';
    closeQuickCapture();
    showToast(navigator.onLine ? `Saved${where}.` : `Saved on this device${where}. It will sync when you are back online.`);
  } catch (err) {
    logError(err, { context: 'quick capture save' });
    errorEl.textContent = 'Could not save this. Try again.';
    errorEl.hidden = false;
    saveBtn.disabled = false;
  }
}

export function openQuickCapture(options: OpenQuickCaptureOptions = {}): void {
  if (sheet) { sheet.querySelector<HTMLTextAreaElement>('[data-qc-text]')?.focus(); return; }
  restoreFocus = document.activeElement as HTMLElement | null;
  const preselect = options.bookId !== undefined ? options.bookId : contextBookId();
  selected = allBooks().find((b) => b.id === preselect) ?? null;

  backdrop = document.createElement('div');
  backdrop.className = 'qc-backdrop';
  backdrop.dataset.qcBackdrop = '';
  sheet = document.createElement('section');
  sheet.className = 'qc-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Capture a thought');
  sheet.innerHTML = `
    <header class="qc-head">
      <h2 class="qc-title">${esc(options.heading ?? 'Capture a thought')}</h2>
      <button type="button" class="btn btn--icon btn--sm qc-close" data-qc-close aria-label="Close">×</button>
    </header>
    <form class="qc-form" data-qc-form>
      <label class="qc-label" for="qcText">Quote, idea or observation</label>
      <textarea id="qcText" class="qc-input" data-qc-text rows="4" maxlength="${CAPTURE_MAX_CHARS}" placeholder="What stayed with you?"></textarea>
      <div class="qc-book">
        <span class="qc-label">Book (optional)</span>
        <div class="qc-selected" data-qc-selected hidden></div>
        <input class="qc-book-input" data-qc-book type="search" autocomplete="off" placeholder="Start typing a title" aria-label="Book (optional)">
        <ul class="qc-suggestions" data-qc-suggestions hidden></ul>
      </div>
      <p class="qc-error" data-qc-error role="alert" hidden></p>
      <button type="submit" class="btn btn--primary qc-save" data-qc-save>Save</button>
    </form>`;
  document.body.append(backdrop, sheet);
  setFabHidden(true);
  renderSelected();

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', applyViewport);
    vv.addEventListener('scroll', applyViewport);
    removeViewportListeners = () => { vv.removeEventListener('resize', applyViewport); vv.removeEventListener('scroll', applyViewport); };
    applyViewport();
  }

  const textarea = sheet.querySelector<HTMLTextAreaElement>('[data-qc-text]')!;
  const bookInput = sheet.querySelector<HTMLInputElement>('[data-qc-book]')!;
  sheet.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-qc-close]')) { closeQuickCapture(); return; }
    if (target.closest('[data-qc-clear]')) { selected = null; renderSelected(); renderSuggestions(''); bookInput.focus(); return; }
    const pick = target.closest<HTMLElement>('[data-qc-pick]')?.dataset.qcPick;
    if (pick) {
      selected = allBooks().find((b) => b.id === pick) ?? null;
      bookInput.value = '';
      renderSelected();
      renderSuggestions('');
      textarea.focus();
    }
  });
  backdrop.addEventListener('click', closeQuickCapture);
  bookInput.addEventListener('focus', () => renderSuggestions(bookInput.value));
  bookInput.addEventListener('input', () => renderSuggestions(bookInput.value));
  sheet.querySelector('[data-qc-form]')!.addEventListener('submit', (event) => { event.preventDefault(); void submit(); });
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); closeQuickCapture(); }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); }
  });
  textarea.focus();
}
