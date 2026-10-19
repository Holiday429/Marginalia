/* Marginalia · Kindle "My Clippings.txt" → ImportedBook (plan 2.5). Pure; the per-book importer in
   src/api/kindle-import.ts uses the same raw parser. */

import type { ImportedBook, ImportedHighlight, ParseResult } from './types.ts';

export interface KindleClipping {
  quote: string;
  page: number | null;
  location: string | null;
  kind: 'note' | 'bookmark' | 'highlight';
  source: 'kindle';
  addedAt?: number;
}

export interface KindleBookEntry { title: string; author: string; clippings: KindleClipping[] }

const SEPARATOR = '==========';

export function parseTitleLine(line: string): { title: string; author: string } {
  // Format: "Title (Author Name)" or "Title - Author Name"
  const parenMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) return { title: parenMatch[1].trim(), author: parenMatch[2].trim() };
  const dashMatch = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) return { title: dashMatch[1].trim(), author: dashMatch[2].trim() };
  return { title: line.trim(), author: '' };
}

export function parseMetaLine(line: string): { page: number | null; location: string | null; kind: KindleClipping['kind']; addedAt?: number } {
  const pageMatch = line.match(/page\s+(\d+)/i);
  const locMatch = line.match(/location\s+([\d-]+)/i);
  const dateMatch = line.match(/Added on\s+(.+)$/i);
  const added = dateMatch ? Date.parse(dateMatch[1]) : NaN;
  return {
    page: pageMatch ? parseInt(pageMatch[1], 10) : null,
    location: locMatch ? locMatch[1] : null,
    kind: /your note/i.test(line) ? 'note' : /your bookmark/i.test(line) ? 'bookmark' : 'highlight',
    ...(Number.isNaN(added) ? {} : { addedAt: added }),
  };
}

export function parseClippingsRaw(text: string): Map<string, KindleBookEntry> {
  const entries = text.replace(/^﻿/, '').split(SEPARATOR).map((s) => s.trim()).filter(Boolean);
  const books = new Map<string, KindleBookEntry>();
  for (const entry of entries) {
    const lines = entry.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const quote = lines.slice(2).join(' ').trim();
    if (!quote) continue;
    const { title, author } = parseTitleLine(lines[0]);
    const { page, location, kind, addedAt } = parseMetaLine(lines[1]);
    const clipping: KindleClipping = { quote, page, location, kind, source: 'kindle', ...(addedAt ? { addedAt } : {}) };
    if (!books.has(title)) books.set(title, { title, author, clippings: [] });
    books.get(title)!.clippings.push(clipping);
  }
  return books;
}

export function looksLikeKindle(text: string): boolean {
  return text.includes(SEPARATOR) && /your (highlight|note|bookmark)/i.test(text);
}

export function parseKindle(text: string): ParseResult {
  const raw = parseClippingsRaw(text);
  const warnings: string[] = [];
  if (!raw.size) warnings.push('No clippings found. Use the "My Clippings.txt" file from your Kindle.');
  const books: ImportedBook[] = [];
  for (const entry of raw.values()) {
    const highlights: ImportedHighlight[] = entry.clippings
      .filter((c) => c.kind !== 'bookmark')
      .map((c) => ({
        quote: c.quote,
        ...(c.page ? { page: c.page } : {}),
        ...(c.location ? { location: c.location } : {}),
        ...(c.addedAt ? { createdAt: c.addedAt } : {}),
        // Kindle notes are the reader's own words; they stay a separate highlight of kind "note".
        ...(c.kind === 'note' ? { note: c.quote } : {}),
      }));
    books.push({ title: entry.title, author: entry.author, highlights });
  }
  return { source: 'kindle', books, warnings };
}
