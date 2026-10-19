/* Marginalia · turn an imported book into a book document and highlight records (plan 2.5). Pure. */

import { SPINE_COLORS } from '../../shared/spine-colors.ts';
import { BOOK_TYPES } from '../../data/schema/book-types.ts';
import { importedHighlightId } from './plan.ts';
import { stableHash } from './normalize.ts';
import type { ImportedBook, ImportedHighlight, ImportSource } from './types.ts';

const isCJK = (s: string) => /[一-鿿぀-ヿ]/.test(s);

function textOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.45 ? '#1a1714' : '#e8dfc8';
}

export function newBookId(title: string, index: number, now: number): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'book';
  return `book-${slug}-${now.toString(36)}${index.toString(36)}`;
}

/** The document written for an imported book: the same shape Add Book writes. */
export function buildBookDoc(b: ImportedBook, id: string, now: number): Record<string, unknown> {
  const type = BOOK_TYPES.nonfiction;
  const color = SPINE_COLORS[parseInt(stableHash(`${b.title}|${b.author}`), 36) % SPINE_COLORS.length].hex;
  return {
    id,
    title: b.title,
    author: b.author,
    ...(b.isbn ? { isbn: b.isbn } : {}),
    status: b.status ?? 'confirmed-later',
    tags: b.tags ?? [],
    language: isCJK(b.title) ? 'zh' : 'en',
    bookType: 'nonfiction',
    panels: type.defaultPanels,
    aiFeatures: type.defaultAiFeatures,
    year: b.year ?? new Date(now).getFullYear(),
    summary: '',
    ...(b.rating ? { rating: b.rating } : {}),
    cover: { bg: color, text: textOn(color), font: "'Fraunces', serif", weight: 500 },
    location: null,
    externalLink: null,
    geo: null,
    meta: {
      startedAt: b.addedOn ?? new Date(now).toISOString().slice(0, 10),
      ...(b.finishedOn ? { finishedAt: b.finishedOn } : {}),
    },
    highlights: [],
    actions: [],
  };
}

/** Highlight documents for one book. The note goes in `annotation`, the field the book page shows as the reader's comment. */
export function buildHighlightRecords(
  book: ImportedBook,
  bookId: string,
  highlights: readonly ImportedHighlight[],
  source: ImportSource,
  now: number,
): Array<Record<string, unknown> & { id: string }> {
  const dest = source === 'kindle' || source === 'readwise' || source === 'weread' ? source : 'manual';
  return highlights.map((h, i) => ({
    id: importedHighlightId(book, h.quote),
    bookId,
    quote: h.quote,
    source: dest,
    ...(h.chapter ? { chapter: h.chapter } : {}),
    ...(h.page ? { page: h.page } : {}),
    ...(h.location ? { location: h.location } : {}),
    ...(h.note ? { annotation: h.note } : {}),
    // Source timestamp when it has one; otherwise now, offset so the order in the file is kept.
    createdAt: h.createdAt ?? now + i,
    updatedAt: now,
  }));
}
