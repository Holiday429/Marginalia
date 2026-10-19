// Marginalia · empty book record.
// Views that need a detail record for a book that has none yet (a shelf spine whose Firestore
// doc has no notes, summary or highlights) get this blank shell — never a copy of another book.
// Panels render their own empty states for the blank arrays/strings.

export interface EmptyBookInput {
  id?: unknown;
  title?: unknown;
  author?: unknown;
  status?: unknown;
  spine?: unknown;
  text?: unknown;
  tags?: unknown;
}

export interface EmptyBook {
  id: string;
  title: string;
  titleZh: string;
  author: string;
  authorZh: string;
  status: string;
  summary: string;
  tags: string[];
  rating: null;
  cover: { bg: string; text: string; image: string };
  meta: Record<string, never>;
  highlights: never[];
  actions: never[];
}

export function createEmptyBook(input: EmptyBookInput = {}): EmptyBook {
  const title = String(input.title ?? '').trim() || 'Untitled';
  return {
    id: String(input.id ?? ''),
    title,
    titleZh: '',
    author: String(input.author ?? '').trim(),
    authorZh: '',
    status: String(input.status ?? 'want'),
    summary: '',
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    rating: null,
    cover: { bg: String(input.spine ?? '#14263e'), text: String(input.text ?? '#e8dfc8'), image: '' },
    meta: {},
    highlights: [],
    actions: [],
  };
}
