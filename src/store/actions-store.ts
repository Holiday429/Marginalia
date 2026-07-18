/* Marginalia · Actions Store
   Firestore listener on workspaces/{wsId}/users/{uid}/actions.
   Per-book knowledge-conversion tasks; see ADR 0007 for design rationale.

   Authenticated:   onSnapshot on the full actions collection.
   Unauthenticated: empty (no seed actions).
*/

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  setDoc,
  type CollectionReference,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { validateWrite, withMeta, withMetaCreate } from '../services/db.ts';
import { ActionSchema } from '../data/schema/action.ts';
import { logError, logEvent } from '../services/analytics.ts';
import { ENV } from '../core/env.ts';
import { MarginaliaAuth } from '../firebase/auth.ts';
import { MARGINALIA_FIREBASE } from '../firebase/config.ts';
import type { Action } from '../data/schema/action.ts';

type FirestoreDB = Firestore;

export interface ActionRecord extends Action {
  id: string;
}

const DAY_MS = 86_400_000;

let _actions: ActionRecord[] = [];
let _unsubscribe: Unsubscribe | null = null;
let _uid: string | null = null;
let _db: FirestoreDB | null = null;
const _listeners: Array<() => void> = [];

function _emit(): void {
  window.dispatchEvent(new CustomEvent('marginalia:actions-changed', {
    detail: { actions: _actions },
  }));
  _listeners.forEach((fn) => fn());
}

function _colRef(): CollectionReference {
  // Lazy-init: if initWithUser hasn't been called yet but Firebase auth is
  // already resolved (e.g. auth-changed fired before this listener registered),
  // pull uid + db directly from MarginaliaAuth and initialise now.
  if (!_uid || !_db) {
    const uid = MarginaliaAuth?.user?.uid;
    const db  = MarginaliaAuth?.db;
    if (uid && db) {
      initWithUser(uid, db);
    }
  }
  if (!_uid || !_db) throw new Error('[ActionsStore] Not initialised');
  const wsId = ENV.WORKSPACE_ID || MARGINALIA_FIREBASE?.workspaceId || 'default';
  return collection(_db, 'workspaces', wsId, 'users', _uid, 'actions');
}

/** Called when user signs in. Starts the Firestore onSnapshot listener. */
function initWithUser(uid: string, db: FirestoreDB): void {
  if (_uid === uid) return;
  teardown();
  _uid = uid;
  _db = db;

  const wsId = ENV.WORKSPACE_ID || MARGINALIA_FIREBASE?.workspaceId || 'default';
  const col = collection(db, 'workspaces', wsId, 'users', uid, 'actions');
  _unsubscribe = onSnapshot(
    col,
    (snapshot) => {
      _actions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ActionRecord[];
      _emit();
    },
    (error: Error) => {
      logError(error, { context: 'ActionsStore onSnapshot' });
    },
  );
}

/** Called when user signs out. */
function teardown(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _uid = null;
  _db = null;
  _actions = [];
  _emit();
}

/** Subscribe to action changes. Returns unsubscribe function. */
function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx !== -1) _listeners.splice(idx, 1);
  };
}

/** Add a new open action for a book. Returns the new document id. */
async function add(bookId: string, text: string): Promise<string> {
  const now = Date.now();
  const payload = validateWrite(ActionSchema, {
    bookId,
    text,
    status:     'open',
    createdAt:  now,
    remind7At:  now + 7  * DAY_MS,
    remind30At: now + 30 * DAY_MS,
    remind90At: now + 90 * DAY_MS,
    reminded7:  false,
    reminded30: false,
    reminded90: false,
    resolvedAt: null,
  });
  const docRef = await addDoc(_colRef(), withMetaCreate(payload));
  logEvent('action_added', { bookId });
  return docRef.id;
}

/** Update arbitrary fields on an action doc. */
async function update(id: string, patch: Partial<Action>): Promise<void> {
  await setDoc(doc(_colRef(), id), withMeta(patch), { merge: true });
}

/** Mark an action done. */
async function markDone(id: string, bookId: string): Promise<void> {
  const action = getById(id);
  const daysOpen = action
    ? Math.round((Date.now() - action.createdAt) / DAY_MS)
    : undefined;
  await update(id, { status: 'done', resolvedAt: Date.now() });
  logEvent('action_completed', { bookId, daysOpen });
}

/** Mark an action archived. */
async function archive(id: string): Promise<void> {
  await update(id, { status: 'archived', resolvedAt: Date.now() });
}

/**
 * Snooze: resets all three reminder tier timestamps from now,
 * clears fired flags so the user gets a fresh 7/30/90-day window.
 */
async function snooze(id: string): Promise<void> {
  const now = Date.now();
  await update(id, {
    status:     'snoozed',
    remind7At:  now + 7  * DAY_MS,
    remind30At: now + 30 * DAY_MS,
    remind90At: now + 90 * DAY_MS,
    reminded7:  false,
    reminded30: false,
    reminded90: false,
  });
}

/** Re-open a snoozed, done, or archived action. */
async function reopen(id: string): Promise<void> {
  await update(id, { status: 'open', resolvedAt: null });
}

function getAll(): ActionRecord[] { return _actions; }
function getById(id: string): ActionRecord | undefined { return _actions.find((a) => a.id === id); }
function getByBook(bookId: string): ActionRecord[] { return _actions.filter((a) => a.bookId === bookId); }
function getUid(): string | null { return _uid; }

export const ActionsStore = {
  initWithUser,
  teardown,
  subscribe,
  getAll,
  getById,
  getByBook,
  getUid,
  add,
  update,
  markDone,
  archive,
  snooze,
  reopen,
};
