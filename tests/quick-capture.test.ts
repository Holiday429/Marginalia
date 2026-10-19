import { describe, expect, it } from 'vitest';
import { keyboardInset, suggestBooks } from '../src/components/quick-capture/quick-capture-helpers.ts';

describe('quick capture helpers (2.1)', () => {
  it('keyboardInset is the part of the layout viewport the keyboard covers', () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
    expect(keyboardInset(844, { height: 500, offsetTop: 100 })).toBe(244); // page scrolled inside the visual viewport
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0); // never negative
  });

  const books = [
    { id: 'a', title: 'Sapiens', author: 'Yuval Noah Harari', status: 'finished' },
    { id: 'b', title: '人类简史', author: '尤瓦尔·赫拉利', status: 'reading' },
    { id: 'c', title: 'Dune', author: 'Frank Herbert', status: 'want' },
  ];

  it('suggestions match titles and authors, including Chinese, case-insensitively', () => {
    expect(suggestBooks(books, 'sap').map((b) => b.id)).toEqual(['a']);
    expect(suggestBooks(books, 'HERBERT').map((b) => b.id)).toEqual(['c']);
    expect(suggestBooks(books, '简史').map((b) => b.id)).toEqual(['b']);
    expect(suggestBooks(books, 'zzz')).toEqual([]);
  });

  it('with no query the books being read come first, and at most five are offered', () => {
    expect(suggestBooks(books, '')[0].id).toBe('b');
    const many = Array.from({ length: 9 }, (_, i) => ({ id: String(i), title: `Book ${i}`, author: '', status: 'want' }));
    expect(suggestBooks(many, '')).toHaveLength(5);
  });
});
