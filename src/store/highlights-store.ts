// Marginalia · Highlights Store
// Firestore listener + writer for the signed-in user's highlights.
// Path: workspaces/{ws}/users/{uid}/highlights/{id} (flat; each doc carries its bookId).
// Unauthenticated path: empty; notes-wall falls back to seed data.
// Views subscribe via 'marginalia:highlights-changed' or HighlightsStore.subscribe().

import {
  collection, doc, deleteDoc, onSnapshot, setDoc, writeBatch,
  type CollectionReference, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import { logError } from '../services/analytics.ts';
import { validateWrite, withMeta } from '../services/db.ts';
import { HighlightSchema } from '../data/schema/highlight.ts';
import { WsPaths } from '../firebase/paths.ts';
import { getWorkspaceId } from '../firebase/workspace.ts';
import { backfillSchedule, scheduleFrom } from '../../shared/resurface.ts';

type FirestoreDB = Firestore;

export interface HighlightRecord {
  id: string;
  bookId: string;
  quote: string;
  bookTitle?: string;
  [key: string]: unknown;
}

const BATCH_LIMIT = 400;

let _highlights: HighlightRecord[] = [];
let _unsubscribe: Unsubscribe | null = null;
let _uid: string | null = null;
let _db: FirestoreDB | null = null;
const _listeners: Array<() => void> = [];

function _emit(): void {
  window.dispatchEvent(new CustomEvent('marginalia:highlights-changed', {
    detail: { highlights: _highlights },
  }));
  _listeners.forEach((fn) => fn());
}

function _collectionRef(): CollectionReference | null {
  if (!_db || !_uid) return null;
  return collection(_db, WsPaths.highlights(getWorkspaceId(), _uid));
}

const RESURFACE_KEYS = [
  'resurface7At', 'resurface30At', 'resurface90At', 'resurfaced7', 'resurfaced30', 'resurfaced90',
  'resurfaceRating', 'resurfaceRespondedAt', 'lastSurfacedAt',
];

/**
 * The review schedule (plan 2.4) is written once, when a highlight is first saved here. A save of a
 * highlight that already has one (editing its comment, answering a resurface) must never reset it, so the
 * stored schedule wins over whatever copy the caller holds; `explicit` lets the resurface store write answers.
 */
function _withSchedule(record: Record<string, unknown>, explicit: boolean): Record<string, unknown> {
  if (explicit) return record;
  const id = String(record.id);
  const existing = _highlights.find((h) => h.id === id);
  const out = { ...record };
  if (existing && typeof existing.resurface7At === 'number') {
    RESURFACE_KEYS.forEach((k) => delete out[k]);
    return out;
  }
  if (typeof out.resurface7At === 'number') return out;
  const now = Date.now();
  const created = Number(out.createdAt) || now;
  // A fresh manual or quick highlight comes back a week after it was saved; imported and older ones are spread out.
  const fresh = now - created < 5 * 60_000 && (out.source === 'manual' || out.source === 'quick' || out.source === undefined);
  return { ...out, ...(fresh ? scheduleFrom(created) : backfillSchedule(id, now)) };
}

/** Validate, then drop undefined fields (Firestore rejects them). */
function _toPayload(record: Record<string, unknown>, explicit = false) {
  const validated = validateWrite(HighlightSchema, _withSchedule(record, explicit)) as Record<string, unknown>;
  const clean = Object.fromEntries(Object.entries(validated).filter(([, v]) => v !== undefined));
  return withMeta(clean);
}

/** Called when user signs in. Starts the Firestore listener. */
function initWithUser(uid: string, db: FirestoreDB): void {
  if (_uid === uid) return;
  teardown();
  _uid = uid;
  _db = db;

  const ref = _collectionRef();
  if (!ref) return;

  _unsubscribe = onSnapshot(
    ref,
    (snapshot) => {
      _highlights = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as HighlightRecord[];
      _emit();
    },
    (error: Error) => {
      logError(error, { context: 'HighlightsStore onSnapshot' });
    },
  );
}

/** Upsert one highlight. No-op when signed out (local IndexedDB copy is the record). */
async function save(record: Record<string, unknown> & { id: string }, opts: { explicitResurface?: boolean } = {}): Promise<void> {
  const ref = _collectionRef();
  if (!ref) return;
  await setDoc(doc(ref, record.id), _toPayload(record, opts.explicitResurface === true), { merge: true });
}

/** Upsert many highlights (Kindle import). */
async function saveMany(records: Array<Record<string, unknown> & { id: string }>): Promise<void> {
  const ref = _collectionRef();
  if (!ref || !_db) return;
  for (let i = 0; i < records.length; i += BATCH_LIMIT) {
    const batch = writeBatch(_db);
    records.slice(i, i + BATCH_LIMIT).forEach((record) => {
      batch.set(doc(ref, record.id), _toPayload(record), { merge: true });
    });
    await batch.commit();
  }
}

async function remove(id: string): Promise<void> {
  const ref = _collectionRef();
  if (!ref) return;
  await deleteDoc(doc(ref, id));
}

/** Called when user signs out. Detaches listener and clears highlights. */
function teardown(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _uid = null;
  _db = null;
  _highlights = [];
  _emit();
}

/** Subscribe to highlight changes. Returns an unsubscribe function. */
function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx !== -1) _listeners.splice(idx, 1);
  };
}

export const HighlightsStore = {
  initWithUser,
  teardown,
  subscribe,
  save,
  saveMany,
  remove,
  getAll(): HighlightRecord[] { return _highlights; },
  getUid(): string | null { return _uid; },
};
