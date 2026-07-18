/* ==========================================================================
   Marginalia · Books Store
   --------------------------------------------------------------------------
   Single source of truth for book data visible to views.

   Authenticated path:  Firestore onSnapshot on workspaces/{wsId}/users/{uid}/books.
   Demo path:          Seed data is shown until the user has their own books.

   Views should read via BooksStore.getAll() / BooksStore.getById(id)
   and re-render on the 'marginalia:books-changed' event.
   ========================================================================== */

import { collection, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { logError } from '../services/analytics.ts';
import { ENV } from '../core/env.ts';
import { MARGINALIA_FIREBASE } from '../firebase/config.ts';
import { BOOK_DETAILS as SEED_DETAILS, BOOK_BY_ID as SEED_BY_ID } from '../data/seed/index.js';

type FirestoreDB = Firestore;

interface BookRecord {
  id: string;
  [key: string]: unknown;
}

let _books: BookRecord[] = [];
let _byId: Record<string, BookRecord> = {};
let _shelfBooks: Record<string, unknown>[] = [];
let _unsubscribe: Unsubscribe | null = null;
let _uid: string | null = null;
let _hasOwnBooks = false;
let _usingDemoData = true;

function _isSapiensLike(book: BookRecord): boolean {
  const rawId = String(book?.id || '').toLowerCase();
  if (rawId === 'sapiens') return true;
  const title = String((book as any)?.title || '');
  const normalized = title.toLowerCase();
  return normalized.includes('sapien') || title.includes('人类简史');
}

function _normalizeSapiens(book: BookRecord): BookRecord {
  const seed = SEED_BY_ID.sapiens as BookRecord | undefined;
  if (!seed) return { ...book, id: 'sapiens' };

  const seedAny = seed as any;
  const bookAny = book as any;
  return {
    ...bookAny,
    ...seedAny,
    id: 'sapiens',
    status: 'finished',
    title: seedAny.title,
    author: seedAny.author,
    titleZh: seedAny.titleZh,
    authorZh: seedAny.authorZh,
    tags: Array.isArray(seedAny.tags) ? [...seedAny.tags] : seedAny.tags,
    cover: {
      ...(bookAny.cover ?? {}),
      ...(seedAny.cover ?? {}),
    },
    meta: {
      ...(bookAny.meta ?? {}),
      ...(seedAny.meta ?? {}),
    },
  } as BookRecord;
}

function _canonicalizeBooks(books: BookRecord[]): BookRecord[] {
  const out: BookRecord[] = [];
  let hasSapiens = false;

  (books || []).forEach((book) => {
    if (_isSapiensLike(book)) {
      if (hasSapiens) return;
      out.push(_normalizeSapiens(book));
      hasSapiens = true;
      return;
    }
    out.push(book);
  });

  return out;
}

function _toSpineRecord(b: BookRecord): Record<string, unknown> {
  // Shelf expects flat { title, author, spine, text, w, h, status, font, weight }.
  // Seed books already have these. Firestore books use the nested schema
  // (cover.bg, cover.text, meta.title, user.status), so we map them here.
  const meta: any   = (b as any).meta  ?? {};
  const cover: any  = (b as any).cover ?? {};
  const user: any   = (b as any).user  ?? {};
  const status = _normalizeShelfStatus(b.status ?? user.status);
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

function _normalizeShelfStatus(status: unknown): string {
  const raw = String(status || '').trim();
  if (raw === 'read' || raw === 'finished') return 'finished';
  if (raw === 'reading') return 'reading';
  if (raw === 'want' || raw === 'wishlist' || raw === 'unread' || raw === 'confirmed-later') return 'want';
  return 'want';
}

function _emit() {
  window.dispatchEvent(new CustomEvent('marginalia:books-changed', {
    detail: { books: _books },
  }));
}

function _setVisibleBooks(books: BookRecord[], options: { hasOwnBooks: boolean; usingDemoData: boolean }) {
  _books = _canonicalizeBooks(books);
  _byId = Object.fromEntries(_books.map((b) => [b.id, b]));
  _shelfBooks = _books.map(_toSpineRecord);
  _hasOwnBooks = options.hasOwnBooks;
  _usingDemoData = options.usingDemoData;
}

function _loadSeed() {
  _setVisibleBooks(Array.isArray(SEED_DETAILS) ? [...SEED_DETAILS] : [], {
    hasOwnBooks: false,
    usingDemoData: true,
  });
}

/** Called when user signs in. Starts the Firestore onSnapshot listener. */
function initWithUser(uid: string, db: FirestoreDB) {
  if (_uid === uid) return; // already listening for this user
  teardown();
  _uid = uid;

  const wsId = ENV.WORKSPACE_ID || MARGINALIA_FIREBASE?.workspaceId || 'default';
  const bookColRef = collection(db, 'workspaces', wsId, 'users', uid, 'books');

  _unsubscribe = onSnapshot(
    bookColRef,
    (snapshot) => {
      const userBooks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (userBooks.length > 0) {
        _setVisibleBooks(userBooks, { hasOwnBooks: true, usingDemoData: false });
      } else {
        _loadSeed();
      }
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

function getShelfBooks(): Record<string, unknown>[] {
  return _shelfBooks;
}

function hasOwnBooks(): boolean {
  return _hasOwnBooks;
}

function isUsingDemoData(): boolean {
  return _usingDemoData;
}

function addOptimisticBook(book: BookRecord): void {
  const base = _usingDemoData ? [] : _books;
  const next = base.filter((item) => item.id !== book.id);
  next.unshift(book);
  _setVisibleBooks(next, { hasOwnBooks: true, usingDemoData: false });
  _emit();
}

function removeBook(bookId: string): void {
  const next = _books.filter((b) => b.id !== bookId);
  if (next.length === _books.length) return;
  if (next.length === 0) {
    _loadSeed();
  } else {
    _setVisibleBooks(next, { hasOwnBooks: true, usingDemoData: false });
  }
  _emit();
}

export const BooksStore = {
  initWithUser,
  teardown,
  getUid,
  getShelfBooks,
  hasOwnBooks,
  isUsingDemoData,
  addOptimisticBook,
  removeBook,
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
