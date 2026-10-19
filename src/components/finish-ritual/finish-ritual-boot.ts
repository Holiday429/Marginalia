/* Marginalia · finish ritual: boot part (plan 2.3)
   Only listens for "a book moved into finished"; the dialog itself (finish-ritual.ts) loads when it is needed.
*/

import { BOOK_STATUS_CHANGED_EVENT, type BookStatusChange } from '../../store/book-status-events.ts';
import { logError } from '../../services/analytics.ts';

export function mountFinishRitual(): void {
  window.addEventListener(BOOK_STATUS_CHANGED_EVENT, (event) => {
    const { bookId, to } = (event as CustomEvent<BookStatusChange>).detail;
    if (to !== 'finished') return;
    import('./finish-ritual.ts')
      .then((m) => m.openFinishRitual(bookId))
      .catch((err) => logError(err, { context: 'finish ritual open', bookId }));
  });
}
