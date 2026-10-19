/* Marginalia · resolve where books belong on the map (plan 2.6).
   For each book: the author's birth country from Wikidata (cached per author in geoCache/, shared by all
   readers) and the story's setting from an internal model call (cached per book). The model call is made by
   the server, is not counted against the reader's allowance, and every call is logged with its token counts
   (audit/ai_calls/{uid}/… with internal: true, and a console line) so phase 4 can price it.
*/

import type { Firestore } from 'firebase-admin/firestore';
import { AuditPaths, Paths } from '../_shared/paths';
import { authorCacheKey, bookCacheKey } from '../_shared/geo-keys';
import { buildSettingPrompt, parseSetting, type BookSetting, type ModelCall } from './setting';
import { lookupAuthorOrigin, type AuthorOrigin, type WikidataDeps } from './wikidata';

const DAY_MS = 86_400_000;
/** A lookup that found nothing is not repeated for a week. */
export const NOT_FOUND_RETRY_MS = 7 * DAY_MS;
export const CACHE_VERSION = 1;
export const MAX_BOOKS_PER_CALL = 25;

export interface ResolveBook { id: string; title: string; author: string }

export interface GeoPlace { country: string; city?: string }

export interface ResolvedGeo {
  bookId: string;
  authorOrigin: GeoPlace | null;
  contentLocation: GeoPlace | null;
  /** how sure the author match is */
  confidence: 'high' | 'medium' | 'low' | null;
}

export interface ResolveDeps {
  db: Firestore;
  wikidata: WikidataDeps;
  /** null when no model is configured: settings are then simply not inferred */
  model: ModelCall | null;
  now?: () => number;
}

type CachedAuthor = { v: number; found: boolean; resolvedAt: number; name: string; origin?: AuthorOrigin };
type CachedSetting = { v: number; resolvedAt: number; title: string; author: string; setting: BookSetting };

async function authorOrigin(deps: ResolveDeps, name: string): Promise<AuthorOrigin | null> {
  if (!name.trim()) return null;
  const now = deps.now?.() ?? Date.now();
  const ref = deps.db.doc(Paths.geoCache(authorCacheKey(name)));
  const hit = (await ref.get()).data() as CachedAuthor | undefined;
  if (hit && hit.v === CACHE_VERSION && (hit.found || now - hit.resolvedAt < NOT_FOUND_RETRY_MS)) return hit.found ? hit.origin ?? null : null;
  const origin = await lookupAuthorOrigin(name, deps.wikidata);
  await ref.set({ v: CACHE_VERSION, found: Boolean(origin), resolvedAt: now, name, ...(origin ? { origin } : {}) } satisfies CachedAuthor);
  return origin;
}

async function bookSetting(deps: ResolveDeps, uid: string, book: ResolveBook): Promise<BookSetting | null> {
  if (!deps.model) return null;
  const now = deps.now?.() ?? Date.now();
  const ref = deps.db.doc(Paths.geoCache(bookCacheKey(book.title, book.author)));
  const hit = (await ref.get()).data() as CachedSetting | undefined;
  if (hit && hit.v === CACHE_VERSION) return hit.setting;

  const reply = await deps.model(buildSettingPrompt(book));
  const setting = parseSetting(reply.text);
  console.info('[geo] internal ai call', JSON.stringify({ feature: 'resolve-book-geo', inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, countedAgainstQuota: false }));
  await deps.db.doc(AuditPaths.aiCall(uid, `geo-${now}-${bookCacheKey(book.title, book.author)}`)).set({
    featureId: 'resolve-book-geo', internal: true, countedAgainstQuota: false,
    inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, status: 'ok', createdAt: now,
  });
  await ref.set({ v: CACHE_VERSION, resolvedAt: now, title: book.title, author: book.author, setting } satisfies CachedSetting);
  return setting;
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next; next += 1; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function resolveBooks(deps: ResolveDeps, uid: string, books: readonly ResolveBook[]): Promise<ResolvedGeo[]> {
  const unique = new Map<string, ResolveBook>();
  books.slice(0, MAX_BOOKS_PER_CALL).forEach((b) => unique.set(b.id, b));
  const authors = new Map<string, Promise<AuthorOrigin | null>>();
  const originOf = (name: string) => {
    const key = name.normalize('NFKC').toLowerCase().trim();
    if (!authors.has(key)) authors.set(key, authorOrigin(deps, name).catch((err) => { console.warn('[geo] author lookup failed', name, err instanceof Error ? err.message : err); return null; }));
    return authors.get(key)!;
  };

  return pool([...unique.values()], 3, async (book): Promise<ResolvedGeo> => {
    const [origin, setting] = await Promise.all([
      originOf(book.author),
      bookSetting(deps, uid, book).catch((err) => { console.warn('[geo] setting failed', book.title, err instanceof Error ? err.message : err); return null; }),
    ]);
    return {
      bookId: book.id,
      authorOrigin: origin?.country ? { country: origin.country, ...(origin.birthPlace ? { city: origin.birthPlace } : {}) } : null,
      contentLocation: setting?.country ? { country: setting.country, ...(setting.city ? { city: setting.city } : {}) } : null,
      confidence: origin?.confidence ?? null,
    };
  });
}
