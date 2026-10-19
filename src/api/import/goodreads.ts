/* Marginalia · Goodreads CSV (library export) → ImportedBook (plan 2.5). Pure. */

import { parseCsv } from './csv.ts';
import { cleanIsbn } from './normalize.ts';
import type { ImportedBook, ImportedStatus, ParseResult } from './types.ts';

const STATUS: Record<string, ImportedStatus> = { read: 'finished', 'currently-reading': 'reading', 'to-read': 'want' };
const SHELF_NOISE = new Set(['read', 'to-read', 'currently-reading']);

/** "2020/05/12", "2020-05-12" or "May 12, 2020" → YYYY-MM-DD; anything else → undefined. */
export function toIsoDate(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(s);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

export function looksLikeGoodreads(headers: string[]): boolean {
  return headers.includes('book id') && headers.includes('exclusive shelf');
}

export function parseGoodreads(text: string): ParseResult {
  const { headers, rows } = parseCsv(text);
  const warnings: string[] = [];
  if (!looksLikeGoodreads(headers)) warnings.push('This does not look like a Goodreads library export (no "Book Id" and "Exclusive Shelf" columns).');
  const books: ImportedBook[] = [];
  rows.forEach((row, i) => {
    const title = row['title'];
    if (!title) { warnings.push(`Row ${i + 2} has no title and was skipped.`); return; }
    const rating = Number(row['my rating']);
    const status = STATUS[(row['exclusive shelf'] ?? '').toLowerCase()];
    const year = Number(row['original publication year'] || row['year published']);
    const shelves = (row['bookshelves'] ?? '').split(',').map((s) => s.trim()).filter((s) => s && !SHELF_NOISE.has(s.toLowerCase()));
    books.push({
      title,
      author: row['author'] ?? '',
      isbn: cleanIsbn(row['isbn13']) || cleanIsbn(row['isbn']) || undefined,
      status,
      rating: rating >= 1 && rating <= 5 ? rating : undefined,
      finishedOn: status === 'finished' ? toIsoDate(row['date read'] ?? '') : undefined,
      addedOn: toIsoDate(row['date added'] ?? ''),
      year: Number.isFinite(year) && year > 0 ? year : undefined,
      tags: shelves,
      highlights: [],
    });
  });
  return { source: 'goodreads', books, warnings };
}
