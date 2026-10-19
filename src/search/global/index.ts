/* Marginalia · cross-book search index (plan 2.7). Pure: documents in, ranked hits out; no browser APIs.
   Built on MiniSearch. Chinese, Japanese and Korean have no spaces, so they are indexed as single
   characters plus overlapping pairs; a query is split into pairs that must all be present, so a two-character
   word such as 骗局 finds the passage it is in, and does not match every passage containing 局. Latin words
   match as prefixes ("deep" finds "Deep Work"). */

import MiniSearch from 'minisearch';

export type SearchDocType = 'book' | 'highlight' | 'note' | 'action';

export interface SearchDoc {
  id: string;
  type: SearchDocType;
  /** the book this belongs to (for a book: its own id) */
  bookId: string;
  title: string;
  body: string;
  author?: string;
}

export interface SearchHit {
  key: string;
  doc: SearchDoc;
  score: number;
}

const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}_']+/gu;
const IS_CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Index-time tokens: lower-case words, and for CJK every character and every neighbouring pair. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.normalize('NFKC').matchAll(CJK_RUN)) {
    const run = m[0];
    if (IS_CJK.test(run)) {
      const chars = [...run];
      for (let i = 0; i < chars.length; i += 1) {
        out.push(chars[i]);
        if (i + 1 < chars.length) out.push(chars[i] + chars[i + 1]);
      }
    } else out.push(run.toLowerCase());
  }
  return out;
}

/** Query-time tokens: words as typed; a CJK run becomes its pairs (a lone character stays a character). */
export function queryTerms(text: string): string[] {
  const out: string[] = [];
  for (const m of text.normalize('NFKC').matchAll(CJK_RUN)) {
    const run = m[0];
    if (IS_CJK.test(run)) {
      const chars = [...run];
      if (chars.length === 1) out.push(chars[0]);
      else for (let i = 0; i + 1 < chars.length; i += 1) out.push(chars[i] + chars[i + 1]);
    } else out.push(run.toLowerCase());
  }
  return out;
}

const keyOf = (d: Pick<SearchDoc, 'type' | 'id'>) => `${d.type}:${d.id}`;

type Stored = SearchDoc & { key: string; docId: string };

export class GlobalIndex {
  private readonly mini: MiniSearch<Stored>;
  private count = 0;

  constructor(docs: readonly SearchDoc[] = []) {
    this.mini = new MiniSearch<Stored>({
      idField: 'key',
      fields: ['title', 'body', 'author'],
      storeFields: ['docId', 'type', 'bookId', 'title', 'body', 'author'],
      tokenize,
      searchOptions: { tokenize: queryTerms, combineWith: 'AND', prefix: true, boost: { title: 3, author: 2 } },
    });
    this.replaceAll(docs);
  }

  get size(): number { return this.count; }

  replaceAll(docs: readonly SearchDoc[]): void {
    this.mini.removeAll();
    this.mini.addAll(docs.map((d) => ({ ...d, key: keyOf(d), docId: d.id })));
    this.count = docs.length;
  }

  search(query: string, opts: { limit?: number; types?: readonly SearchDocType[] } = {}): SearchHit[] {
    const terms = queryTerms(query);
    if (!terms.length) return [];
    const types = opts.types ? new Set(opts.types) : null;
    const results = this.mini.search(query, types ? { filter: (r) => types.has(r.type as SearchDocType) } : undefined);
    return results.slice(0, opts.limit ?? 60).map((r) => ({
      key: r.id as string,
      score: r.score,
      doc: { id: r.docId as string, type: r.type as SearchDocType, bookId: r.bookId as string, title: r.title as string, body: r.body as string, author: r.author as string | undefined },
    }));
  }
}

/** Group hits by type, in the order the panel shows them, each capped. */
export function groupHits(hits: readonly SearchHit[], perType = 6): Array<{ type: SearchDocType; hits: SearchHit[]; total: number }> {
  const order: SearchDocType[] = ['book', 'highlight', 'note', 'action'];
  return order
    .map((type) => {
      const all = hits.filter((h) => h.doc.type === type);
      return { type, hits: all.slice(0, perType), total: all.length };
    })
    .filter((g) => g.total > 0);
}
