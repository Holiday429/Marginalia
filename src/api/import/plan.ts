/* Marginalia · import plan (plan 2.5): what an import would do to the library, before anything is written.
   Books already in the library (same ISBN, or same title and author) are never created twice; for sources
   that carry highlights, the highlights missing from the existing book are added to it. Pure. */

import { stableHash, titleAuthorKey, identityKeys, type BookIdentity } from './normalize.ts';
import type { ImportedBook, ImportedHighlight } from './types.ts';

export interface ExistingBook extends BookIdentity { id: string }

export type PlanAction = 'create' | 'merge' | 'skip';

export interface PlanEntry {
  index: number;
  book: ImportedBook;
  action: PlanAction;
  /** the library book this one matches (merge / skip) */
  match: ExistingBook | null;
  /** highlights that are not in the library yet */
  newHighlights: ImportedHighlight[];
  duplicateHighlights: number;
}

export interface ImportPlan {
  entries: PlanEntry[];
  totals: { books: number; create: number; merge: number; skip: number; newHighlights: number; duplicateHighlights: number };
}

const squashQuote = (quote: string) => quote.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Id of an imported highlight: depends on the book's title/author and the quote only, so importing the same file again lands on the same documents. */
export function importedHighlightId(book: BookIdentity, quote: string): string {
  return `imp-${stableHash(`${titleAuthorKey(book.title, book.author ?? '')}|${squashQuote(quote)}`)}`;
}

export function planImport(
  books: readonly ImportedBook[],
  existing: readonly ExistingBook[],
  existingQuotes: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): ImportPlan {
  const byKey = new Map<string, ExistingBook>();
  for (const b of existing) for (const k of identityKeys(b)) if (!byKey.has(k)) byKey.set(k, b);
  const quotesByBook = new Map<string, Set<string>>(
    [...existingQuotes.entries()].map(([id, quotes]) => [id, new Set(quotes)]),
  );
  const entries: PlanEntry[] = [];
  const totals = { books: books.length, create: 0, merge: 0, skip: 0, newHighlights: 0, duplicateHighlights: 0 };

  books.forEach((book, index) => {
    const keys = identityKeys(book);
    const match = keys.map((k) => byKey.get(k)).find(Boolean) ?? null;
    const known = match ? (quotesByBook.get(match.id) ?? new Set<string>()) : new Set<string>();
    const seenHere = new Set<string>();
    const newHighlights: ImportedHighlight[] = [];
    let duplicates = 0;
    for (const h of book.highlights) {
      const q = squashQuote(h.quote);
      if (!q || known.has(q) || seenHere.has(q)) { duplicates += 1; continue; }
      seenHere.add(q);
      newHighlights.push(h);
    }

    let action: PlanAction;
    if (!match) {
      action = 'create';
      // A later row for the same book inside the same file is folded into the first one instead of creating a twin.
      const stand: ExistingBook = { id: `pending:${index}`, title: book.title, author: book.author, isbn: book.isbn };
      for (const k of keys) byKey.set(k, stand);
    } else if (newHighlights.length) action = 'merge';
    else action = 'skip';

    if (action === 'create') totals.create += 1;
    else if (action === 'merge') totals.merge += 1;
    else totals.skip += 1;
    totals.newHighlights += action === 'skip' ? 0 : newHighlights.length;
    totals.duplicateHighlights += duplicates;
    entries.push({ index, book, action, match, newHighlights: action === 'skip' ? [] : newHighlights, duplicateHighlights: duplicates });
  });
  return { entries, totals };
}
