/* Marginalia · first-run guide (plan 2.9): three steps, each completed by what the reader actually does.
   1. Add or import 3 books   2. Save a first highlight   3. See the room and the map.
   Skippable at any time; finishing or skipping is stored on the account and the guide never returns. */

import './onboarding.css';
import { BooksStore } from '../../store/books-store.ts';
import { HighlightsStore } from '../../store/highlights-store.ts';
import { logError } from '../../services/analytics.ts';
import { GUIDE_BOOKS, recordOnboarding } from './onboarding-boot.ts';
import { NewEntry } from '../../new-entry/new-entry.ts';
import { openQuickCapture } from '../quick-capture/quick-capture.ts';

const ID = 'onboardingGuide';
const seenKey = (uid: string) => `marginalia:onboarding-seen:${uid}`;

interface Seen { room: boolean; map: boolean }

function loadSeen(uid: string): Seen {
  try { return { room: false, map: false, ...(JSON.parse(localStorage.getItem(seenKey(uid)) || '{}') as Partial<Seen>) }; } catch { return { room: false, map: false }; }
}

function saveSeen(uid: string, seen: Seen): void {
  try { localStorage.setItem(seenKey(uid), JSON.stringify(seen)); } catch { /* storage blocked: progress lasts for this page view */ }
}

export interface GuideProgress {
  books: number;
  highlights: number;
  seen: Seen;
}

export interface GuideStep { id: 'books' | 'highlight' | 'tour'; done: boolean }

/** Pure: which steps are done, and which one the reader is on. */
export function guideSteps(p: GuideProgress): { steps: GuideStep[]; current: number; allDone: boolean } {
  const steps: GuideStep[] = [
    { id: 'books', done: p.books >= GUIDE_BOOKS },
    { id: 'highlight', done: p.highlights >= 1 },
    { id: 'tour', done: p.seen.room && p.seen.map },
  ];
  const current = steps.findIndex((s) => !s.done);
  return { steps, current: current === -1 ? steps.length : current, allDone: current === -1 };
}

export function showOnboarding(uid: string): void {
  if (document.getElementById(ID)) return;
  let seen = loadSeen(uid);
  let minimized = false;

  const root = document.createElement('aside');
  root.id = ID;
  root.className = 'ob';
  root.setAttribute('aria-label', 'Getting started');
  document.body.appendChild(root);

  const progress = (): GuideProgress => ({
    books: BooksStore.hasOwnBooks() ? BooksStore.getAll().length : 0,
    highlights: HighlightsStore.getAll().length,
    seen,
  });

  const check = (done: boolean) => `<span class="ob-check${done ? ' is-done' : ''}" aria-hidden="true">${done ? '✓' : ''}</span>`;

  const render = () => {
    const p = progress();
    const { steps, current, allDone } = guideSteps(p);
    if (minimized) {
      root.innerHTML = `<button type="button" class="chip ob-pill" data-ob-open aria-label="Open the getting started guide">Getting started · ${steps.filter((s) => s.done).length} of 3</button>`;
      return;
    }
    if (allDone) {
      root.innerHTML = `
        <header class="ob-head"><h2 class="ob-title">You are all set</h2></header>
        <p class="ob-text">Press C anywhere to capture a thought, and Ctrl or Cmd with K to search everything.</p>
        <div class="ob-actions"><button type="button" class="btn btn--primary ob-btn ob-btn--primary" data-ob-finish>Close</button></div>`;
      return;
    }
    const row = (i: number, title: string, hint: string, actions: string) => `
      <li class="ob-step${steps[i].done ? ' is-done' : ''}${current === i ? ' is-current' : ''}" data-ob-step="${steps[i].id}">
        ${check(steps[i].done)}
        <div class="ob-step__body">
          <p class="ob-step__title">${title}</p>
          ${current === i ? `<p class="ob-step__hint">${hint}</p><div class="ob-actions">${actions}</div>` : ''}
        </div>
      </li>`;
    root.innerHTML = `
      <header class="ob-head">
        <h2 class="ob-title">Getting started</h2>
        <button type="button" class="btn btn--quiet btn--sm ob-min" data-ob-min aria-label="Minimise the guide">–</button>
      </header>
      <ol class="ob-steps">
        ${row(0, `Add or import ${GUIDE_BOOKS} books`, `${Math.min(p.books, GUIDE_BOOKS)} of ${GUIDE_BOOKS} so far. Import brings a whole library at once.`,
          '<button type="button" class="btn btn--primary ob-btn ob-btn--primary" data-ob-add>Add a book</button><button type="button" class="btn ob-btn" data-ob-import>Import</button>')}
        ${row(1, 'Save your first highlight', 'A line that stayed with you. Press C on any page, or open a book and add one.',
          '<button type="button" class="btn btn--primary ob-btn ob-btn--primary" data-ob-capture>Capture one</button>')}
        ${row(2, 'See your room and your map', `${seen.room ? 'Room seen. ' : ''}${seen.map ? 'Map seen. ' : ''}Your books are on the shelves and your authors on the map.`,
          `<button type="button" class="btn ob-btn${seen.room ? '' : ' ob-btn--primary'}" data-ob-room>${seen.room ? 'Room ✓' : 'Open the room'}</button><button type="button" class="btn ob-btn${seen.map ? '' : ' ob-btn--primary'}" data-ob-map>${seen.map ? 'Map ✓' : 'Open the map'}</button>`)}
      </ol>
      <button type="button" class="btn btn--quiet ob-skip" data-ob-skip>Skip the guide</button>`;
  };

  const end = async (state: 'done' | 'skipped') => {
    root.remove();
    try { await recordOnboarding(uid, state); } catch (err) { logError(err, { context: 'onboarding record', state }); }
  };

  root.addEventListener('click', (event) => {
    const t = event.target as HTMLElement;
    if (t.closest('[data-ob-skip]')) { void end('skipped'); return; }
    if (t.closest('[data-ob-finish]')) { void end('done'); return; }
    if (t.closest('[data-ob-min]')) { minimized = true; render(); return; }
    if (t.closest('[data-ob-open]')) { minimized = false; render(); return; }
    if (t.closest('[data-ob-add]')) { NewEntry?.mount?.(); return; }
    if (t.closest('[data-ob-import]')) { import('../../api/import/import-ui.ts').then((m) => m.openImportDialog()).catch((err) => logError(err, { context: 'onboarding import' })); return; }
    if (t.closest('[data-ob-capture]')) { openQuickCapture(); return; }
    if (t.closest('[data-ob-room]')) { location.hash = '#room'; return; }
    if (t.closest('[data-ob-map]')) { location.hash = '#map'; }
  });

  // The guide follows what the reader does.
  const refresh = () => render();
  ['marginalia:books-changed', 'marginalia:highlights-changed'].forEach((name) => window.addEventListener(name, refresh));
  const noteVisit = (which: keyof Seen) => {
    if (seen[which] || progress().books < 1) return; // the tour counts once there is something to see
    seen = { ...seen, [which]: true };
    saveSeen(uid, seen);
    render();
  };
  window.addEventListener('marginalia:panel-open', (event) => {
    if ((event as CustomEvent<{ panelId?: string }>).detail?.panelId === 'map') noteVisit('map');
  });
  new MutationObserver(() => { if (document.body.dataset.view === 'room') noteVisit('room'); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  window.addEventListener('hashchange', () => { if (location.hash === '#room') window.setTimeout(() => noteVisit('room'), 300); });
  render();
}
