/* ==========================================================================
   Marginalia · Seed index — assembles BOOK_DETAILS from per-book seed files
   --------------------------------------------------------------------------
   To add a new book:
     1. Create src/data/seed/{book-id}.js  (exports the seed object)
     2. Import it below and add to the BOOK_DETAILS array
   ========================================================================== */

import { __SEED_SAPIENS } from './sapiens.js';
import { BOOK_TYPES } from '../schema/book-types.js';
import { NotesStore } from '../../store/notes-store.ts';
import { BOOKS as SHELF_BOOKS } from '../mock/seed-spines.js';

export const BOOK_DETAILS = [
  __SEED_SAPIENS,
  // add more seed objects here as books are authored
].filter(Boolean);

/* Lookup helper */
export const BOOK_BY_ID = Object.fromEntries(
  BOOK_DETAILS.map((b) => [b.id, b])
);

export const SEED_BOOK_DETAILS = BOOK_DETAILS;
export const SEED_BOOK_BY_ID = BOOK_BY_ID;

/* Load user-created books from IndexedDB and merge in (user books first) */
document.addEventListener('DOMContentLoaded', async () => {
  await NotesStore?.ready?.();
  const userBooks = await NotesStore?.getAllBooks?.() || [];
  if (!userBooks.length) return;

  const seedIds = new Set(BOOK_DETAILS.map(b => b.id));
  let added = 0;
  for (const book of userBooks) {
    if (seedIds.has(book.id)) continue; // never overwrite seed data
    BOOK_DETAILS.unshift(book);
    BOOK_BY_ID[book.id] = book;

    // Also inject into SHELF_BOOKS so the spine appears on the shelf
    if (SHELF_BOOKS && !SHELF_BOOKS.find(s => s.id === book.id)) {
      const style = BOOK_TYPES?.[book.bookType];
      SHELF_BOOKS.unshift({
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
