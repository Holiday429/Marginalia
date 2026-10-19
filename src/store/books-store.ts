/* ==========================================================================
   Marginalia · Books Store
   --------------------------------------------------------------------------
   Single source of truth for book data visible to views.

   Data comes only through a BookDataSource (./book-data-source.ts):
     signed in  → Firestore books of that user (empty library = empty list, never demo data)
     signed out → the single demo library from src/data/demo

   Views should read via BooksStore.getAll() / BooksStore.getById(id)
   and re-render on the 'marginalia:books-changed' event.
   ========================================================================== */

import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { logError } from '../services/analytics.ts';
import { normalizeReadingStatus } from '../shared/reading-status.ts';
import { createDemoSource, createFirestoreSource, type BookDataSource, type BookRecord } from './book-data-source.ts';
import { getWorkspaceId } from '../firebase/workspace.ts';

type FirestoreDB = Firestore;

let _books: BookRecord[] = [];
let _byId: Record<string, BookRecord> = {};
let _shelfBooks: Record<string, unknown>[] = [];
let _source: BookDataSource | null = null;
let _unwatch: Unsubscribe | null = null;
let _uid: string | null = null;

const DEMO_ID_PREFIX = '__demo_';
const _isDemoRecord = (b: BookRecord) => String(b.id).startsWith(DEMO_ID_PREFIX);

function _toSpineRecord(b: BookRecord): Record<string, unknown> {
  // Shelf expects flat { title, author, spine, text, w, h, status, font, weight }.
  // Seed books already have these. Firestore books use the nested schema
  // (cover.bg, cover.text, meta.title, user.status), so we map them here.
  const meta: any   = (b as any).meta  ?? {};
  const cover: any  = (b as any).cover ?? {};
  const user: any   = (b as any).user  ?? {};
  const status = normalizeReadingStatus(b.status ?? user.status);
  return {
    id:     b.id,
    title:  b.title  ?? meta.title  ?? String(b.id),
    author: b.author ?? meta.author ?? '',
    spine:  b.spine  ?? cover.bg    ?? '#14263e',
    text:   b.text   ?? cover.text  ?? '#e8dfc8',
    w:      (b as any).w ?? 38,
    h:      (b as any).h ?? 0.88,
    status,
    tags:   Array.isArray((b as any).tags) ? [...((b as any).tags)] : [],
    cover:  cover.image ? { image: cover.image } : undefined,
    coverImage: cover.image ?? '',
    font:   (b as any).font   ?? cover.font   ?? "'Fraunces', serif",
    weight: (b as any).weight ?? cover.weight ?? 500,
  };
}

function _emit() {
  window.dispatchEvent(new CustomEvent('marginalia:books-changed', {
    detail: { books: _books },
  }));
}

function _setVisibleBooks(books: BookRecord[]) {
  _books = books;
  _byId = Object.fromEntries(_books.map((b) => [b.id, b]));
  _shelfBooks = _books.map(_toSpineRecord);
}

function _watch(source: BookDataSource) {
  if (_unwatch) { _unwatch(); _unwatch = null; }
  _source = source;
  _unwatch = source.watchBooks(
    (books) => { _setVisibleBooks(books); _emit(); },
    (error) => logError(error, { context: 'BooksStore watchBooks' }),
  );
}

/** Called when a user signs in: from now on only their own Firestore books are visible. */
function initWithUser(uid: string, db: FirestoreDB) {
  if (_uid === uid) return; // already listening for this user
  _uid = uid;
  _setVisibleBooks([]); // never show demo books to a signed-in user while the first snapshot loads
  _watch(createFirestoreSource(db, getWorkspaceId(), uid));
  _emit();
}

/** Called when the user signs out (and at boot): back to the demo library. */
function teardown() {
  _uid = null;
  _watch(createDemoSource());
}

/** Returns current uid being listened to, or null. */
function getUid(): string | null {
  return _uid;
}

function getShelfBooks(): Record<string, unknown>[] {
  return _shelfBooks;
}

/** True when the visible library contains books the visitor/user created (not demo books). */
function hasOwnBooks(): boolean {
  return _books.some((b) => !_isDemoRecord(b));
}

/** True for books from the demo library (they have no Firestore doc and cannot be edited or removed). */
function isDemoBook(id: string): boolean {
  return String(id).startsWith(DEMO_ID_PREFIX);
}

function isUsingDemoData(): boolean {
  return _source?.kind !== 'firestore';
}

function addOptimisticBook(book: BookRecord): void {
  const next = _books.filter((item) => item.id !== book.id);
  next.unshift(book);
  _setVisibleBooks(next);
  _emit();
}

function removeBook(bookId: string): void {
  const next = _books.filter((b) => b.id !== bookId);
  if (next.length === _books.length) return;
  _setVisibleBooks(next);
  _emit();
}

export const BooksStore = {
  initWithUser,
  teardown,
  getUid,
  getShelfBooks,
  hasOwnBooks,
  isUsingDemoData,
  isDemoBook,
  addOptimisticBook,
  removeBook,
  getAll():                  BookRecord[]         { return _books; },
  getById(id: string):       BookRecord | undefined { return _byId[id]; },
  getByStatus(status: string): BookRecord[]        { return _books.filter((b) => b.status === status); },
  getByType(type: string):   BookRecord[]          { return _books.filter((b) => b.bookType === type); },
};

// Signed-out default: the demo library, loaded once on DOMContentLoaded so demo visitors
// work even before auth resolves. A signed-in user replaces it via initWithUser().
document.addEventListener('DOMContentLoaded', () => {
  if (!_uid && !_source) teardown();
});
