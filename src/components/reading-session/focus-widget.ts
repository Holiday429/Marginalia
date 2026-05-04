// Marginalia · Floating focus widget
// Site-wide reading/focus timer with optional Pomodoro mode.
// Mounts once into document.body, persists across view changes.

import {
  getActive,
  start as sessionStart,
  stop as sessionStop,
  formatDuration,
} from './reading-session.ts';
import { BooksStore } from '../../store/books-store.ts';

const POMODORO_MS = 25 * 60 * 1000;

type WidgetMode = 'free' | 'pomodoro';

interface WidgetState {
  mode: WidgetMode;
  pomodoroEnd: number | null;
  tickerId: ReturnType<typeof setInterval> | null;
  pomTimerId: ReturnType<typeof setTimeout> | null;
  collapsed: boolean;
}

const state: WidgetState = {
  mode: 'free',
  pomodoroEnd: null,
  tickerId: null,
  pomTimerId: null,
  collapsed: false,
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c as string] ?? c,
  );
}

function getReadingBooks() {
  return BooksStore.getByStatus('reading');
}

function getTimerDisplay(): string {
  const active = getActive();
  if (!active) return '—';

  if (state.mode === 'pomodoro' && state.pomodoroEnd) {
    const remaining = Math.max(0, state.pomodoroEnd - Date.now());
    return formatDuration(remaining);
  }
  return formatDuration(Date.now() - active.startedAt);
}

function render(host: HTMLElement): void {
  const active  = getActive();
  const isActive = Boolean(active);
  const books   = getReadingBooks();
  const timer   = getTimerDisplay();
  const isPomodoro = state.mode === 'pomodoro';

  const bookOptions = books.map((b) =>
    `<option value="${esc(String(b.id))}"${active?.bookId === String(b.id) ? ' selected' : ''}>
      ${esc(String(b.title))}
    </option>`,
  ).join('');

  host.innerHTML = `
    <div class="fw-panel${state.collapsed ? ' fw-panel--collapsed' : ''}${isActive ? ' fw-panel--active' : ''}">
      <button class="fw-collapse-btn" type="button" data-fw-collapse aria-label="Toggle focus widget">
        <span class="fw-dot${isActive ? ' fw-dot--active' : ''}"></span>
        <span class="fw-collapse-label">${state.collapsed && isActive ? timer : 'Focus Session'}</span>
        <span class="fw-collapse-icon">${state.collapsed ? '▲' : '▼'}</span>
      </button>

      ${state.collapsed ? '' : `
        <div class="fw-body">
          ${isActive ? `
            <div class="fw-head">
              <span class="fw-timer" data-fw-timer>${timer}</span>
            </div>
          ` : ''}

          ${!isActive && books.length ? `
            <div class="fw-book-row">
              <label class="fw-book-label">Reading</label>
              <select class="fw-book-select" data-fw-book>
                <option value="">None / general</option>
                ${bookOptions}
              </select>
            </div>
          ` : isActive && active?.bookId ? `
            <div class="fw-active-book">
              ${esc(String(books.find(b => String(b.id) === active.bookId)?.title ?? ''))}
            </div>
          ` : ''}

          <div class="fw-mode-row">
            <button class="fw-mode-btn${!isPomodoro ? ' fw-mode-btn--active' : ''}" type="button" data-fw-mode="free">Free</button>
            <button class="fw-mode-btn${isPomodoro ? ' fw-mode-btn--active' : ''}" type="button" data-fw-mode="pomodoro">25 min</button>
          </div>

          ${isPomodoro && isActive ? `
            <div class="fw-pom-bar">
              <div class="fw-pom-fill" style="width:${_pomodoroProgress()}%"></div>
            </div>
          ` : ''}

          <div class="fw-actions">
            ${isActive
              ? `<button class="fw-stop-btn" type="button" data-fw-stop>Stop</button>`
              : `<button class="fw-start-btn" type="button" data-fw-start>Start</button>`
            }
          </div>
        </div>
      `}
    </div>
  `;

  _wireEvents(host);
}

function _pomodoroProgress(): number {
  if (!state.pomodoroEnd) return 0;
  const elapsed = POMODORO_MS - Math.max(0, state.pomodoroEnd - Date.now());
  return Math.min(100, (elapsed / POMODORO_MS) * 100);
}

function _wireEvents(host: HTMLElement): void {
  host.querySelector('[data-fw-collapse]')?.addEventListener('click', () => {
    state.collapsed = !state.collapsed;
    render(host);
  });

  host.querySelector('[data-fw-start]')?.addEventListener('click', async () => {
    const bookSelect = host.querySelector<HTMLSelectElement>('[data-fw-book]');
    const bookId = bookSelect?.value || null;
    await sessionStart(bookId);
    if (state.mode === 'pomodoro') {
      state.pomodoroEnd = Date.now() + POMODORO_MS;
      state.pomTimerId = setTimeout(() => _onPomodoroEnd(host), POMODORO_MS);
    }
    _startTicker(host);
    render(host);
  });

  host.querySelector('[data-fw-stop]')?.addEventListener('click', () => {
    _stopSession(host);
  });

  host.querySelectorAll('[data-fw-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (getActive()) return; // can't change mode mid-session
      state.mode = (btn as HTMLElement).dataset.fwMode as WidgetMode;
      render(host);
    });
  });
}

function _startTicker(host: HTMLElement): void {
  if (state.tickerId) clearInterval(state.tickerId);
  state.tickerId = setInterval(() => {
    const active = getActive();
    if (!active) { clearInterval(state.tickerId!); state.tickerId = null; return; }
    const display = getTimerDisplay();
    const timerEl = host.querySelector('[data-fw-timer]');
    if (timerEl) timerEl.textContent = display;
    const labelEl = host.querySelector('.fw-collapse-label');
    if (labelEl && state.collapsed) labelEl.textContent = display;
    const fill = host.querySelector<HTMLElement>('.fw-pom-fill');
    if (fill) fill.style.width = `${_pomodoroProgress()}%`;
  }, 1000);
}

async function _stopSession(host: HTMLElement): Promise<void> {
  if (state.tickerId) { clearInterval(state.tickerId); state.tickerId = null; }
  if (state.pomTimerId) { clearTimeout(state.pomTimerId); state.pomTimerId = null; }
  state.pomodoroEnd = null;
  await sessionStop();
  render(host);
}

function _onPomodoroEnd(host: HTMLElement): void {
  if (state.tickerId) { clearInterval(state.tickerId); state.tickerId = null; }
  state.pomodoroEnd = null;
  // Visual signal — gold dot briefly
  const dot = host.querySelector('.fw-dot');
  if (dot) { dot.classList.add('fw-dot--pom-done'); dot.classList.remove('fw-dot--active'); }
  setTimeout(() => dot?.classList.remove('fw-dot--pom-done'), 3000);
  // Stop automatically
  sessionStop().then(() => render(host));
}

let _host: HTMLElement | null = null;

export function mountFocusWidget(): void {
  const host = document.createElement('div');
  host.className = 'focus-widget-host';
  document.body.appendChild(host);
  _host = host;

  render(host);

  window.addEventListener('marginalia:session-changed', () => render(host));
  window.addEventListener('marginalia:books-changed', () => {
    if (!getActive()) render(host);
  });
}

export function attachFocusWidgetTo(slot: HTMLElement): void {
  if (!_host) return;
  slot.appendChild(_host);
}

export function detachFocusWidgetToBody(): void {
  if (!_host || _host.parentElement === document.body) return;
  document.body.appendChild(_host);
}
