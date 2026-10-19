/* Marginalia · quick capture (plan 2.1)
   Boot part only: the "+" button, the C key and the reading-session hook. The sheet itself
   (quick-capture-sheet.ts) is loaded the first time it is opened, which keeps the entry bundle small.
*/

import './quick-capture.css';
import { CapturesStore } from '../../store/captures-store.ts';
import { formatDuration } from '../reading-session/reading-session.ts';
import { logError } from '../../services/analytics.ts';
import type { OpenQuickCaptureOptions } from './quick-capture-sheet.ts';

export type { OpenQuickCaptureOptions };

export function openQuickCapture(options: OpenQuickCaptureOptions = {}): void {
  import('./quick-capture-sheet.ts')
    .then((m) => m.openQuickCapture(options))
    .catch((err) => logError(err, { context: 'open quick capture' }));
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** Mount the "+" button and the global listeners. Call once on DOM ready. */
export function mountQuickCapture(): void {
  if (document.querySelector('.qc-fab')) return;
  CapturesStore.start();
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'qc-fab';
  fab.setAttribute('aria-label', 'Capture a thought (C)');
  fab.title = 'Capture a thought (C)';
  fab.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><use href="#icon-capture"></use></svg>';
  fab.addEventListener('click', () => openQuickCapture());
  document.body.appendChild(fab);

  // The sheet is a separate chunk. Fetch it as soon as the browser is idle so that capturing still works
  // after the connection drops (a chunk that was never loaded cannot be fetched offline).
  const warm = () => { import('./quick-capture-sheet.ts').catch(() => undefined); };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle.call(window, warm, { timeout: 2000 });
  else setTimeout(warm, 1000);

  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'c' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    if (isTyping(event.target) || document.body.dataset.view === 'preloader' || document.querySelector('.qc-sheet')) return;
    event.preventDefault();
    openQuickCapture();
  });

  window.addEventListener('marginalia:session-ended', (event) => {
    const { bookId, durationMs } = (event as CustomEvent<{ bookId: string | null; durationMs: number }>).detail;
    openQuickCapture({ bookId: bookId ?? null, heading: `You read for ${formatDuration(durationMs)}. Want to note something?` });
  });
}
