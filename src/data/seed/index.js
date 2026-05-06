/* ==========================================================================
   Marginalia · Seed index — assembles BOOK_DETAILS from per-book seed files
   --------------------------------------------------------------------------
   To add a new book:
     1. Create src/data/seed/{book-id}.js  (exports the seed object)
     2. Import it below and add to the BOOK_DETAILS array
   ========================================================================== */

import { __SEED_SAPIENS } from './sapiens.js';

export const BOOK_DETAILS = window.BOOK_DETAILS = [
  __SEED_SAPIENS,
  // add more seed objects here as books are authored
].filter(Boolean);

/* Lookup helper */
export const BOOK_BY_ID = window.BOOK_BY_ID = Object.fromEntries(
  window.BOOK_DETAILS.map((b) => [b.id, b])
);

export const SEED_BOOK_DETAILS = BOOK_DETAILS;
export const SEED_BOOK_BY_ID = BOOK_BY_ID;

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
