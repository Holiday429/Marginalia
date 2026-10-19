/* Marginalia · pick the right parser for what the reader chose or pasted (plan 2.5). Pure. */

import { parseCsvRows } from './csv.ts';
import { looksLikeGoodreads, parseGoodreads } from './goodreads.ts';
import { looksLikeKindle, parseKindle } from './kindle.ts';
import { looksLikeReadwise, parseReadwise } from './readwise.ts';
import { looksLikeStoryGraph, parseStoryGraph } from './storygraph.ts';
import type { ImportSource, ParseResult } from './types.ts';
import { looksLikeWeRead, parseWeRead } from './weread.ts';

export function detectSource(text: string): ImportSource | null {
  if (looksLikeKindle(text)) return 'kindle';
  if (looksLikeWeRead(text)) return 'weread';
  const first = parseCsvRows(text.slice(0, 4000))[0] ?? [];
  const headers = first.map((h) => h.trim().toLowerCase());
  if (looksLikeGoodreads(headers)) return 'goodreads';
  if (looksLikeStoryGraph(headers)) return 'storygraph';
  if (looksLikeReadwise(headers)) return 'readwise';
  return null;
}

const PARSERS: Record<ImportSource, (text: string) => ParseResult> = {
  goodreads: parseGoodreads,
  storygraph: parseStoryGraph,
  readwise: parseReadwise,
  weread: parseWeRead,
  kindle: parseKindle,
};

/** Parse with the chosen source, or detect it from the content when none is chosen. */
export function parseImport(text: string, source?: ImportSource): ParseResult {
  const chosen = source ?? detectSource(text);
  if (!chosen) return { source: 'goodreads', books: [], warnings: ['This file is not in a format Marginalia knows. Supported: Goodreads CSV, StoryGraph CSV, Readwise CSV, WeChat Read text, Kindle My Clippings.txt.'] };
  return PARSERS[chosen](text);
}
