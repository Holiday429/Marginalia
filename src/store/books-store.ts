/* ==========================================================================
   Marginalia · Books Store
   --------------------------------------------------------------------------
   Single source of truth for book data visible to views.

   Authenticated path:  Firestore onSnapshot on workspaces/{wsId}/users/{uid}/books.
   Unauthenticated path: Seed data from window.BOOK_DETAILS (demo only).

   Views should read via BooksStore.getAll() / BooksStore.getById(id)
   and re-render on the 'marginalia:books-changed' event.
   ========================================================================== */

import { logError } from '../services/analytics.ts';
import { ENV } from '../core/env.ts';
import { BOOK_DETAILS as SEED_DETAILS, BOOK_BY_ID as SEED_BY_ID } from '../data/seed/index.js';

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

function _toSpineRecord(b: BookRecord): Record<string, unknown> {
  // Shelf expects flat { title, author, spine, text, w, h, status, font, weight }.
  // Seed books already have these. Firestore books use the nested schema
  // (cover.bg, cover.text, meta.title, user.status), so we map them here.
  const meta: any   = (b as any).meta  ?? {};
  const cover: any  = (b as any).cover ?? {};
  const user: any   = (b as any).user  ?? {};
  return {
    id:     b.id,
    title:  b.title  ?? meta.title  ?? String(b.id),
    author: b.author ?? meta.author ?? '',
    spine:  b.spine  ?? cover.bg    ?? '#14263e',
    text:   b.text   ?? cover.text  ?? '#e8dfc8',
    w:      (b as any).w ?? 38,
    h:      (b as any).h ?? 0.88,
    status: b.status ?? user.status ?? 'want',
    font:   (b as any).font   ?? cover.font   ?? "'Fraunces', serif",
    weight: (b as any).weight ?? cover.weight ?? 500,
  };
}

function _emit() {
  // Keep legacy window globals in sync so old views (shelf, library-2d, booklist, book)
  // continue to work while they await full migration to BooksStore.
  // TODO(p0-cleanup): remove once all views read from BooksStore directly.
  (window as any).BOOK_BY_ID = _byId;
  (window as any).BOOK_DETAILS = _books;
  // Shelf expects spine-format records; map each book to that shape.
  (window as any).SHELF_BOOKS = _books.map(_toSpineRecord);

  window.dispatchEvent(new CustomEvent('marginalia:books-changed', {
    detail: { books: _books },
  }));
}

function _loadSeed() {
  // Use the imported seed reference directly — window.BOOK_DETAILS is now owned
  // by _emit() and will be overwritten, so we cannot read from it here.
  _books = Array.isArray(SEED_DETAILS) ? [...SEED_DETAILS] : [];
  _byId  = { ...SEED_BY_ID };
}

/** Called when user signs in. Starts the Firestore onSnapshot listener. */
function initWithUser(uid: string, db: FirestoreDB) {
  if (_uid === uid) return; // already listening for this user
  teardown();
  _uid = uid;

  const wsId = ENV.WORKSPACE_ID || (window as any).MARGINALIA_FIREBASE?.workspaceId || 'default';
  const bookColRef = db
    .collection('workspaces').doc(wsId)
    .collection('users').doc(uid)
    .collection('books');

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
