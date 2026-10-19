// Marginalia · Reading session controller (site-wide focus timer)
// Records how long the user spends in focused reading/thinking mode — not per-book.
// Optional bookId attribution links session to a currently-reading book.
// Active session survives page reloads via sessionStorage.

import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { withMetaCreate, validateWrite } from '../../services/db.ts';
import { logEvent, logError } from '../../services/analytics.ts';
import { track } from '../../services/events.ts';
import { ReadingSessionSchema } from '../../data/schema/reading-session.ts';
import { WsPaths } from '../../firebase/paths.ts';
import { getWorkspaceId } from '../../firebase/workspace.ts';

type FirestoreDB = Firestore;

export interface ActiveSession {
  sessionId: string;
  bookId: string | null;
  startedAt: number;
}

const SESSION_KEY = 'marginalia:active-session';

// workspaces/{ws}/users/{uid}/sessions/{sessionId} — same root as every other user collection.
function sessionRef(db: FirestoreDB, uid: string, sessionId: string) {
  return doc(db, WsPaths.session(getWorkspaceId(), uid, sessionId));
}

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
export async function start(bookId: string | null = null, opts: { withPlace?: boolean } = {}): Promise<ActiveSession | null> {
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
      await setDoc(sessionRef(_db, _uid, sessionId), withMetaCreate(payload));
    } catch (err) {
      logError(err, { context: 'ReadingSession.start' });
    }
  }

  const session: ActiveSession = { sessionId, bookId, startedAt };
  _setActive(session);
  logEvent('reading_session_started', { bookId, startedAt });
  if (opts.withPlace) void notePlace(sessionId, bookId);
  return session;
}

/** Optional city-level place for this session (needs the reader's permission); never blocks the timer. */
async function notePlace(sessionId: string, bookId: string | null): Promise<void> {
  try {
    const { captureReadingPlace, rememberReadingPlace } = await import('./reading-place.ts');
    const place = await captureReadingPlace();
    if (!place) return;
    if (_uid && _db) await setDoc(sessionRef(_db, _uid, sessionId), { place: { country: place.country, city: place.city }, _updatedAt: Date.now() }, { merge: true });
    await rememberReadingPlace(bookId, place);
  } catch (err) {
    logError(err, { context: 'ReadingSession.notePlace' });
  }
}

/** Stop the active session and return durationMs. */
export async function stop(): Promise<{ durationMs: number } | null> {
  const session = getActive();
  if (!session) return null;

  const endedAt    = Date.now();
  const durationMs = endedAt - session.startedAt;

  if (_uid && _db) {
    try {
      // Re-send the identifying fields so a missed start write still produces a valid doc.
      const payload = validateWrite(ReadingSessionSchema, {
        bookId:     session.bookId ?? '',
        startedAt:  session.startedAt,
        endedAt,
        durationMs,
      });
      await setDoc(sessionRef(_db, _uid, session.sessionId), { ...payload, _updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      logError(err, { context: 'ReadingSession.stop' });
    }
  }

  _setActive(null);
  track('session_completed', { bookId: session.bookId, durationMs });
  // Hook for the "want to note something?" prompt (quick capture, plan task 2.1).
  window.dispatchEvent(new CustomEvent('marginalia:session-ended', {
    detail: { sessionId: session.sessionId, bookId: session.bookId, durationMs },
  }));
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
