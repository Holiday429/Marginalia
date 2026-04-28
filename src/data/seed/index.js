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
