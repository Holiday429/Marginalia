/* Marginalia · automatic map placement (plan 2.6)
   Books without an author origin are sent to the resolveBookGeo function (Wikidata + an internal model
   call) and the answer is written onto the book as "pending": the map shows it at once, the reader
   confirms or changes it with one click. A place the reader set themselves is never replaced.
   Runs after an import, after Add Book, and in the background when the Map opens.
*/

import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../firebase/config.ts';
import { MarginaliaAuth } from '../firebase/auth.ts';
import { MarginaliaBooksCloud } from '../firebase/db.ts';
import { BookSchema } from '../data/schema/book.ts';
import { validateWrite } from '../services/db.ts';
import { logError } from '../services/analytics.ts';
import { BooksStore } from '../store/books-store.ts';
import { BOOKS_IMPORTED_EVENT } from '../api/import/events.ts';
import { needsAutoPlacement, placementPatch, type BookLike, type ResolverResult } from './geo-helpers.ts';

export const GEO_RESOLVED_EVENT = 'marginalia:geo-resolved';
const CHUNK = 25;
const attempted = new Set<string>(); // per page load: do not ask again for a book that came back empty

type Row = BookLike & { id: string };
const asRow = (b: unknown) => b as Row;

/** Resolve and store places for the given books (default: every book that still needs one). */
export async function resolveGeoFor(bookIds?: string[]): Promise<number> {
  if (!MarginaliaAuth?.user || !firebaseFunctions) return 0;
  const pool = (BooksStore.getAll() as unknown[]).map(asRow);
  const wanted = bookIds ? new Set(bookIds) : null;
  const todo = pool.filter((b) => (!wanted || wanted.has(b.id)) && !attempted.has(b.id) && needsAutoPlacement(b));
  if (!todo.length) return 0;

  let placed = 0;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    chunk.forEach((b) => attempted.add(b.id));
    try {
      const call = httpsCallable<{ books: Array<{ id: string; title: string; author: string }> }, { results: ResolverResult[] }>(firebaseFunctions, 'resolveBookGeo');
      const { data } = await call({ books: chunk.map((b) => ({ id: b.id, title: String(b.title), author: String(b.author) })) });
      for (const result of data.results) {
        const book = pool.find((b) => b.id === result.bookId);
        const patch = book ? placementPatch(book, result) : null;
        if (!book || !patch) continue;
        validateWrite(BookSchema, patch);
        await MarginaliaBooksCloud.updateBook({ bookId: book.id, patch });
        const stored = BooksStore.getById(book.id);
        if (stored) BooksStore.addOptimisticBook({ ...stored, ...patch } as never);
        placed += 1;
      }
    } catch (err) {
      logError(err, { context: 'resolveGeoFor' });
    }
  }
  if (placed) window.dispatchEvent(new CustomEvent(GEO_RESOLVED_EVENT, { detail: { placed } }));
  return placed;
}

/** The reader agrees with the automatic place. */
export async function confirmGeo(bookId: string): Promise<void> {
  await MarginaliaBooksCloud.updateBook({ bookId, patch: { geoStatus: 'confirmed' } });
  const stored = BooksStore.getById(bookId);
  if (stored) BooksStore.addOptimisticBook({ ...stored, geoStatus: 'confirmed' } as never);
}

export function pendingGeoBookIds(): string[] {
  return (BooksStore.getAll() as unknown[]).map(asRow).filter((b) => b.geoStatus === 'pending').map((b) => b.id);
}

let started = false;
/** Listen for imports. Call once at startup. */
export function startGeoResolver(): void {
  if (started) return;
  started = true;
  window.addEventListener(BOOKS_IMPORTED_EVENT, (event) => {
    const ids = (event as CustomEvent<{ bookIds?: string[] }>).detail?.bookIds ?? [];
    if (ids.length) void resolveGeoFor(ids);
  });
}
