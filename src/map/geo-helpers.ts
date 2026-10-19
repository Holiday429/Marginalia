/* Marginalia · automatic map placement: pure helpers (plan 2.6). */

export interface GeoPlace { country: string; city?: string | null; province?: string | null }
export interface BookGeoBlock {
  authorOrigin?: GeoPlace | null;
  contentLocation?: GeoPlace | null;
  readerLocation?: GeoPlace | null;
}
export interface BookLike { id?: string; geo?: BookGeoBlock | null; location?: { country?: string } | null; geoStatus?: string; title?: string; author?: string }

/** The map shows "You read most from…" only once this many books are placed; fewer is noise. */
export const MIN_LOCATED_FOR_INSIGHT = 10;

/** A book is placed when any of its places names a country. */
export function isLocated(book: BookLike): boolean {
  const g = book.geo;
  return Boolean(g?.authorOrigin?.country || g?.contentLocation?.country || g?.readerLocation?.country || book.location?.country);
}

export function locatedCount(books: readonly BookLike[]): number {
  return books.filter(isLocated).length;
}

/** Books worth sending to the resolver: no author origin of their own and nothing confirmed by the reader. */
export function needsAutoPlacement(book: BookLike): boolean {
  return Boolean(book.id && book.title && book.author) && !book.geo?.authorOrigin?.country && book.geoStatus !== 'confirmed';
}

export interface ResolverResult {
  bookId: string;
  authorOrigin: { country: string; city?: string } | null;
  contentLocation: { country: string; city?: string } | null;
}

/**
 * What to write for a result. A place the reader already set is never replaced; the book is marked
 * "pending" only when something was actually filled in. Returns null when there is nothing to write.
 */
export function placementPatch(book: BookLike, result: ResolverResult): { geo: BookGeoBlock; geoStatus: 'pending' } | null {
  const geo: BookGeoBlock = { ...(book.geo ?? {}) };
  let filled = false;
  if (!geo.authorOrigin?.country && result.authorOrigin) { geo.authorOrigin = result.authorOrigin; filled = true; }
  if (!geo.contentLocation?.country && result.contentLocation) { geo.contentLocation = result.contentLocation; filled = true; }
  if (!filled) return null;
  if (geo.readerLocation === undefined) geo.readerLocation = null;
  return { geo, geoStatus: 'pending' };
}

/** "JP" → "Japan". Falls back to the code. */
export function regionName(code: string | null | undefined): string {
  if (!code) return '';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

export function insightText(located: number, topRegions: readonly string[]): string {
  if (located < MIN_LOCATED_FOR_INSIGHT) {
    const missing = MIN_LOCATED_FOR_INSIGHT - located;
    return `Place ${missing} more ${missing === 1 ? 'book' : 'books'} on the map to see where you read most.`;
  }
  return topRegions.length ? `You read most from ${topRegions.join(' & ')}.` : 'Your reading map is just beginning.';
}
