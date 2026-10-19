/* Marginalia · global search: boot part (plan 2.7). Only the shortcut; the panel and the index load on first use. */

import { logError } from '../../services/analytics.ts';

export function openGlobalSearch(): void {
  import('./panel.ts').then((m) => m.openGlobalSearch()).catch((err) => logError(err, { context: 'open global search' }));
}

export function startGlobalSearch(): void {
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    if (document.body.dataset.view === 'preloader') return;
    event.preventDefault(); // works from inside text fields too, and keeps the browser's own ⌘K from firing
    openGlobalSearch();
  });
}
