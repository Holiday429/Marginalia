// Marginalia · Highlights Store
// Firestore collectionGroup listener on all highlights under the current user's books.
// Authenticated path:   onSnapshot(collectionGroup('highlights')) — filtered to user's path by Firestore rules.
// Unauthenticated path: empty; notes-wall falls back to seed data.
// Views subscribe via 'marginalia:highlights-changed' or HighlightsStore.subscribe().

import { collectionGroup, onSnapshot, orderBy, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { logError } from '../services/analytics.ts';

type FirestoreDB = Firestore;

export interface HighlightRecord {
  id: string;
  bookId: string;
  quote: string;
  bookTitle?: string;
  [key: string]: unknown;
}

let _highlights: HighlightRecord[] = [];
let _unsubscribe: Unsubscribe | null = null;
let _uid: string | null = null;
const _listeners: Array<() => void> = [];

function _emit(): void {
  window.dispatchEvent(new CustomEvent('marginalia:highlights-changed', {
    detail: { highlights: _highlights },
  }));
  _listeners.forEach((fn) => fn());
}

/** Called when user signs in. Starts the Firestore collectionGroup listener. */
function initWithUser(uid: string, db: FirestoreDB): void {
  if (_uid === uid) return;
  teardown();
  _uid = uid;

  // collectionGroup('highlights') matches all subcollections named 'highlights'.
  // Firestore rules restrict reads to users/{uid}/**, so only this user's highlights are returned.
  const highlightsQuery = query(
    collectionGroup(db, 'highlights'),
    where('bookId', '>=', ''),  // ensures only docs with a bookId field are included
    orderBy('bookId'),
  );

  _unsubscribe = onSnapshot(
    highlightsQuery,
    (snapshot) => {
      _highlights = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as HighlightRecord[];
      _emit();
    },
    (error: Error) => {
      logError(error, { context: 'HighlightsStore onSnapshot' });
    },
  );
}

/** Called when user signs out. Detaches listener and clears highlights. */
function teardown(): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _uid = null;
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
  getAll(): HighlightRecord[] { return _highlights; },
  getUid(): string | null { return _uid; },
};
