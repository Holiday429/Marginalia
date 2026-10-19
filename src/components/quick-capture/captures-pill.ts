/* Marginalia · "N unattributed" pill (plan 2.1)
   Always-loaded part: the pill and its count. The drawer it opens (captures-drawer.ts) is loaded on first click.
*/

import './captures-drawer.css';
import { CapturesStore, CAPTURES_CHANGED_EVENT } from '../../store/captures-store.ts';
import { logError } from '../../services/analytics.ts';

type DrawerModule = typeof import('./captures-drawer.ts');

let pill: HTMLButtonElement | null = null;
let count = 0;
let drawerModule: DrawerModule | null = null;

function updatePill(): void {
  if (!pill) return;
  pill.hidden = count === 0;
  pill.textContent = `${count} unattributed`;
}

async function refresh(): Promise<void> {
  count = (await CapturesStore.list()).length;
  updatePill();
  await drawerModule?.refreshCapturesDrawer(count);
}

/** Mount the pill. Call once on DOM ready. */
export function mountCapturesPill(): void {
  if (pill) return;
  pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'cd-pill';
  pill.hidden = true;
  pill.setAttribute('aria-label', 'Unattributed captures');
  pill.addEventListener('click', () => {
    import('./captures-drawer.ts').then((m) => {
      drawerModule = m;
      if (m.isCapturesDrawerOpen()) m.closeCapturesDrawer(); else m.openCapturesDrawer();
    }).catch((err) => logError(err, { context: 'open captures drawer' }));
  });
  document.body.appendChild(pill);
  window.addEventListener(CAPTURES_CHANGED_EVENT, () => { void refresh(); });
  window.addEventListener('marginalia:auth-changed', () => { void refresh(); });
  void refresh();
}
