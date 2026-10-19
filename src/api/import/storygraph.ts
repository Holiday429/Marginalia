/* Marginalia · StoryGraph CSV (library export) → ImportedBook (plan 2.5). Pure. */

import { parseCsv } from './csv.ts';
import { toIsoDate } from './goodreads.ts';
import { cleanIsbn } from './normalize.ts';
import type { ImportedBook, ImportedStatus, ParseResult } from './types.ts';

const STATUS: Record<string, ImportedStatus> = {
  read: 'finished',
  'currently-reading': 'reading',
  'to-read': 'want',
  'did-not-finish': 'confirmed-later',
  paused: 'confirmed-later',
};

export function looksLikeStoryGraph(headers: string[]): boolean {
  return headers.includes('read status') && (headers.includes('isbn/uid') || headers.includes('star rating'));
}

export function parseStoryGraph(text: string): ParseResult {
  const { headers, rows } = parseCsv(text);
  const warnings: string[] = [];
  if (!looksLikeStoryGraph(headers)) warnings.push('This does not look like a StoryGraph export (no "Read Status" column).');
  const books: ImportedBook[] = [];
  rows.forEach((row, i) => {
    const title = row['title'];
    if (!title) { warnings.push(`Row ${i + 2} has no title and was skipped.`); return; }
    const rating = Math.round(Number(row['star rating']));
    const status = STATUS[(row['read status'] ?? '').toLowerCase()];
    // "Last Date Read" is when it was finished; "Dates Read" can hold ranges like 2023/01/02-2023/01/20.
    const lastRead = row['last date read'] || (row['dates read'] ?? '').split(/[-,]/).pop() || '';
    books.push({
      title,
      author: (row['authors'] ?? '').split(',')[0]?.trim() ?? '',
      isbn: cleanIsbn(row['isbn/uid']) || undefined,
      status,
      rating: rating >= 1 && rating <= 5 ? rating : undefined,
      finishedOn: status === 'finished' ? toIsoDate(lastRead) : undefined,
      addedOn: toIsoDate(row['date added'] ?? ''),
      tags: (row['tags'] ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
      highlights: [],
    });
  });
  return { source: 'storygraph', books, warnings };
}
