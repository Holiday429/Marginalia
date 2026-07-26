/* Marginalia · Action Notifications
   Watches workspaces/{wsId}/notifications/{uid}/unread for action reminder docs written by
   the actionReminders Cloud Function. Shows a badge and a dismissible panel
   listing overdue actions grouped by reminder tier (7d / 30d / 90d).

   Works across all views — mounts a single floating element into document.body.
*/

import { collection, doc, onSnapshot, updateDoc, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { logError } from '../../services/analytics.ts';
import { ENV } from '../../core/env.ts';
import { MARGINALIA_FIREBASE } from '../../firebase/config.ts';
import { App } from '../../core/app.ts';

type FirestoreDB = Firestore;

interface NotifDoc {
  id: string;
  type: string;
  tier: 7 | 30 | 90;
  actionId: string;
  bookId: string;
  text: string;
  createdAt: number;
  read: boolean;
}

let _uid: string | null = null;
let _db: FirestoreDB | null = null;
let _unsubscribe: Unsubscribe | null = null;
let _notifs: NotifDoc[] = [];

const CONTAINER_ID = 'action-notif-root';

// ── Mount / teardown ────────────────────────────────────────────────────────

export function mountActionNotifications(uid: string, db: FirestoreDB): void {
  if (_uid === uid) return;
  unmountActionNotifications();
  _uid = uid;
  _db  = db;

  _ensureContainer();

  const wsId = ENV.WORKSPACE_ID || MARGINALIA_FIREBASE?.workspaceId || 'default';
  const col = collection(db, 'workspaces', wsId, 'notifications', uid, 'unread');
  _unsubscribe = onSnapshot(
    col,
    (snap) => {
      _notifs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as NotifDoc))
        .filter((n: NotifDoc) => n.type === 'action_reminder' && !n.read);
      _render();
    },
    (err: Error) => {
      logError(err, { context: 'ActionNotifications onSnapshot' });
    },
  );
}

export function unmountActionNotifications(): void {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _uid = null;
  _db  = null;
  _notifs = [];
  const el = document.getElementById(CONTAINER_ID);
  if (el) el.remove();
}

// ── Render ──────────────────────────────────────────────────────────────────

function _ensureContainer(): HTMLElement {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = CONTAINER_ID;
    document.body.appendChild(el);
  }
  return el;
}

function _render(): void {
  const root = _ensureContainer();
  const count = _notifs.length;

  if (count === 0) {
    root.innerHTML = '';
    return;
  }

  const grouped = _groupByTier(_notifs);

  root.innerHTML = `
    <div class="an-badge" id="anBadge" role="button" tabindex="0"
         aria-label="${count} action reminder${count > 1 ? 's' : ''}">
      <span class="an-badge-icon">◻</span>
      <span class="an-badge-count">${count}</span>
    </div>
    <div class="an-panel" id="anPanel" hidden>
      <header class="an-panel-head">
        <h2 class="an-panel-title">Action Reminders</h2>
        <button class="an-close-btn" id="anCloseBtn" aria-label="Dismiss">×</button>
      </header>
      <div class="an-panel-body">
        ${grouped.map(([tier, items]) => `
          <section class="an-tier">
            <h3 class="an-tier-label">${_tierLabel(tier as number)}</h3>
            <ul class="an-tier-list">
              ${items.map((n) => `
                <li class="an-item" data-notif-id="${n.id}" data-action-id="${n.actionId}" data-book-id="${n.bookId}">
                  <span class="an-item-text">${_esc(n.text)}</span>
                  <div class="an-item-actions">
                    <button class="an-item-btn" data-action="go" title="Open book">Open</button>
                    <button class="an-item-btn an-item-btn--dismiss" data-action="dismiss" title="Dismiss">Dismiss</button>
                  </div>
                </li>
              `).join('')}
            </ul>
          </section>
        `).join('')}
      </div>
      <footer class="an-panel-foot">
        <button class="an-dismiss-all-btn" id="anDismissAll">Dismiss all</button>
      </footer>
    </div>
  `;

  _bindEvents(root);
}

function _bindEvents(root: HTMLElement): void {
  const badge  = root.querySelector('#anBadge') as HTMLElement | null;
  const panel  = root.querySelector('#anPanel') as HTMLElement | null;
  const close  = root.querySelector('#anCloseBtn') as HTMLElement | null;
  const dimAll = root.querySelector('#anDismissAll') as HTMLElement | null;

  badge?.addEventListener('click', () => {
    panel?.removeAttribute('hidden');
    badge.hidden = true;
  });
  badge?.addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
      panel?.removeAttribute('hidden');
      badge.hidden = true;
    }
  });

  close?.addEventListener('click', () => {
    panel?.setAttribute('hidden', '');
    if (badge) badge.hidden = false;
  });

  dimAll?.addEventListener('click', async () => {
    await _markAllRead();
  });

  root.querySelectorAll('[data-action="go"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const li = (btn as HTMLElement).closest('[data-notif-id]') as HTMLElement | null;
      if (!li) return;
      const { notifId, bookId } = li.dataset as { notifId?: string; bookId?: string };
      if (notifId) await _markRead(notifId);
      if (bookId) {
        App?.show?.('book', { id: bookId });
      }
    });
  });

  root.querySelectorAll('[data-action="dismiss"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const li = (btn as HTMLElement).closest('[data-notif-id]') as HTMLElement | null;
      if (!li) return;
      const notifId = (li.dataset as { notifId?: string }).notifId;
      if (notifId) await _markRead(notifId);
    });
  });
}

// ── Firestore helpers ────────────────────────────────────────────────────────

async function _markRead(notifId: string): Promise<void> {
  if (!_uid || !_db) return;
  try {
    const wsId = ENV.WORKSPACE_ID || MARGINALIA_FIREBASE?.workspaceId || 'default';
    await updateDoc(
      doc(_db, 'workspaces', wsId, 'notifications', _uid, 'unread', notifId),
      { read: true },
    );
  } catch (err) {
    logError(err as Error, { context: 'ActionNotifications markRead' });
  }
}

async function _markAllRead(): Promise<void> {
  for (const n of _notifs) {
    await _markRead(n.id);
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────

function _groupByTier(notifs: NotifDoc[]): [number, NotifDoc[]][] {
  const map = new Map<number, NotifDoc[]>();
  for (const n of notifs) {
    const bucket = map.get(n.tier) ?? [];
    bucket.push(n);
    map.set(n.tier, bucket);
  }
  // Sort tiers descending (90d most urgent = needs decision, 7d least urgent)
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

function _tierLabel(tier: number): string {
  if (tier === 90) return '90-day review — keep or archive?';
  if (tier === 30) return '30-day check-in — still meaningful?';
  return '7-day reminder — memory still fresh';
}

function _esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
