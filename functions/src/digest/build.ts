/* Marginalia · what goes into a weekly digest (plan 2.4). Pure: data in, content out.
   Up to three highlights that are due for another look, plus at most one action that is due.
   A week with nothing due produces no content, and so no email. */

import { pickDue, type ResurfaceFields } from '../_shared/resurface';
import type { DigestAction, DigestContent, DigestHighlight } from './types';

const DAY_MS = 86_400_000;

export interface HighlightRow extends ResurfaceFields { id: string; quote?: string; bookId?: string }
export interface ActionRow {
  id: string;
  text?: string;
  bookId?: string;
  status?: string;
  createdAt?: number;
  remind7At?: number;
  remind30At?: number;
  remind90At?: number;
  lastDigestAt?: number;
}

/** An action is due once any of its 7 / 30 / 90 day marks has passed; done and archived ones never are. */
export function actionDueAt(a: ActionRow, now: number): number | null {
  if (a.status !== 'open' && a.status !== 'snoozed') return null;
  const marks = [a.remind7At, a.remind30At, a.remind90At].filter((t): t is number => typeof t === 'number' && t <= now);
  return marks.length ? Math.max(...marks) : null;
}

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

  // The action shown least recently goes first, so the same one does not appear every week.
  const due = input.actions
    .map((a) => ({ a, at: actionDueAt(a, now) }))
    .filter((x): x is { a: ActionRow; at: number } => x.at !== null && Boolean(x.a.text))
    .sort((x, y) => (x.a.lastDigestAt ?? 0) - (y.a.lastDigestAt ?? 0) || x.at - y.at);
  const first = due[0];
  const action: DigestAction | null = first
    ? {
        id: first.a.id,
        text: String(first.a.text),
        bookId: first.a.bookId ?? '',
        bookTitle: bookTitles.get(first.a.bookId ?? '') ?? '',
        ageDays: Math.max(0, Math.floor((now - (first.a.createdAt ?? now)) / DAY_MS)),
      }
    : null;

  return { highlights, action };
}

export const isEmpty = (c: DigestContent) => c.highlights.length === 0 && !c.action;
