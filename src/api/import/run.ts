/* Marginalia · write an import to the signed-in reader's library (plan 2.5).
   Books go in 400 at a time (one Firestore batch each), validated and stamped like every other write;
   highlights go through HighlightsStore, which batches them and gives them their review schedule.
*/

import { doc, writeBatch } from 'firebase/firestore';
import { MarginaliaAuth } from '../../firebase/auth.ts';
import { WsPaths } from '../../firebase/paths.ts';
import { getWorkspaceId } from '../../firebase/workspace.ts';
import { BookSchema } from '../../data/schema/book.ts';
import { validateWrite, withMetaCreate } from '../../services/db.ts';
import { track } from '../../services/events.ts';
import { BooksStore } from '../../store/books-store.ts';
import { HighlightsStore } from '../../store/highlights-store.ts';
import { buildBookDoc, buildHighlightRecords, newBookId } from './build.ts';
import { planImport, type ImportPlan, type PlanEntry } from './plan.ts';
import type { ImportSource, ParseResult } from './types.ts';

export const BOOKS_IMPORTED_EVENT = 'marginalia:books-imported';
const BATCH = 400;

/** What the library holds right now, in the shape the planner needs. */
export function currentLibrary() {
  const books = (BooksStore.getAll() as Array<Record<string, any>>).map((b) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any -- loosely typed store records
    id: String(b.id), title: String(b.title ?? ''), author: String(b.author ?? ''), isbn: b.isbn ? String(b.isbn) : undefined,
  }));
  const quotes = new Map<string, Set<string>>();
  for (const h of HighlightsStore.getAll()) {
    if (!h.bookId || !h.quote) continue;
    const set = quotes.get(h.bookId) ?? new Set<string>();
    set.add(h.quote.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''));
    quotes.set(h.bookId, set);
  }
  return { books, quotes };
}

export function planFor(parsed: ParseResult): ImportPlan {
  const lib = currentLibrary();
  return planImport(parsed.books, lib.books, lib.quotes);
}

export interface ImportOutcome {
  createdBookIds: string[];
  mergedBooks: number;
  highlights: number;
}

export async function runImport(
  source: ImportSource,
  entries: readonly PlanEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportOutcome> {
  const uid = MarginaliaAuth?.user?.uid;
  const db = MarginaliaAuth?.db;
  if (!uid || !db) throw new Error('Sign in to import.');
  const now = Date.now();
  const todo = entries.filter((e) => e.action !== 'skip');
  const creates = todo.filter((e) => e.action === 'create');
  const createdBookIds: string[] = [];
  const idFor = new Map<number, string>();

  for (let i = 0; i < creates.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const entry of creates.slice(i, i + BATCH)) {
      const id = newBookId(entry.book.title, entry.index, now);
      idFor.set(entry.index, id);
      const payload = withMetaCreate(validateWrite(BookSchema, buildBookDoc(entry.book, id, now)));
      batch.set(doc(db, WsPaths.book(getWorkspaceId(), uid, id)), payload);
      createdBookIds.push(id);
    }
    await batch.commit();
    onProgress?.(Math.min(i + BATCH, creates.length), todo.length);
  }
  BooksStore.addOptimisticBooks(creates.map((e) => buildBookDoc(e.book, idFor.get(e.index)!, now) as never));

  let highlights = 0;
  let merged = 0;
  const records = todo.flatMap((e) => {
    const bookId = e.action === 'create' ? idFor.get(e.index)! : e.match!.id;
    if (e.action === 'merge' && e.newHighlights.length) merged += 1;
    return buildHighlightRecords(e.book, bookId, e.newHighlights, source, now);
  });
  if (records.length) {
    await HighlightsStore.saveMany(records);
    highlights = records.length;
  }
  onProgress?.(todo.length, todo.length);

  track('import_completed', { source, books: createdBookIds.length, highlights });
  if (highlights) track('highlight_saved', { source: 'import', bookId: null, count: highlights });
  window.dispatchEvent(new CustomEvent(BOOKS_IMPORTED_EVENT, { detail: { bookIds: createdBookIds, source } }));
  return { createdBookIds, mergedBooks: merged, highlights };
}
