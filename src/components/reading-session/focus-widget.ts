// Marginalia · Floating focus widget
// Site-wide reading/focus timer with optional Pomodoro mode.
// Mounts once into document.body, persists across view changes.

import {
  getActive,
  start as sessionStart,
  stop as sessionStop,
} from './reading-session.ts';
import { BooksStore } from '../../store/books-store.ts';
import { logError } from '../../services/analytics.ts';

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
  collapsed: true, // default: collapsed to a minimal pill
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
  if (!active) return '';

  if (state.mode === 'pomodoro' && state.pomodoroEnd) {
    const remaining = Math.max(0, state.pomodoroEnd - Date.now());
    return `${Math.max(1, Math.ceil(remaining / 60000))} min`;
  }
  const elapsed = Math.max(0, Date.now() - active.startedAt);
  return `${Math.max(1, Math.ceil(elapsed / 60000))} min`;
}

/** "MM:SS" elapsed since session start (free mode dial). */
function getElapsedClock(): string {
  const active = getActive();
  if (!active) return '00:00';
  const totalSec = Math.floor(Math.max(0, Date.now() - active.startedAt) / 1000);
  const m = Math.floor(totalSec / 60) % 60;
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "MM:SS" remaining in the pomodoro (hourglass mode). */
function getRemainingClock(): string {
  if (!state.pomodoroEnd) return '25:00';
  const totalSec = Math.ceil(Math.max(0, state.pomodoroEnd - Date.now()) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Hand angle for the free-mode clock dial — one full sweep per minute. */
function _freeSecondAngle(): number {
  const active = getActive();
  if (!active) return -90;
  const sec = (Math.max(0, Date.now() - active.startedAt) / 1000) % 60;
  return (sec / 60) * 360 - 90;
}

/** Circular clock-face dial for free mode. */
function renderClockDial(): string {
  const angle = _freeSecondAngle();
  const r = 30;
  const cx = 40, cy = 40;
  const handLen = 24;
  const hx = cx + handLen * Math.cos((angle * Math.PI) / 180);
  const hy = cy + handLen * Math.sin((angle * Math.PI) / 180);
  return `
    <div class="fw-visual fw-visual--clock">
      <svg class="fw-clock" viewBox="0 0 80 80" aria-hidden="true">
        <circle class="fw-clock__ring" cx="${cx}" cy="${cy}" r="${r}" />
        <line class="fw-clock__hand" x1="${cx}" y1="${cy}" x2="${hx.toFixed(2)}" y2="${hy.toFixed(2)}" data-fw-hand />
        <circle class="fw-clock__pin" cx="${cx}" cy="${cy}" r="2.5" />
      </svg>
      <span class="fw-visual__time" data-fw-clock>${getElapsedClock()}</span>
    </div>
  `;
}

/** Hourglass-style countdown for pomodoro mode. */
function renderHourglass(): string {
  const remaining = _pomodoroRemainingFraction();
  return `
    <div class="fw-visual fw-visual--hourglass" style="--fw-remaining:${(remaining * 100).toFixed(1)}%;">
      <svg class="fw-hourglass" viewBox="0 0 56 80" aria-hidden="true">
        <path class="fw-hourglass__frame" d="M10 6 H46 L30 40 L46 74 H10 L26 40 Z" />
        <clipPath id="fwTopClip"><path d="M14 9 H42 L30 38 L18 9 Z" /></clipPath>
        <clipPath id="fwBotClip"><path d="M30 42 L42 71 H14 L18 42 Z" /></clipPath>
        <rect class="fw-hourglass__sand" clip-path="url(#fwTopClip)" x="14" y="9"
          width="28" height="${(29 * remaining).toFixed(2)}" data-fw-sand-top />
        <rect class="fw-hourglass__sand" clip-path="url(#fwBotClip)"
          x="14" y="${(71 - 29 * (1 - remaining)).toFixed(2)}"
          width="28" height="${(29 * (1 - remaining)).toFixed(2)}" data-fw-sand-bot />
      </svg>
      <span class="fw-visual__time" data-fw-clock>${getRemainingClock()}</span>
    </div>
  `;
}

function renderPomodoroButton(isPomodoro: boolean): string {
  return `
    <button
      class="fw-mode-btn${isPomodoro ? ' fw-mode-btn--active' : ''}"
      type="button"
      data-fw-mode="pomodoro"
    >25 min</button>
  `;
}

/** Tiny inline clock / hourglass shown in the collapsed pill while a session runs. */
function renderMiniGlyph(isPomodoro: boolean): string {
  if (isPomodoro) {
    const frac = _pomodoroRemainingFraction();
    return `
      <svg class="fw-mini fw-mini--hourglass" viewBox="0 0 14 18" aria-hidden="true">
        <path class="fw-mini__frame" d="M3 2 H11 L7.5 9 L11 16 H3 L6.5 9 Z" />
        <clipPath id="fwMiniTop"><path d="M4 3 H10 L7 8 Z" /></clipPath>
        <clipPath id="fwMiniBot"><path d="M7 10 L10 15 H4 Z" /></clipPath>
        <rect class="fw-mini__sand" clip-path="url(#fwMiniTop)" x="4" y="3" width="6"
          height="${(5 * frac).toFixed(2)}" data-fw-mini-top />
        <rect class="fw-mini__sand" clip-path="url(#fwMiniBot)" x="4"
          y="${(15 - 5 * (1 - frac)).toFixed(2)}" width="6"
          height="${(5 * (1 - frac)).toFixed(2)}" data-fw-mini-bot />
      </svg>
    `;
  }
  const angle = _freeSecondAngle();
  const hx = 9 + 5 * Math.cos((angle * Math.PI) / 180);
  const hy = 9 + 5 * Math.sin((angle * Math.PI) / 180);
  return `
    <svg class="fw-mini fw-mini--clock" viewBox="0 0 18 18" aria-hidden="true">
      <circle class="fw-mini__ring" cx="9" cy="9" r="7" />
      <line class="fw-mini__hand" x1="9" y1="9" x2="${hx.toFixed(2)}" y2="${hy.toFixed(2)}" data-fw-mini-hand />
    </svg>
  `;
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
        <span class="fw-collapse-label">Reading</span>
        ${isActive ? renderMiniGlyph(isPomodoro) : ''}
        <span class="fw-collapse-time" data-fw-timer>${timer}</span>
        <span class="fw-collapse-icon">${state.collapsed ? '▲' : '▼'}</span>
      </button>

      ${state.collapsed ? '' : `
        <div class="fw-body">
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

          ${isActive
            ? (isPomodoro ? renderHourglass() : renderClockDial())
            : `
              <div class="fw-mode-row">
                <button class="fw-mode-btn${!isPomodoro ? ' fw-mode-btn--active' : ''}" type="button" data-fw-mode="free">Free</button>
                ${renderPomodoroButton(isPomodoro)}
              </div>
            `
          }

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
  _syncDock(host);
}

/** Fraction of the pomodoro still remaining (1 → full, 0 → done). */
function _pomodoroRemainingFraction(): number {
  if (!state.pomodoroEnd) return 1;
  return Math.max(0, Math.min(1, (state.pomodoroEnd - Date.now()) / POMODORO_MS));
}

/** Keep the glass dock width in sync with collapsed state. */
function _syncDock(host: HTMLElement): void {
  const dock = host.closest('.room-focus-dock');
  if (dock) dock.classList.toggle('is-collapsed', state.collapsed);
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
    host.querySelectorAll<HTMLElement>('[data-fw-timer]').forEach((timerEl) => {
      timerEl.textContent = display;
    });

    if (state.mode === 'pomodoro') {
      const frac = _pomodoroRemainingFraction();
      const clockEl = host.querySelector<HTMLElement>('[data-fw-clock]');
      if (clockEl) clockEl.textContent = getRemainingClock();
      const top = host.querySelector<SVGRectElement>('[data-fw-sand-top]');
      const bot = host.querySelector<SVGRectElement>('[data-fw-sand-bot]');
      if (top) top.setAttribute('height', (29 * frac).toFixed(2));
      if (bot) {
        bot.setAttribute('y', (71 - 29 * (1 - frac)).toFixed(2));
        bot.setAttribute('height', (29 * (1 - frac)).toFixed(2));
      }
      // Collapsed-pill mini hourglass
      const mTop = host.querySelector<SVGRectElement>('[data-fw-mini-top]');
      const mBot = host.querySelector<SVGRectElement>('[data-fw-mini-bot]');
      if (mTop) mTop.setAttribute('height', (5 * frac).toFixed(2));
      if (mBot) {
        mBot.setAttribute('y', (15 - 5 * (1 - frac)).toFixed(2));
        mBot.setAttribute('height', (5 * (1 - frac)).toFixed(2));
      }
    } else {
      const clockEl = host.querySelector<HTMLElement>('[data-fw-clock]');
      if (clockEl) clockEl.textContent = getElapsedClock();
      const angle = _freeSecondAngle();
      const hand = host.querySelector<SVGLineElement>('[data-fw-hand]');
      if (hand) {
        hand.setAttribute('x2', (40 + 24 * Math.cos((angle * Math.PI) / 180)).toFixed(2));
        hand.setAttribute('y2', (40 + 24 * Math.sin((angle * Math.PI) / 180)).toFixed(2));
      }
      // Collapsed-pill mini clock
      const mHand = host.querySelector<SVGLineElement>('[data-fw-mini-hand]');
      if (mHand) {
        mHand.setAttribute('x2', (9 + 5 * Math.cos((angle * Math.PI) / 180)).toFixed(2));
        mHand.setAttribute('y2', (9 + 5 * Math.sin((angle * Math.PI) / 180)).toFixed(2));
      }
    }
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
  sessionStop().then(() => render(host)).catch((e: unknown) => logError(e, { context: 'focus-widget pomodoro stop' }));
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
  // Moving the host into the dock does not re-render, so the dock would keep
  // its expanded padding/width until the first interaction — making the pill
  // taller than the camera toolbar on entry. Sync the collapsed class now.
  _syncDock(_host);
}

export function detachFocusWidgetToBody(): void {
  if (!_host || _host.parentElement === document.body) return;
  document.body.appendChild(_host);
}
