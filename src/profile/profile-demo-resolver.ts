/**
 * profile-demo-resolver.ts
 *
 * Single seam between the demo library and the Profile view for signed-out visitors.
 * The books come from BooksStore (which holds the one demo library from src/data/demo
 * when signed out), so every page shows the same numbers.
 */

import type { PublicBook, DemoPayload } from './profile-types.ts';
import { DEMO_PROFILE, DEMO_HIGHLIGHTS, buildDemoSessionDays } from '../data/demo/index.ts';

export { DEMO_PROFILE };

/** Builds a demo payload for unauthenticated visitors from the visible demo books. */
export function buildDemoPayloadFromBooks(books: PublicBook[]): DemoPayload {
  return {
    profile: DEMO_PROFILE,
    books,
    highlights: DEMO_HIGHLIGHTS,
    sessionDays: buildDemoSessionDays(books.map((b) => ({ status: b.status === 'read' ? 'finished' : b.status, finishedAt: b.finishedAt }))),
  };
}
