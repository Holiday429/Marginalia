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

window.NotesStore = (() => {
  const DB_NAME    = 'marginalia-notes';
  const DB_VERSION = 2;
  const STORE_ACTIONS    = 'action-status';
  const STORE_HIGHLIGHTS = 'highlights';
  const STORE_NOTES      = 'book-notes';

  let _db     = null;
  let _ready  = false;
  const _listeners = [];

  /* ── Init ────────────────────────────────────────────────────────────────── */

  function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
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
      };

      req.onsuccess = (event) => {
        _db    = event.target.result;
        _ready = true;
        resolve();
      };

      req.onerror = () => {
        console.warn('[NotesStore] IndexedDB open failed — falling back to in-memory.');
        _ready = true;
        resolve();
      };
    });
  }

  /* ── Internal helpers ────────────────────────────────────────────────────── */

  function _tx(storeName, mode = 'readonly') {
    if (!_db) return null;
    try { return _db.transaction(storeName, mode).objectStore(storeName); }
    catch { return null; }
  }

  function _idbGet(store, key) {
    return new Promise((resolve) => {
      if (!store) return resolve(null);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  }

  function _idbPut(store, record) {
    return new Promise((resolve, reject) => {
      if (!store) return resolve();
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  function _idbDelete(store, key) {
    return new Promise((resolve) => {
      if (!store) return resolve();
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => resolve();
    });
  }

  function _idbGetAllByIndex(storeName, indexName, value) {
    return new Promise((resolve) => {
      const tx = _db?.transaction(storeName, 'readonly');
      if (!tx) return resolve([]);
      const index = tx.objectStore(storeName).index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => resolve([]);
    });
  }

  function _emit() {
    _listeners.forEach(fn => { try { fn(); } catch {} });
    window.dispatchEvent(new CustomEvent('marginalia:notes-changed'));
  }

  /* ── Action status ───────────────────────────────────────────────────────── */

  // In-memory fallback when IndexedDB is unavailable
  const _memActions = {};

  async function getActionStatus(bookId, actionId) {
    const key = `${bookId}::${actionId}`;
    if (_db) {
      const record = await _idbGet(_tx(STORE_ACTIONS), key);
      return record?.status ?? null;
    }
    return _memActions[key] ?? null;
  }

  async function setActionStatus(bookId, actionId, status) {
    const key = `${bookId}::${actionId}`;
    if (_db) {
      await _idbPut(_tx(STORE_ACTIONS, 'readwrite'), { key, bookId, actionId, status, updatedAt: Date.now() });
    } else {
      _memActions[key] = status;
    }
    _emit();
  }

  /* ── Highlights ──────────────────────────────────────────────────────────── */

  async function getHighlights(bookId) {
    if (!_db) return [];
    return _idbGetAllByIndex(STORE_HIGHLIGHTS, 'bookId', bookId);
  }

  async function saveHighlight(bookId, highlight) {
    const record = {
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

  async function deleteHighlight(bookId, highlightId) {
    if (_db) await _idbDelete(_tx(STORE_HIGHLIGHTS, 'readwrite'), highlightId);
    _emit();
  }

  // Batch import — used by Kindle parser; skips duplicates by id
  async function importHighlights(bookId, highlights) {
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
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    _emit();
  }

  /* ── Book notes ──────────────────────────────────────────────────────────── */

  async function getNote(bookId) {
    if (!_db) return null;
    return _idbGet(_tx(STORE_NOTES), bookId);
  }

  async function saveNote(bookId, content) {
    const record = { bookId, content, updatedAt: Date.now() };
    if (_db) {
      await _idbPut(_tx(STORE_NOTES, 'readwrite'), record);
    }
    _emit();
    return record;
  }

  /* ── Subscriptions ───────────────────────────────────────────────────────── */

  function onChange(fn) {
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
    onChange,
  };
})();
