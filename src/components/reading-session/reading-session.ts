// Marginalia · Reading session controller
// start(bookId) / stop(endPage?) / getActive() / getTotalMs(bookId)
// Active session survives page reloads via sessionStorage.

import { withMetaCreate, validateWrite } from '../../services/db.ts';
import { logEvent, logError } from '../../services/analytics.ts';
import { ReadingSessionSchema } from '../../data/schema/reading-session.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDB = any;

export interface ActiveSession {
  sessionId: string;
  bookId: string;
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

export async function start(bookId: string): Promise<ActiveSession | null> {
  if (!_uid || !_db) return null;

  const existing = getActive();
  if (existing?.bookId === bookId) return existing;

  if (existing) {
    await stop();
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();

  const payload = validateWrite(ReadingSessionSchema, {
    bookId,
    startedAt,
    endedAt:    null,
    durationMs: null,
    endPage:    null,
  });

  try {
    const ref = _db
      .collection(`users/${_uid}/data/books/${bookId}/sessions`)
      .doc(sessionId);
    await ref.set(withMetaCreate(payload));
  } catch (err) {
    logError(err, { context: 'ReadingSession.start', bookId });
    return null;
  }

  const session: ActiveSession = { sessionId, bookId, startedAt };
  _setActive(session);
  logEvent('reading_session_started', { bookId, startedAt });
  return session;
}

export async function stop(endPage?: number): Promise<{ durationMs: number } | null> {
  const session = getActive();
  if (!session || !_uid || !_db) return null;

  const endedAt   = Date.now();
  const durationMs = endedAt - session.startedAt;

  try {
    const ref = _db
      .collection(`users/${_uid}/data/books/${session.bookId}/sessions`)
      .doc(session.sessionId);
    await ref.set(
      { endedAt, durationMs, endPage: endPage ?? null, _updatedAt: Date.now() },
      { merge: true },
    );
  } catch (err) {
    logError(err, { context: 'ReadingSession.stop', bookId: session.bookId });
  }

  _setActive(null);
  logEvent('reading_session_ended', {
    bookId: session.bookId,
    durationMs,
    endPage: endPage ?? null,
  });
  return { durationMs };
}

/** Fetch the sum of all completed session durationMs for a book from Firestore. */
export async function getTotalMs(bookId: string): Promise<number> {
  if (!_uid || !_db) return 0;
  try {
    const snap = await _db
      .collection(`users/${_uid}/data/books/${bookId}/sessions`)
      .get();
    let total = 0;
    snap.docs.forEach((doc: any) => {
      const d = doc.data();
      if (typeof d.durationMs === 'number') total += d.durationMs;
    });
    return total;
  } catch {
    return 0;
  }
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
