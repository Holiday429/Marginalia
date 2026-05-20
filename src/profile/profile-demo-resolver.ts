/**
 * profile-demo-resolver.ts
 *
 * Single seam between mock seed data and real Firestore data for the Profile view.
 * When migrating to fully real data:
 *   1. Replace the imports from ../data/seed/profile-demo with real data fetchers.
 *   2. Update resolveDemoMerge() to return realBooks unchanged (or remove the call site).
 *   3. Update buildDemoPayloadFromBooks() to source highlights / sessionDays from Firestore.
 *
 * Do NOT import seed/profile-demo.ts from anywhere except this file.
 */

import type { PublicBook, PublicHighlight, SessionDay, DemoPayload } from './profile-types.ts';
import {
  DEMO_BOOKS,
  DEMO_PROFILE,
  DEMO_SEED_THRESHOLD,
  buildDemoHighlights,
  buildDemoSessionDays,
} from '../data/seed/profile-demo.ts';

/**
 * Returns realBooks merged with demo books when the real count is below threshold.
 * At or above threshold, real books are returned unchanged.
 */
export function resolveDemoMerge(realBooks: PublicBook[]): PublicBook[] {
  if (realBooks.length >= DEMO_SEED_THRESHOLD) return realBooks;
  const realIds = new Set(realBooks.map((b) => b.id));
  return [...realBooks, ...DEMO_BOOKS.filter((b) => !realIds.has(b.id))];
}

/**
 * Builds a complete demo payload for unauthenticated visitors or first-time owners.
 * sourceBooks comes from the local BooksStore (already mapped to PublicBook); pass an
 * empty array for a pure-seed payload.
 */
export function buildDemoPayloadFromBooks(sourceBooks: PublicBook[]): DemoPayload {
  const ids = new Set(sourceBooks.map((book) => book.id));
  const books = [...sourceBooks, ...DEMO_BOOKS.filter((book) => !ids.has(book.id))];
  return {
    profile: DEMO_PROFILE,
    books,
    highlights: buildDemoHighlights(),
    sessionDays: buildDemoSessionDays(books),
  };
}

/** Re-export so callers only depend on this resolver. */
export { DEMO_PROFILE, DEMO_SEED_THRESHOLD };
export { buildDemoHighlights, buildDemoSessionDays };
