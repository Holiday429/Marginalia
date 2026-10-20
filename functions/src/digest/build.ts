/* Marginalia · what goes into a weekly digest (plan 2.4). Pure: data in, content out.
   Up to three highlights that are due for another look, plus at most one action that is due.
   A week with nothing due produces no content, and so no email. */

import { actionDueAt, pickDue, pickDueAction, type ActionRow, type ResurfaceFields } from '../_shared/resurface';
import type { DigestAction, DigestContent, DigestHighlight } from './types';

const DAY_MS = 86_400_000;

export interface HighlightRow extends ResurfaceFields { id: string; quote?: string; bookId?: string }
// The due-action rule moved to shared/resurface.ts so the Today panel in the app uses the same one.
export { actionDueAt };
export type { ActionRow };

export function buildDigestContent(
  input: { highlights: readonly HighlightRow[]; actions: readonly ActionRow[]; bookTitles: ReadonlyMap<string, string>; now: number },
): DigestContent {
  const { now, bookTitles } = input;
  const highlights: DigestHighlight[] = pickDue(input.highlights.filter((h) => h.quote), now, 3).map(({ highlight, tier }) => ({
    id: highlight.id,
    quote: String(highlight.quote),
    bookId: highlight.bookId ?? '',
    bookTitle: bookTitles.get(highlight.bookId ?? '') ?? '',
    tier,
  }));

  const first = pickDueAction(input.actions, now);
  const action: DigestAction | null = first
    ? {
        id: first.id,
        text: String(first.text),
        bookId: first.bookId ?? '',
        bookTitle: bookTitles.get(first.bookId ?? '') ?? '',
        ageDays: Math.max(0, Math.floor((now - (first.createdAt ?? now)) / DAY_MS)),
      }
    : null;

  return { highlights, action };
}

export const isEmpty = (c: DigestContent) => c.highlights.length === 0 && !c.action;
