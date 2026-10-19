/* Marginalia · resurface store (plan 2.4)
   What is due to look at again, and what answering does. The schedule logic is shared with the weekly
   email (shared/resurface.ts); this file only reads the reader's highlights and writes the answer.
   The four answers: still holds, add a thought, turn into an action, stop reminding.
*/

import { applyResponse, pickDue, type ResurfaceFields, type ResurfaceRating, type ResurfaceTier } from '../../shared/resurface.ts';
import { ActionsStore } from './actions-store.ts';
import { BooksStore } from './books-store.ts';
import { HighlightsStore, type HighlightRecord } from './highlights-store.ts';
import { track } from '../services/events.ts';

export interface DueHighlight {
  id: string;
  quote: string;
  bookId: string;
  bookTitle: string;
  tier: ResurfaceTier;
}

/** Up to three highlights due today for the signed-in reader (empty when signed out). */
function due(limit = 3, now = Date.now()): DueHighlight[] {
  if (!HighlightsStore.getUid()) return [];
  return pickDue(HighlightsStore.getAll() as Array<HighlightRecord & ResurfaceFields>, now, limit).map(({ highlight, tier }) => {
    const book = BooksStore.getById(highlight.bookId) as { title?: string; titleZh?: string } | undefined;
    return {
      id: highlight.id,
      quote: highlight.quote,
      bookId: highlight.bookId,
      bookTitle: book?.titleZh || book?.title || '',
      tier,
    };
  });
}

/** Record an answer. `thought` is the sentence added for the "add a thought" answer. */
async function respond(highlightId: string, tier: ResurfaceTier, rating: ResurfaceRating, thought = ''): Promise<void> {
  const highlight = HighlightsStore.getAll().find((h) => h.id === highlightId) as (HighlightRecord & ResurfaceFields & { annotation?: string }) | undefined;
  if (!highlight) throw new Error('Highlight not found.');
  const now = Date.now();
  const patch: Record<string, unknown> = { ...applyResponse(highlight, tier, rating, now) };

  if (rating === 'thought' && thought.trim()) {
    const previous = String(highlight.annotation ?? '').trim();
    patch.annotation = previous ? `${previous}\n${thought.trim()}` : thought.trim();
  }
  if (rating === 'action') {
    await ActionsStore.add(highlight.bookId, highlight.quote.slice(0, 400));
  }
  await HighlightsStore.save({ ...highlight, ...patch, updatedAt: now }, { explicitResurface: true });
  track('resurface_responded', { rating, tier, via: 'app' });
}

export const ResurfaceStore = { due, respond };
