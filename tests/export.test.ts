// Unit tests for the export assembler — no Firebase emulator needed.
// Injects mock store data via window.M and asserts the output shape.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { assemblePayload, buildMarkdown } from '../src/api/export.ts';

// analytics.ts uses posthog/sentry which aren't available in vitest — stub it.
vi.mock('../src/services/analytics.ts', () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
}));

const MOCK_BOOKS = [
  {
    id: 'sapiens',
    title: 'Sapiens',
    author: 'Yuval Noah Harari',
    status: 'finished',
    rating: 4,
    meta: { startedAt: '2024-09-14', finishedAt: '2024-10-08' },
  },
  {
    id: 'thinking-fast',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    status: 'reading',
    rating: null,
    meta: { startedAt: '2024-11-01' },
  },
];

const MOCK_HIGHLIGHTS = [
  {
    id: 'h1',
    bookId: 'sapiens',
    quote: 'History began when humans invented gods.',
    page: 27,
    chapter: 'Chapter 2',
    kind: 'concept',
    source: 'manual',
  },
  {
    id: 'h2',
    bookId: 'sapiens',
    quote: 'Money is the most universal story ever told.',
    page: 179,
    chapter: null,
    kind: 'highlight',
    source: 'manual',
  },
  {
    id: 'h3',
    bookId: 'thinking-fast',
    quote: 'Nothing in life is as important as you think it is while you are thinking about it.',
    page: 402,
    chapter: null,
    kind: null,
    source: 'kindle',
  },
];

function injectMockStores() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = {
    M: {
      store: {
        BooksStore: { getAll: () => MOCK_BOOKS },
        HighlightsStore: { getAll: () => MOCK_HIGHLIGHTS },
      },
    },
  };
}

beforeEach(() => {
  injectMockStores();
});

describe('assemblePayload', () => {
  it('returns version 1 with exportedAt timestamp', () => {
    const payload = assemblePayload();
    expect(payload.version).toBe(1);
    expect(typeof payload.exportedAt).toBe('string');
    expect(new Date(payload.exportedAt).getFullYear()).toBeGreaterThanOrEqual(2024);
  });

  it('includes all books', () => {
    const payload = assemblePayload();
    expect(payload.books).toHaveLength(2);
    expect(payload.books[0].id).toBe('sapiens');
    expect(payload.books[1].id).toBe('thinking-fast');
  });

  it('maps book fields correctly', () => {
    const payload = assemblePayload();
    const sapiens = payload.books[0];
    expect(sapiens.title).toBe('Sapiens');
    expect(sapiens.author).toBe('Yuval Noah Harari');
    expect(sapiens.status).toBe('finished');
    expect(sapiens.rating).toBe(4);
    expect(sapiens.startedAt).toBe('2024-09-14');
    expect(sapiens.finishedAt).toBe('2024-10-08');
  });

  it('attaches highlights to the correct book', () => {
    const payload = assemblePayload();
    const sapiens = payload.books.find((b) => b.id === 'sapiens')!;
    const fast = payload.books.find((b) => b.id === 'thinking-fast')!;
    expect(sapiens.highlights).toHaveLength(2);
    expect(fast.highlights).toHaveLength(1);
    expect(sapiens.highlights[0].quote).toBe('History began when humans invented gods.');
    expect(fast.highlights[0].source).toBe('kindle');
  });

  it('books with no highlights get an empty array', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.M.store.HighlightsStore.getAll = () => [];
    const payload = assemblePayload();
    for (const book of payload.books) {
      expect(book.highlights).toEqual([]);
    }
  });

  it('handles missing stores gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};
    const payload = assemblePayload();
    expect(payload.books).toEqual([]);
    expect(payload.version).toBe(1);
  });

  it('produces valid JSON when stringified', () => {
    const payload = assemblePayload();
    const json = JSON.stringify(payload, null, 2);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.books).toHaveLength(2);
  });
});

describe('buildMarkdown', () => {
  it('contains one ## section per book', () => {
    const payload = assemblePayload();
    const md = buildMarkdown(payload);
    const h2s = md.match(/^## /gm);
    expect(h2s).toHaveLength(2);
  });

  it('renders highlights as blockquotes', () => {
    const payload = assemblePayload();
    const md = buildMarkdown(payload);
    const blockquotes = md.match(/^> /gm);
    // 2 sapiens highlights + 1 thinking-fast = 3 quote lines (plus possible meta lines)
    expect(blockquotes!.length).toBeGreaterThanOrEqual(3);
  });

  it('includes book title in heading', () => {
    const payload = assemblePayload();
    const md = buildMarkdown(payload);
    expect(md).toContain('## Sapiens');
    expect(md).toContain('## Thinking, Fast and Slow');
  });

  it('includes author and status metadata', () => {
    const payload = assemblePayload();
    const md = buildMarkdown(payload);
    expect(md).toContain('Yuval Noah Harari');
    expect(md).toContain('finished');
  });

  it('separates books with horizontal rules', () => {
    const payload = assemblePayload();
    const md = buildMarkdown(payload);
    const hrs = md.match(/^---$/gm);
    expect(hrs!.length).toBeGreaterThanOrEqual(2);
  });
});
