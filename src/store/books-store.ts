/* ==========================================================================
   Marginalia · Books Store
   --------------------------------------------------------------------------
   Single source of truth for book data visible to views.

   Authenticated path:  Firestore onSnapshot on users/{uid}/data/books.
   Unauthenticated path: Seed data from window.BOOK_DETAILS (demo only).

   Views should read via BooksStore.getAll() / BooksStore.getById(id)
   and re-render on the 'marginalia:books-changed' event.
   ========================================================================== */

import { logError } from '../services/analytics.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDB = any;

interface BookRecord {
  id: string;
  [key: string]: unknown;
}

let _books: BookRecord[] = [];
let _byId: Record<string, BookRecord> = {};
let _unsubscribe: (() => void) | null = null;
let _uid: string | null = null;

function _emit() {
  // Keep legacy window globals in sync so old views (shelf, library-2d, booklist, book)
  // continue to work while they await full migration to BooksStore.
  // TODO(p0-cleanup): remove once all views read from BooksStore directly.
  (window as any).BOOK_BY_ID = _byId;
  (window as any).BOOK_DETAILS = _books;
  (window as any).SHELF_BOOKS = _books;

  window.dispatchEvent(new CustomEvent('marginalia:books-changed', {
    detail: { books: _books },
  }));
}

function _loadSeed() {
  const seed: BookRecord[] = Array.isArray((window as any).BOOK_DETAILS)
    ? (window as any).BOOK_DETAILS
    : [];
  _books = seed;
  _byId  = Object.fromEntries(seed.map((b) => [b.id, b]));
}

/** Called when user signs in. Starts the Firestore onSnapshot listener. */
function initWithUser(uid: string, db: FirestoreDB) {
  if (_uid === uid) return; // already listening for this user
  teardown();
  _uid = uid;

  // Firestore path per CLAUDE.md: users/{uid}/data/books/{bookId}
  const bookColRef = db.collection(`users/${uid}/data/books`);

  _unsubscribe = bookColRef.onSnapshot(
    (snapshot: any) => {
      _books = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      _byId  = Object.fromEntries(_books.map((b) => [b.id, b]));
      _emit();
    },
    (error: Error) => {
      logError(error, { context: 'BooksStore onSnapshot' });
    },
  );

  _emit();
}

/** Called when user signs out. Detaches listener and falls back to seed data. */
function teardown() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _uid = null;
  _loadSeed();
  _emit();
}

/** Returns current uid being listened to, or null. */
function getUid(): string | null {
  return _uid;
}

export const BooksStore = (window as any).BooksStore = {
  initWithUser,
  teardown,
  getUid,
  getAll():                  BookRecord[]         { return _books; },
  getById(id: string):       BookRecord | undefined { return _byId[id]; },
  getByStatus(status: string): BookRecord[]        { return _books.filter((b) => b.status === status); },
  getByType(type: string):   BookRecord[]          { return _books.filter((b) => b.bookType === type); },
};

// Unauthenticated default: seed data, loaded once on DOMContentLoaded.
// This keeps demo visitors working even before auth resolves.
document.addEventListener('DOMContentLoaded', () => {
  if (!_uid) _loadSeed();
});
