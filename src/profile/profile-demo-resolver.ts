/**
 * profile-demo-resolver.ts
 *
 * Single seam between seed data and the Profile view for unauthenticated visitors.
 * Do NOT import seed/profile-demo.ts from anywhere except this file.
 */

import type { PublicBook, DemoPayload } from './profile-types.ts';
import {
  DEMO_BOOKS,
  DEMO_PROFILE,
  buildDemoHighlights,
  buildDemoSessionDays,
} from '../data/seed/profile-demo.ts';

export { DEMO_PROFILE };

/** Builds a demo payload for unauthenticated visitors. */
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
