/* ==========================================================================
   Marginalia · Seed index — assembles BOOK_DETAILS from per-book seed files
   --------------------------------------------------------------------------
   Load order in index.html: all seed/{book}.js files BEFORE this file.
   To add a new book:
     1. Create src/data/seed/{book-id}.js  (exports window.__SEED_{ID})
     2. Add the script tag to index.html   (before this file)
     3. Add window.__SEED_{ID} to the array below
   ========================================================================== */

window.BOOK_DETAILS = [
  window.__SEED_SAPIENS,
  // add more seed objects here as books are authored
].filter(Boolean);

/* Lookup helper */
window.BOOK_BY_ID = Object.fromEntries(
  window.BOOK_DETAILS.map((b) => [b.id, b])
);

/* Load user-created books from IndexedDB and merge in (user books first) */
document.addEventListener('DOMContentLoaded', async () => {
  await window.NotesStore?.ready?.();
  const userBooks = await window.NotesStore?.getAllBooks?.() || [];
  if (!userBooks.length) return;

  const seedIds = new Set(window.BOOK_DETAILS.map(b => b.id));
  let added = 0;
  for (const book of userBooks) {
    if (seedIds.has(book.id)) continue; // never overwrite seed data
    window.BOOK_DETAILS.unshift(book);
    window.BOOK_BY_ID[book.id] = book;

    // Also inject into SHELF_BOOKS so the spine appears on the shelf
    if (window.SHELF_BOOKS && !window.SHELF_BOOKS.find(s => s.id === book.id)) {
      const style = window.BOOK_TYPES?.[book.bookType];
      window.SHELF_BOOKS.unshift({
        id:     book.id,
        title:  book.title,
        author: book.author || '',
        spine:  book.cover?.bg  || '#14263e',
        text:   book.cover?.text || '#e8dfc8',
        w:      32,
        h:      0.88,
        status: book.status || 'reading',
        font:   book.cover?.font   || "'Fraunces', serif",
        weight: book.cover?.weight || 400,
      });
    }
    added++;
  }

  if (added > 0) {
    window.dispatchEvent(new CustomEvent('marginalia:books-changed'));
  }
});
