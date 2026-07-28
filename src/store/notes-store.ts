/* ==========================================================================
   Marginalia · Notes Store
   --------------------------------------------------------------------------
   Persists user-created highlights, action statuses, and book notes to IndexedDB.
   Firebase flush happens when user is signed in (via db.js).

   Public surface:
     NotesStore.getActionStatus(bookId, actionId) → 'todo'|'doing'|'done'|null
     NotesStore.setActionStatus(bookId, actionId, status) → Promise
     NotesStore.getHighlights(bookId) → highlight[]   (user-created only)
     NotesStore.saveHighlight(bookId, highlight) → Promise
     NotesStore.deleteHighlight(bookId, highlightId) → Promise
     NotesStore.importHighlights(bookId, highlights) → Promise  (for Kindle import)
     NotesStore.getNote(bookId) → { content, updatedAt } | null
     NotesStore.saveNote(bookId, content) → Promise
     NotesStore.onChange(fn) — subscribe to any change
   ========================================================================== */

import { logError } from '../services/analytics.ts';

type Book = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- merged from inconsistent seed/store/cloud sources

interface HighlightRecord {
  id: string;
  bookId: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

interface NoteRecord {
  bookId: string;
  content: string;
  updatedAt: number;
}

interface ActionStatusRecord {
  key: string;
  bookId: string;
  actionId: string;
  status: string;
  updatedAt: number;
}

interface AiResultRecord {
  key: string;
  bookId: string;
  featureId: string;
  data: unknown;
  savedAt: number;
}

type ChangeListener = () => void;

export const NotesStore = (() => {
  const DB_NAME    = 'marginalia-notes';
  const DB_VERSION = 3;
  const STORE_ACTIONS    = 'action-status';
  const STORE_HIGHLIGHTS = 'highlights';
  const STORE_NOTES      = 'book-notes';
  const STORE_AI         = 'ai-results';
  const STORE_BOOKS      = 'user-books';

  let _db: IDBDatabase | null = null;
  const _listeners: ChangeListener[] = [];

  /* ── Init ────────────────────────────────────────────────────────────────── */

  function init(): Promise<void> {
    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_ACTIONS)) {
          // key: "bookId::actionId"
          db.createObjectStore(STORE_ACTIONS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_HIGHLIGHTS)) {
          const hs = db.createObjectStore(STORE_HIGHLIGHTS, { keyPath: 'id' });
          hs.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          // key: bookId, one note doc per book
          db.createObjectStore(STORE_NOTES, { keyPath: 'bookId' });
        }
        if (!db.objectStoreNames.contains(STORE_AI)) {
          // key: "bookId::featureId"
          db.createObjectStore(STORE_AI, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          // key: book.id — stores full user-created book objects
          db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        }
      };

      req.onsuccess = (event) => {
        _db    = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      req.onerror = () => {
        logError(new Error('[NotesStore] IndexedDB open failed — falling back to in-memory.'), { context: 'notes-store init' });
        resolve();
      };
    });
  }

  /* ── Internal helpers ────────────────────────────────────────────────────── */

  function _tx(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore | null {
    if (!_db) return null;
    try { return _db.transaction(storeName, mode).objectStore(storeName); }
    catch { return null; }
  }

  function _idbGet<T>(store: IDBObjectStore | null, key: IDBValidKey): Promise<T | null> {
    return new Promise((resolve) => {
      if (!store) return resolve(null);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  }

  function _idbPut(store: IDBObjectStore | null, record: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!store) return resolve();
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  function _idbDelete(store: IDBObjectStore | null, key: IDBValidKey): Promise<void> {
    return new Promise((resolve) => {
      if (!store) return resolve();
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => resolve();
    });
  }

  function _idbGetAllByIndex<T>(storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
    return new Promise((resolve) => {
      const tx = _db?.transaction(storeName, 'readonly');
      if (!tx) return resolve([]);
      const index = tx.objectStore(storeName).index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => resolve([]);
    });
  }

  function _emit(): void {
    _listeners.forEach(fn => { try { fn(); } catch { /* listener error is non-fatal */ } });
    window.dispatchEvent(new CustomEvent('marginalia:notes-changed'));
  }

  /* ── Action status ───────────────────────────────────────────────────────── */

  // In-memory fallback when IndexedDB is unavailable
  const _memActions: Record<string, string> = {};

  async function getActionStatus(bookId: string, actionId: string): Promise<string | null> {
    const key = `${bookId}::${actionId}`;
    if (_db) {
      const record = await _idbGet<ActionStatusRecord>(_tx(STORE_ACTIONS), key);
      return record?.status ?? null;
    }
    return _memActions[key] ?? null;
  }

  async function setActionStatus(bookId: string, actionId: string, status: string): Promise<void> {
    const key = `${bookId}::${actionId}`;
    if (_db) {
      await _idbPut(_tx(STORE_ACTIONS, 'readwrite'), { key, bookId, actionId, status, updatedAt: Date.now() });
    } else {
      _memActions[key] = status;
    }
    _emit();
  }

  /* ── Highlights ──────────────────────────────────────────────────────────── */

  async function getHighlights(bookId: string): Promise<HighlightRecord[]> {
    if (!_db) return [];
    return _idbGetAllByIndex<HighlightRecord>(STORE_HIGHLIGHTS, 'bookId', bookId);
  }

  async function saveHighlight(bookId: string, highlight: Record<string, any>): Promise<HighlightRecord> { // eslint-disable-line @typescript-eslint/no-explicit-any -- caller-supplied partial highlight shape
    const record: HighlightRecord = {
      ...highlight,
      id:        highlight.id     || `hl-${bookId}-${Date.now()}`,
      bookId,
      source:    highlight.source || 'manual',
      createdAt: highlight.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    if (_db) {
      await _idbPut(_tx(STORE_HIGHLIGHTS, 'readwrite'), record);
    }
    _emit();
    return record;
  }

  async function deleteHighlight(bookId: string, highlightId: string): Promise<void> {
    if (_db) await _idbDelete(_tx(STORE_HIGHLIGHTS, 'readwrite'), highlightId);
    _emit();
  }

  // Batch import — used by Kindle parser; skips duplicates by id
  async function importHighlights(bookId: string, highlights: Array<Record<string, any>>): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any -- caller-supplied partial highlight shapes
    if (!_db) return;
    const tx = _db.transaction(STORE_HIGHLIGHTS, 'readwrite');
    const store = tx.objectStore(STORE_HIGHLIGHTS);
    for (const h of highlights) {
      const record = {
        ...h,
        bookId,
        source:    'kindle',
        createdAt: h.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      store.put(record);
    }
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    _emit();
  }

  /* ── Book notes ──────────────────────────────────────────────────────────── */

  async function getNote(bookId: string): Promise<NoteRecord | null> {
    if (!_db) return null;
    return _idbGet<NoteRecord>(_tx(STORE_NOTES), bookId);
  }

  async function saveNote(bookId: string, content: string): Promise<NoteRecord> {
    const record: NoteRecord = { bookId, content, updatedAt: Date.now() };
    if (_db) {
      await _idbPut(_tx(STORE_NOTES, 'readwrite'), record);
    }
    _emit();
    return record;
  }

  /* ── AI results ─────────────────────────────────────────────────────────── */

  async function getAiResult(bookId: string, featureId: string): Promise<unknown> {
    if (!_db) return null;
    const key = `${bookId}::${featureId}`;
    const record = await _idbGet<AiResultRecord>(_tx(STORE_AI), key);
    return record ? record.data : null;
  }

  async function saveAiResult(bookId: string, featureId: string, data: unknown): Promise<void> {
    const key = `${bookId}::${featureId}`;
    if (_db) {
      await _idbPut(_tx(STORE_AI, 'readwrite'), { key, bookId, featureId, data, savedAt: Date.now() });
    }
  }

  async function deleteAiResult(bookId: string, featureId: string): Promise<void> {
    if (!_db) return;
    const key = `${bookId}::${featureId}`;
    await _idbDelete(_tx(STORE_AI, 'readwrite'), key);
  }

  /* ── User books ──────────────────────────────────────────────────────────── */

  async function saveBook(book: Book): Promise<void> {
    if (!_db) return;
    await _idbPut(_tx(STORE_BOOKS, 'readwrite'), { ...book, _savedAt: Date.now() });
  }

  async function deleteBook(bookId: string): Promise<void> {
    if (!_db) return;
    await _idbDelete(_tx(STORE_BOOKS, 'readwrite'), bookId);
  }

  async function getAllBooks(): Promise<Book[]> {
    if (!_db) return [];
    return new Promise((resolve) => {
      const tx = _db!.transaction(STORE_BOOKS, 'readonly');
      const req = tx.objectStore(STORE_BOOKS).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => resolve([]);
    });
  }

  /* ── Subscriptions ───────────────────────────────────────────────────────── */

  function onChange(fn: ChangeListener): () => void {
    _listeners.push(fn);
    return () => { const i = _listeners.indexOf(fn); if (i >= 0) _listeners.splice(i, 1); };
  }

  /* ── Auto-init ───────────────────────────────────────────────────────────── */

  const _initPromise = init();

  return {
    ready: () => _initPromise,
    getActionStatus,
    setActionStatus,
    getHighlights,
    saveHighlight,
    deleteHighlight,
    importHighlights,
    getNote,
    saveNote,
    getAiResult,
    saveAiResult,
    deleteAiResult,
    saveBook,
    deleteBook,
    getAllBooks,
    onChange,
  };
})();
