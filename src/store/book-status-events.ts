/* Marginalia · book status transitions
   Every place that changes a book's reading status (book detail, Library shelves, Add Book in edit
   mode) reports the change here, once the write was accepted. This is the single hook for things
   that react to "moved into finished": the book_finished analytics event (2.10) and the finish
   ritual (2.3). Creating a book already marked finished is not a transition.
*/

import { normalizeReadingStatus } from '../shared/reading-status.ts';
import { track } from '../services/events.ts';

export const BOOK_STATUS_CHANGED_EVENT = 'marginalia:book-status-changed';

export interface BookStatusChange {
  bookId: string;
  from: string;
  to: string;
}

/** Returns true when the change is a real move into "finished". */
export function notifyBookStatusChange(bookId: string, rawFrom: unknown, rawTo: unknown): boolean {
  if (!bookId || rawFrom == null || rawFrom === '') return false;
  const from = normalizeReadingStatus(rawFrom);
  const to = normalizeReadingStatus(rawTo);
  if (from === to) return false;

  window.dispatchEvent(new CustomEvent<BookStatusChange>(BOOK_STATUS_CHANGED_EVENT, { detail: { bookId, from, to } }));
  if (to !== 'finished') return false;
  track('book_finished', { bookId });
  return true;
}
