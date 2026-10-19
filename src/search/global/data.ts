/* Marginalia · what the global search indexes (plan 2.7): the reader's books, highlights (with their own
   comments), notes and actions; for a signed-out visitor, the demo library. Read through the stores, never
   straight from Firestore. */

import { DEMO_HIGHLIGHTS } from '../../data/demo/index.ts';
import { ActionsStore } from '../../store/actions-store.ts';
import { BooksStore } from '../../store/books-store.ts';
import { HighlightsStore } from '../../store/highlights-store.ts';
import { NotesStore } from '../../store/notes-store.ts';
import type { SearchDoc } from './index.ts';

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- store records are loosely typed

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export async function collectSearchDocs(): Promise<SearchDoc[]> {
  const docs: SearchDoc[] = [];
  const books = BooksStore.getAll() as Loose[];
  const titleOf = new Map<string, string>();

  for (const b of books) {
    const title = [b.title, b.titleZh].filter(Boolean).join(' ');
    titleOf.set(String(b.id), String(b.titleZh || b.title || ''));
    docs.push({
      id: String(b.id), type: 'book', bookId: String(b.id), title,
      author: [b.author, b.authorZh].filter(Boolean).join(' '),
      body: [Array.isArray(b.tags) ? b.tags.join(' ') : '', b.summary ?? ''].join(' ').trim(),
    });
  }

  if (HighlightsStore.getUid()) {
    for (const h of HighlightsStore.getAll() as Loose[]) {
      if (!h.quote) continue;
      docs.push({
        id: String(h.id), type: 'highlight', bookId: String(h.bookId ?? ''),
        title: titleOf.get(String(h.bookId)) ?? '',
        body: [h.quote, h.annotation, h.chapter].filter(Boolean).join(' '),
      });
    }
  } else {
    // Signed out: the demo highlights, plus anything typed on this device.
    DEMO_HIGHLIGHTS.forEach((h, i) => docs.push({ id: `demo-${i}`, type: 'highlight', bookId: h.bookId, title: h.bookTitle, body: h.quote }));
    for (const b of books) {
      for (const h of ((await NotesStore.getHighlights(String(b.id))) as unknown as Loose[])) {
        if (h.quote) docs.push({ id: String(h.id), type: 'highlight', bookId: String(b.id), title: titleOf.get(String(b.id)) ?? '', body: [h.quote, h.annotation].filter(Boolean).join(' ') });
      }
    }
  }

  for (const b of books) {
    const note = await NotesStore.getNote(String(b.id));
    const text = note?.content ? stripHtml(String(note.content)) : '';
    if (text) docs.push({ id: String(b.id), type: 'note', bookId: String(b.id), title: titleOf.get(String(b.id)) ?? '', body: text });
  }

  for (const a of ActionsStore.getAll() as Loose[]) {
    if (a.text) docs.push({ id: String(a.id), type: 'action', bookId: String(a.bookId ?? ''), title: titleOf.get(String(a.bookId)) ?? '', body: String(a.text) });
  }
  return docs;
}
