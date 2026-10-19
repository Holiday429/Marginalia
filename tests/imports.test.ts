import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectSource, parseImport } from '../src/api/import/detect.ts';
import { parseCsvRows } from '../src/api/import/csv.ts';
import { parseGoodreads, toIsoDate } from '../src/api/import/goodreads.ts';
import { parseKindle } from '../src/api/import/kindle.ts';
import { cleanIsbn, sameBook, toIsbn13 } from '../src/api/import/normalize.ts';
import { importedHighlightId, planImport } from '../src/api/import/plan.ts';
import { parseReadwise } from '../src/api/import/readwise.ts';
import { parseStoryGraph } from '../src/api/import/storygraph.ts';
import { parseWeRead } from '../src/api/import/weread.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/imports/${name}`, import.meta.url), 'utf8');

describe('csv reader', () => {
  it('handles quotes, doubled quotes, commas and line breaks inside quotes, CRLF and a BOM', () => {
    const rows = parseCsvRows('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n,\r\nlast,row');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere'], ['last', 'row']]);
  });
});

describe('Goodreads CSV', () => {
  const r = parseGoodreads(fixture('goodreads.csv'));

  it('reads five books and skips the row without a title', () => {
    expect(r.books.map((b) => b.title)).toEqual(['Sapiens: A Brief History of Humankind', 'Dune (Dune, #1)', 'The Overstory', 'Piranesi', '红楼梦']);
    expect(r.warnings.some((w) => /no title/.test(w))).toBe(true);
  });

  it('maps shelves to statuses, ratings, ISBNs and dates', () => {
    const [sapiens, dune, overstory, piranesi, hongloumeng] = r.books;
    expect(sapiens).toMatchObject({ status: 'finished', rating: 5, isbn: '9780062316110', finishedOn: '2020-05-12', year: 2011, author: 'Yuval Noah Harari' });
    expect(sapiens.tags).toEqual(['history', 'to-reread']); // the shelf that only names the status is not a tag
    expect(dune).toMatchObject({ status: 'finished', rating: 4, isbn: '9780441172717' });
    expect(overstory).toMatchObject({ status: 'reading', rating: undefined, isbn: undefined, finishedOn: undefined });
    expect(piranesi.status).toBe('want');
    expect(hongloumeng).toMatchObject({ title: '红楼梦', author: '曹雪芹', status: 'finished' });
  });

  it('warns when the file is not a Goodreads export', () => {
    expect(parseGoodreads('a,b\n1,2').warnings[0]).toMatch(/does not look like a Goodreads/);
  });

  it('dates in the usual spellings', () => {
    expect(toIsoDate('2020/5/2')).toBe('2020-05-02');
    expect(toIsoDate('2020-05-12')).toBe('2020-05-12');
    expect(toIsoDate('')).toBeUndefined();
    expect(toIsoDate('not a date')).toBeUndefined();
  });
});

describe('StoryGraph CSV', () => {
  const r = parseStoryGraph(fixture('storygraph.csv'));
  it('maps read status, rounded stars, ISBN and the last read date', () => {
    expect(r.books).toHaveLength(4);
    expect(r.books[0]).toMatchObject({ title: 'Piranesi', status: 'finished', rating: 5, isbn: '9781635575934', finishedOn: '2021-03-10', tags: ['fantasy', 'mystery'] });
    expect(r.books[1]).toMatchObject({ status: 'reading', rating: undefined });
    expect(r.books[2]).toMatchObject({ title: 'Gone Girl', status: 'confirmed-later', rating: 2 });
    expect(r.books[3].status).toBe('want');
  });
});

describe('Readwise CSV', () => {
  const r = parseReadwise(fixture('readwise.csv'));
  it('groups highlights by book and keeps notes, pages, locations and timestamps', () => {
    expect(r.books.map((b) => [b.title, b.highlights.length])).toEqual([['Deep Work', 3], ['Piranesi', 1]]);
    const dw = r.books[0].highlights;
    expect(dw[0]).toMatchObject({ quote: 'Focus is a skill, not a gift.', page: 12 });
    expect(dw[1]).toMatchObject({ note: 'Try this on the train', page: 14 });
    expect(dw[2]).toMatchObject({ location: '120-121' });
    expect(dw[2].quote).toContain('that spans two lines'); // a line break inside a quoted field survives
    expect(dw[0].createdAt).toBeTypeOf('number');
    expect(r.warnings.some((w) => /no highlight/.test(w))).toBe(true); // the empty row
  });
});

describe('Kindle clippings', () => {
  const r = parseKindle(fixture('kindle-clippings.txt'));
  it('keeps highlights and notes, drops bookmarks, and reads page, location and date', () => {
    expect(r.books.map((b) => [b.title, b.author, b.highlights.length])).toEqual([['Deep Work', 'Cal Newport', 3], ['人类简史', '尤瓦尔·赫拉利', 1]]);
    const hl = r.books[0].highlights;
    expect(hl[0]).toMatchObject({ quote: 'Focus is a skill.', page: 12, location: '100-101' });
    expect(hl[0].createdAt).toBeTypeOf('number');
    expect(hl[2].note).toBe('Try it on the train.');
  });
});

describe('WeChat Read notes', () => {
  const r = parseWeRead(fixture('weread.txt'));

  it('finds both books with their authors', () => {
    expect(r.books.map((b) => [b.title, b.author])).toEqual([['人类简史', '尤瓦尔·赫拉利'], ['活着', '余华']]);
  });

  it('puts the chapter on each highlight and the reader\'s thought on the highlight above it', () => {
    const [first, second, standalone] = r.books[0].highlights;
    expect(first).toMatchObject({ quote: '农业革命是史上最大的骗局。', chapter: '第一部分 认知革命', note: '我觉得他说得太绝对，但很有启发。' });
    expect(second.quote).toBe('人类之所以能够统治世界，是因为能够虚构故事。\n并相信这些故事。'); // a plain line continues the highlight
    expect(second.note).toBeUndefined();
    expect(standalone).toMatchObject({ quote: '这一章让我想起了小麦的故事。', chapter: '第二部分 农业革命' }); // a thought with nothing above it
    expect(r.books[1].highlights[0]).toMatchObject({ chapter: '第一章' });
  });

  it('says so when nothing usable was pasted', () => {
    expect(parseWeRead('just some words').warnings.join(' ')).toMatch(/No notes found/);
  });
});

describe('detecting the format', () => {
  it('recognises each fixture without being told', () => {
    expect(detectSource(fixture('goodreads.csv'))).toBe('goodreads');
    expect(detectSource(fixture('storygraph.csv'))).toBe('storygraph');
    expect(detectSource(fixture('readwise.csv'))).toBe('readwise');
    expect(detectSource(fixture('kindle-clippings.txt'))).toBe('kindle');
    expect(detectSource(fixture('weread.txt'))).toBe('weread');
    expect(detectSource('hello,world\n1,2')).toBeNull();
    expect(parseImport('hello,world\n1,2').warnings[0]).toMatch(/not in a format/);
  });
});

describe('same book, different spellings', () => {
  it('matches ISBN-10 and ISBN-13, and title + author across subtitle, series tail and punctuation', () => {
    expect(toIsbn13(cleanIsbn('="0062316117"'))).toBe('9780062316110');
    expect(sameBook({ title: 'Sapiens', isbn: '0062316117' }, { title: 'Other', isbn: '978-0-06-231611-0' })).toBe(true);
    expect(sameBook({ title: 'Sapiens: A Brief History of Humankind', author: 'Yuval Noah Harari' }, { title: 'Sapiens', author: 'Harari, Yuval Noah' })).toBe(false); // last-first spelling is not guessed
    expect(sameBook({ title: 'Sapiens: A Brief History of Humankind', author: 'Yuval Noah Harari' }, { title: 'sapiens', author: 'Yuval Noah Harari' })).toBe(true);
    expect(sameBook({ title: 'Dune (Dune, #1)', author: 'Frank Herbert' }, { title: 'Dune', author: 'Frank Herbert' })).toBe(true);
    expect(sameBook({ title: '活着', author: '余华' }, { title: '《活着》', author: '余　华' })).toBe(true);
    expect(sameBook({ title: 'Dune', author: 'Frank Herbert' }, { title: 'Dune Messiah', author: 'Frank Herbert' })).toBe(false);
  });
});

describe('import plan', () => {
  const gr = parseGoodreads(fixture('goodreads.csv')).books;

  it('creates what is new, skips what the library already has, and folds duplicates inside the file', () => {
    const plan = planImport([...gr, { ...gr[0] }], [{ id: 'b-dune', title: 'Dune', author: 'Frank Herbert' }]);
    const actions = plan.entries.map((e) => e.action);
    expect(actions).toEqual(['create', 'skip', 'create', 'create', 'create', 'skip']); // Dune exists; the repeated Sapiens row folds into the first
    expect(plan.totals).toMatchObject({ books: 6, create: 4, skip: 2 });
    expect(plan.entries[1].match?.id).toBe('b-dune');
  });

  it('adds only the highlights an existing book does not have, and a second import adds nothing', () => {
    const rw = parseReadwise(fixture('readwise.csv')).books;
    const existing = [{ id: 'b1', title: 'Deep Work', author: 'Cal Newport' }];
    const known = new Map([['b1', new Set(['focusisaskillnotagift'])]]);
    const plan = planImport(rw, existing, known);
    expect(plan.entries[0]).toMatchObject({ action: 'merge', duplicateHighlights: 1 });
    expect(plan.entries[0].newHighlights).toHaveLength(2);
    expect(plan.entries[1].action).toBe('create');

    // Everything already imported (same quotes known) → nothing left to do.
    const allKnown = new Map([['b1', new Set(rw[0].highlights.map((h) => h.quote.toLowerCase().replace(/[^a-z0-9]+/g, '')))]]);
    const again = planImport([rw[0]], existing, allKnown);
    expect(again.entries[0].action).toBe('skip');
    expect(again.totals.newHighlights).toBe(0);
  });

  it('imported highlight ids do not depend on the book id or the file', () => {
    const a = importedHighlightId({ title: 'Deep Work', author: 'Cal Newport' }, 'Focus is a skill.');
    expect(importedHighlightId({ title: 'Deep Work (Hardcover)', author: 'Cal Newport' }, ' focus is a SKILL ')).toBe(a);
    expect(importedHighlightId({ title: 'Deep Work', author: 'Cal Newport' }, 'Another quote')).not.toBe(a);
  });

  it('a 200-book Goodreads file parses and plans in well under a second', () => {
    const header = 'Book Id,Title,Author,ISBN,ISBN13,My Rating,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Exclusive Shelf';
    const rows = Array.from({ length: 200 }, (_, i) => `${i},"Book number ${i}","Author ${i % 40}","=""""","=""${String(9780000000000 + i)}""",${i % 6},2000,1999,2021/01/${String((i % 28) + 1).padStart(2, '0')},2020/01/01,"shelf-${i % 7}",${['read', 'to-read', 'currently-reading'][i % 3]}`);
    const text = [header, ...rows].join('\n');
    const t0 = performance.now();
    const parsed = parseGoodreads(text);
    const plan = planImport(parsed.books, []);
    const ms = performance.now() - t0;
    expect(parsed.books).toHaveLength(200);
    expect(plan.totals.create).toBe(200);
    expect(ms).toBeLessThan(1000);
    // Importing the same file once more creates nothing.
    const existing = plan.entries.map((e, i) => ({ id: `b${i}`, title: e.book.title, author: e.book.author, isbn: e.book.isbn }));
    expect(planImport(parsed.books, existing).totals).toMatchObject({ create: 0, skip: 200 });
  });
});
