// Marginalia · Reading session controller (site-wide focus timer)
// Records how long the user spends in focused reading/thinking mode — not per-book.
// Optional bookId attribution links session to a currently-reading book.
// Active session survives page reloads via sessionStorage.

import { withMetaCreate, validateWrite } from '../../services/db.ts';
import { logEvent, logError } from '../../services/analytics.ts';
import { ReadingSessionSchema } from '../../data/schema/reading-session.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDB = any;

export interface ActiveSession {
  sessionId: string;
  bookId: string | null;
  startedAt: number;
}

const SESSION_KEY = 'marginalia:active-session';

let _uid: string | null = null;
let _db: FirestoreDB | null = null;

export function initReadingSession(uid: string, db: FirestoreDB): void {
  _uid = uid;
  _db  = db;
}

export function teardownReadingSession(): void {
  _uid = null;
  _db  = null;
}

export function getActive(): ActiveSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}

function _setActive(session: ActiveSession | null): void {
  if (session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
  window.dispatchEvent(new CustomEvent('marginalia:session-changed', { detail: { session } }));
}

/** Start a site-wide focus session. bookId is optional attribution. */
export async function start(bookId: string | null = null): Promise<ActiveSession | null> {
  const existing = getActive();
  if (existing) return existing;

  const sessionId  = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt  = Date.now();

  if (_uid && _db) {
    try {
      const payload = validateWrite(ReadingSessionSchema, {
        bookId:     bookId ?? '',
        startedAt,
        endedAt:    null,
        durationMs: null,
        endPage:    null,
      });
      // Top-level sessions collection — not per-book subcollection.
      const ref = _db.collection(`users/${_uid}/data/sessions`).doc(sessionId);
      await ref.set(withMetaCreate(payload));
    } catch (err) {
      logError(err, { context: 'ReadingSession.start' });
    }
  }

  const session: ActiveSession = { sessionId, bookId, startedAt };
  _setActive(session);
  logEvent('reading_session_started', { bookId, startedAt });
  return session;
}

/** Stop the active session and return durationMs. */
export async function stop(): Promise<{ durationMs: number } | null> {
  const session = getActive();
  if (!session) return null;

  const endedAt    = Date.now();
  const durationMs = endedAt - session.startedAt;

  if (_uid && _db) {
    try {
      const ref = _db.collection(`users/${_uid}/data/sessions`).doc(session.sessionId);
      await ref.set({ endedAt, durationMs, _updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      logError(err, { context: 'ReadingSession.stop' });
    }
  }

  _setActive(null);
  logEvent('reading_session_ended', { bookId: session.bookId, durationMs });
  return { durationMs };
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
