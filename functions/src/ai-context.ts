/* Marginalia · AI prompt context loader.
   Reads the signed-in user's own data with the admin SDK and applies the hard caps from
   PROMPT_LIMITS before anything reaches a prompt. */

import { PROMPT_LIMITS, type BookCtx, type LibraryCtx, type PromptCtx } from './_shared/ai-prompts';
import { WsPaths } from './_shared/paths';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- Firestore docs are schemaless

/** The slice of the admin Firestore the loader needs. */
export interface ContextDb {
  doc(path: string): { get(): Promise<{ exists: boolean; data(): Json | undefined }> };
  collection(path: string): ContextQuery;
}
interface ContextQuery {
  where(field: string, op: '==', value: unknown): ContextQuery;
  limit(n: number): ContextQuery;
  get(): Promise<{ docs: Array<{ id: string; data(): Json }> }>;
}

export class ContextError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const clip = (v: unknown, max: number): string => String(v ?? '').slice(0, max);

function pickBook(id: string, data: Json): BookCtx {
  const meta = data.meta ?? {};
  return {
    title: clip(data.title ?? meta.title ?? id, 300),
    author: clip(data.author ?? meta.author ?? '', 300),
    year: data.year ?? meta.year,
    bookType: clip(data.bookType ?? '', 40) || undefined,
    summary: clip(data.summary ?? meta.summary ?? '', PROMPT_LIMITS.fieldChars) || undefined,
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 20).map((t: unknown) => clip(t, 60)) : undefined,
    insight: data.insight ? { integration: clip(data.insight.integration, PROMPT_LIMITS.fieldChars), oneLiner: clip(data.insight.oneLiner, 500) } : undefined,
  };
}

export async function loadBookContext(db: ContextDb, ws: string, uid: string, bookId: string): Promise<PromptCtx> {
  const bookSnap = await db.doc(WsPaths.book(ws, uid, bookId)).get();
  if (!bookSnap.exists) throw new ContextError(404, 'Book not found');
  const book = pickBook(bookId, bookSnap.data() ?? {});

  const [hl, actions, note, mindmap] = await Promise.all([
    db.collection(WsPaths.highlights(ws, uid)).where('bookId', '==', bookId).limit(PROMPT_LIMITS.highlights).get(),
    db.collection(WsPaths.actions(ws, uid)).where('bookId', '==', bookId).limit(PROMPT_LIMITS.actions).get(),
    db.doc(WsPaths.bookNote(ws, uid, bookId)).get(),
    db.doc(WsPaths.aiResult(ws, uid, 'mindmap-gen')).get(),
  ]);

  book.highlights = hl.docs.map((d) => {
    const h = d.data();
    return { quote: clip(h.quote, PROMPT_LIMITS.quoteChars), page: h.page ?? undefined, kind: h.kind ?? undefined };
  });
  book.actions = actions.docs.map((d) => ({ text: clip(d.data().text, 300) }));
  const mm = mindmap.exists ? (mindmap.data()?.userEdited ?? mindmap.data()?.original) : undefined;
  if (mm?.timeline) book.mindmap = { timeline: mm.timeline };

  return {
    book,
    library: {},
    notes: note.exists ? clip(note.data()?.content, PROMPT_LIMITS.notesChars) : undefined,
  };
}

function rhythmNote(sessions: Json[]): string {
  const days = new Set<string>();
  let totalMs = 0;
  const buckets: Record<string, number> = {};
  for (const s of sessions) {
    const start = Number(s.startedAt);
    if (!Number.isFinite(start)) continue;
    const d = new Date(start);
    days.add(d.toISOString().slice(0, 10));
    totalMs += Number(s.durationMs) || 0;
    const h = d.getUTCHours();
    const b = h < 6 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'late-night';
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  if (!sessions.length) return '';
  const peak = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'evening';
  const avg = Math.round(totalMs / 60000 / sessions.length);
  return `${sessions.length} sessions · ${days.size} active days · ~${avg} min/session · peak: ${peak}`;
}

export async function loadLibraryContext(db: ContextDb, ws: string, uid: string): Promise<PromptCtx> {
  const [books, highlights, sessions] = await Promise.all([
    db.collection(WsPaths.books(ws, uid)).limit(PROMPT_LIMITS.libraryBooks).get(),
    db.collection(WsPaths.highlights(ws, uid)).limit(PROMPT_LIMITS.librarySample).get(),
    db.collection(WsPaths.sessions(ws, uid)).limit(500).get(),
  ]);

  const library: LibraryCtx = {
    books: books.docs.map((d) => {
      const data = d.data();
      const meta = data.meta ?? {};
      return {
        title: clip(data.title ?? meta.title ?? d.id, 300),
        author: clip(data.author ?? meta.author ?? '', 300),
        genre: clip(data.genre ?? meta.genre ?? '', 60) || undefined,
        language: clip(data.language ?? meta.language ?? '', 20) || undefined,
        year: data.year ?? meta.year,
      };
    }),
    highlightSample: highlights.docs.map((d) => ({ quote: clip(d.data().quote, PROMPT_LIMITS.quoteChars) })),
    rhythmNote: rhythmNote(sessions.docs.map((d) => d.data())),
  };
  return { book: { title: '', author: '' }, library };
}
