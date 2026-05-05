// Marginalia · Export API
// Assembles user library data from stores and returns a downloadable Blob.
// Sessions and actions are omitted until their stores exist (noted: no SessionsStore in P1).

import { logEvent } from '../services/analytics.ts';

export interface ExportHighlight {
  id: string;
  bookId: string;
  quote: string;
  page?: number | null;
  chapter?: string | null;
  kind?: string | null;
  source?: string;
  createdAt?: number;
}

export interface ExportBook {
  id: string;
  title: string;
  author: string;
  status?: string;
  rating?: number | null;
  startedAt?: string;
  finishedAt?: string;
  highlights: ExportHighlight[];
}

export interface ExportPayload {
  exportedAt: string;
  version: 1;
  books: ExportBook[];
}

function getStores(): {
  books: { id: string; [k: string]: unknown }[];
  highlights: { id: string; bookId: string; quote: string; [k: string]: unknown }[];
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const books: { id: string; [k: string]: unknown }[] = w.M?.store?.BooksStore?.getAll?.() ?? [];
  const highlights: { id: string; bookId: string; quote: string; [k: string]: unknown }[] =
    w.M?.store?.HighlightsStore?.getAll?.() ?? [];
  return { books, highlights };
}

function assemblePayload(): ExportPayload {
  const { books, highlights } = getStores();

  const highlightsByBook = new Map<string, ExportHighlight[]>();
  for (const h of highlights) {
    if (!h.bookId || !h.quote) continue;
    const list = highlightsByBook.get(h.bookId) ?? [];
    list.push({
      id: h.id,
      bookId: h.bookId,
      quote: h.quote,
      page: (h.page as number | null | undefined) ?? null,
      chapter: (h.chapter as string | null | undefined) ?? null,
      kind: (h.kind as string | null | undefined) ?? null,
      source: (h.source as string | undefined) ?? 'manual',
      createdAt: h.createdAt as number | undefined,
    });
    highlightsByBook.set(h.bookId, list);
  }

  const exportBooks: ExportBook[] = books.map((b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = (b as any).meta ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = (b as any).user ?? {};
    return {
      id: b.id,
      title: (b.title as string) || (meta.title as string) || b.id,
      author: (b.author as string) || (meta.author as string) || '',
      status: (b.status as string) || (user.status as string) || undefined,
      rating: Number.isFinite(b.rating) ? (b.rating as number) : null,
      startedAt: (meta.startedAt as string) || undefined,
      finishedAt: (meta.finishedAt as string) || undefined,
      highlights: highlightsByBook.get(b.id) ?? [],
    };
  });

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    books: exportBooks,
  };
}

function esc(str: string): string {
  return str.replace(/[\\`*_[\]<>&]/g, (c) => `\\${c}`);
}

function buildMarkdown(payload: ExportPayload): string {
  const lines: string[] = [
    `# Marginalia Export`,
    ``,
    `Exported: ${payload.exportedAt}`,
    ``,
  ];

  for (const book of payload.books) {
    lines.push(`## ${esc(book.title)}`);
    lines.push(``);
    lines.push(`**Author:** ${esc(book.author || 'Unknown')}`);
    if (book.status) lines.push(`**Status:** ${esc(book.status)}`);
    if (book.rating != null) lines.push(`**Rating:** ${book.rating}/5`);
    if (book.startedAt) lines.push(`**Started:** ${esc(book.startedAt)}`);
    if (book.finishedAt) lines.push(`**Finished:** ${esc(book.finishedAt)}`);
    lines.push(``);

    if (book.highlights.length) {
      lines.push(`### Highlights`);
      lines.push(``);
      for (const h of book.highlights) {
        const meta = [
          h.page != null ? `p. ${h.page}` : null,
          h.chapter ? h.chapter : null,
        ].filter(Boolean).join(' · ');
        lines.push(`> ${esc(h.quote)}`);
        if (meta) lines.push(`> *${esc(meta)}*`);
        lines.push(``);
      }
    }

    lines.push(`---`);
    lines.push(``);
  }

  return lines.join('\n');
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportJSON(): Blob {
  const payload = assemblePayload();
  logEvent('export_triggered', { format: 'json' });
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export function exportMarkdown(): Blob {
  const payload = assemblePayload();
  logEvent('export_triggered', { format: 'markdown' });
  return new Blob([buildMarkdown(payload)], { type: 'text/markdown' });
}

// Exported for unit tests only — not part of the public surface.
export { assemblePayload, buildMarkdown };
