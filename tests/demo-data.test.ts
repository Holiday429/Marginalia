import { existsSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { DEMO_BOOKS, DEMO_HIGHLIGHTS, demoCounts, getDemoBook, buildDemoSessionDays } from '../src/data/demo/index.ts';
import { asset } from '../src/core/asset.ts';
import { createEmptyBook } from '../src/data/schema/empty-book.ts';

describe('demo library (the one source of demo numbers)', () => {
  it('has unique ids, all demo-prefixed so signed-in code can recognise them', () => {
    const ids = DEMO_BOOKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => String(id).startsWith('__demo_'))).toBe(true);
  });

  it('counts add up and include a book being read', () => {
    const c = demoCounts();
    expect(c.finished + c.reading + c.want).toBe(c.total);
    expect(c.total).toBe(DEMO_BOOKS.length);
    expect(c.reading).toBeGreaterThan(0);
  });

  it('every cover image exists in public/covers under an ASCII filename', () => {
    const covered = DEMO_BOOKS.map((b) => b.cover?.image).filter(Boolean) as string[];
    expect(covered.length).toBeGreaterThan(10);
    for (const url of covered) {
      const file = url.replace(/^.*covers\//, '');
      expect(file, url).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(existsSync(`public/covers/${file}`), `public/covers/${file}`).toBe(true);
    }
    expect(readdirSync('public/covers').every((f) => /^[A-Za-z0-9._-]+$/.test(f))).toBe(true);
  });

  it('asset() applies the Vite base once and tolerates a leading slash', () => {
    expect(asset('/covers/a.jpg')).toBe(asset('covers/a.jpg'));
    expect(asset('covers/a.jpg').endsWith('/covers/a.jpg')).toBe(true);
  });

  it('highlights belong to demo books and sessions derive from the same list', () => {
    expect(DEMO_HIGHLIGHTS.length).toBeGreaterThan(0);
    expect(DEMO_HIGHLIGHTS.every((h) => getDemoBook(h.bookId))).toBe(true);
    const days = buildDemoSessionDays(DEMO_BOOKS.map((b) => ({ status: String(b.status), finishedAt: b.finishedAt as number | undefined })));
    expect(days.length).toBeGreaterThan(0);
  });
});

describe('createEmptyBook', () => {
  it('is a blank shell, never a copy of another book', () => {
    const b = createEmptyBook({ id: 'x', title: 'Mine', author: 'Me', status: 'reading' });
    expect(b).toMatchObject({ id: 'x', title: 'Mine', author: 'Me', status: 'reading', summary: '', highlights: [], actions: [], tags: [] });
    expect(JSON.stringify(b)).not.toMatch(/sapiens/i);
    expect(createEmptyBook().title).toBe('Untitled');
  });
});
