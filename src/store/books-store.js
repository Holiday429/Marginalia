/* ==========================================================================
   Marginalia · Books Store
   --------------------------------------------------------------------------
   Single source of truth for book data visible to views.
   Merges: seed data (window.BOOK_DETAILS) + Firebase user overrides.

   Views should read via BooksStore.getAll() / BooksStore.getById(id)
   and re-render on the 'marginalia:books-changed' event.

   This is the seam where mock data will be replaced by a real API call.
   ========================================================================== */

window.BooksStore = (() => {
  let _books = [];
  let _byId  = {};

  function init() {
    _rebuild();

    // Re-merge whenever Firebase overrides arrive
    window.addEventListener('marginalia:books-overrides-changed', () => {
      _rebuild();
      _emit();
    });
  }

  function _rebuild() {
    const seed = Array.isArray(window.BOOK_DETAILS) ? window.BOOK_DETAILS : [];
    _books = seed.map((b) => {
      const override = _getFirestoreOverride(b.id);
      if (!override) return b;
      // Shallow merge: cover image override is the main use-case for now
      return { ...b, cover: { ...b.cover, ...override.cover } };
    });
    _byId = Object.fromEntries(_books.map((b) => [b.id, b]));
  }

  function _getFirestoreOverride(bookId) {
    // Future: query a local cache written by firebase/db.js overrides listener.
    // For now, read directly from the mutated BOOK_BY_ID (legacy path — same behaviour
    // as before, just routed through the store).
    return window.BOOK_BY_ID?.[bookId] !== window.BOOK_DETAILS?.find(b => b.id === bookId)
      ? window.BOOK_BY_ID?.[bookId]
      : null;
  }

  function _emit() {
    window.dispatchEvent(new CustomEvent('marginalia:books-changed', {
      detail: { books: _books },
    }));
  }

  return {
    init,
    /** @returns {Book[]} all books (merged seed + overrides) */
    getAll()     { return _books; },
    /** @param {string} id @returns {Book|undefined} */
    getById(id)  { return _byId[id]; },
    /** @returns {Book[]} */
    getByStatus(status) { return _books.filter(b => b.status === status); },
    /** @returns {Book[]} */
    getByType(type) { return _books.filter(b => b.bookType === type); },
  };
})();

// Auto-init once the DOM is ready (seed data is already loaded by this point)
document.addEventListener('DOMContentLoaded', () => window.BooksStore.init());
