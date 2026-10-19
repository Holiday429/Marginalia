/* Marginalia · Readwise CSV (highlights export) → ImportedBook with highlights (plan 2.5). Pure. */

import { parseCsv } from './csv.ts';
import type { ImportedBook, ImportedHighlight, ParseResult } from './types.ts';

export function looksLikeReadwise(headers: string[]): boolean {
  return headers.includes('highlight') && headers.includes('book title');
}

export function parseReadwise(text: string): ParseResult {
  const { headers, rows } = parseCsv(text);
  const warnings: string[] = [];
  if (!looksLikeReadwise(headers)) warnings.push('This does not look like a Readwise export (no "Highlight" and "Book Title" columns).');
  const byBook = new Map<string, ImportedBook>();
  rows.forEach((row, i) => {
    const quote = row['highlight'];
    const title = row['book title'];
    if (!quote || !title) { warnings.push(`Row ${i + 2} has no highlight or no book title and was skipped.`); return; }
    const author = row['book author'] ?? '';
    const key = `${title}\u0000${author}`;
    let book = byBook.get(key);
    if (!book) { book = { title, author, highlights: [] }; byBook.set(key, book); }
    const location = row['location'] || undefined;
    const type = (row['location type'] ?? '').toLowerCase();
    const page = type === 'page' ? Number(location) : NaN;
    const at = Date.parse(row['highlighted at'] ?? '');
    const h: ImportedHighlight = {
      quote,
      ...(row['note'] ? { note: row['note'] } : {}),
      ...(Number.isFinite(page) ? { page } : location ? { location } : {}),
      ...(Number.isNaN(at) ? {} : { createdAt: at }),
    };
    book.highlights.push(h);
  });
  return { source: 'readwise', books: [...byBook.values()], warnings };
}
