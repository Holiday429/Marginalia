import { describe, expect, it } from 'vitest';
import { GlobalIndex, groupHits, queryTerms, tokenize, type SearchDoc } from '../src/search/global/index.ts';
import { buildSnippet } from '../src/search/global/snippet.ts';

const doc = (over: Partial<SearchDoc> & Pick<SearchDoc, 'id' | 'type'>): SearchDoc => ({ bookId: 'b1', title: '', body: '', ...over });

describe('tokenizing (2.7)', () => {
  it('Latin words are lower-cased words; Chinese becomes characters and neighbouring pairs', () => {
    expect(tokenize('Deep Work, 2nd edition')).toEqual(['deep', 'work', '2nd', 'edition']);
    expect(tokenize('骗局')).toEqual(['骗', '骗局', '局']);
    expect(tokenize('农业革命')).toEqual(['农', '农业', '业', '业革', '革', '革命', '命']);
  });

  it('a query becomes pairs (all required), a lone character stays a character', () => {
    expect(queryTerms('骗局')).toEqual(['骗局']);
    expect(queryTerms('农业革命')).toEqual(['农业', '业革', '革命']);
    expect(queryTerms('局')).toEqual(['局']);
    expect(queryTerms('Deep 工作')).toEqual(['deep', '工作']);
    expect(queryTerms('  ')).toEqual([]);
  });
});

describe('searching', () => {
  const docs: SearchDoc[] = [
    doc({ id: 'b1', type: 'book', title: '人类简史', author: '尤瓦尔·赫拉利' }),
    doc({ id: 'b2', type: 'book', title: 'Deep Work', author: 'Cal Newport', bookId: 'b2' }),
    doc({ id: 'h1', type: 'highlight', body: '农业革命是历史上最大的骗局。小麦并没有让人类的生活变得更好。' }),
    doc({ id: 'h2', type: 'highlight', body: '这家饭局很热闹，大家都在讲故事。' }),
    doc({ id: 'h3', type: 'highlight', bookId: 'b2', body: 'Focus is a skill, not a gift. Boredom is trainable.' }),
    doc({ id: 'n1', type: 'note', bookId: 'b2', body: 'Reading context: on the train, early morning.' }),
    doc({ id: 'a1', type: 'action', bookId: 'b2', body: 'Block two hours a day for deep work' }),
  ];
  const index = new GlobalIndex(docs);

  it('finds a two-character Chinese word that appears only in a highlight\'s text', () => {
    const hits = index.search('骗局');
    expect(hits.map((h) => h.doc.id)).toEqual(['h1']); // not h2, which only shares the character 局
    expect(hits[0].doc.type).toBe('highlight');
  });

  it('a single character matches every passage with it', () => {
    expect(index.search('局').map((h) => h.doc.id).sort()).toEqual(['h1', 'h2']);
  });

  it('Latin queries match by prefix, across types, case-insensitively, with title matches first', () => {
    const hits = index.search('DEEP');
    expect(hits.map((h) => h.doc.id)).toContain('b2');
    expect(hits.map((h) => h.doc.id)).toContain('a1');
    expect(hits[0].doc.id).toBe('b2'); // the book's title outranks an action mentioning it
    expect(index.search('boredo').map((h) => h.doc.id)).toEqual(['h3']);
  });

  it('every word of the query must match', () => {
    expect(index.search('deep newport').map((h) => h.doc.id)).toEqual(['b2']);
    expect(index.search('deep zebra')).toEqual([]);
  });

  it('can be limited to some types, and empty queries find nothing', () => {
    expect(index.search('deep', { types: ['action'] }).map((h) => h.doc.id)).toEqual(['a1']);
    expect(index.search('')).toEqual([]);
  });

  it('groups hits by type with a cap and keeps the total', () => {
    const many = new GlobalIndex(Array.from({ length: 9 }, (_, i) => doc({ id: `x${i}`, type: 'highlight', body: `common phrase number ${i}` })));
    const groups = groupHits(many.search('common'), 4);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ type: 'highlight', total: 9 });
    expect(groups[0].hits).toHaveLength(4);
  });

  it('replacing the documents replaces the results', () => {
    const idx = new GlobalIndex([doc({ id: 'o', type: 'note', body: 'old words' })]);
    idx.replaceAll([doc({ id: 'n', type: 'note', body: 'new words' })]);
    expect(idx.search('old')).toEqual([]);
    expect(idx.search('new').map((h) => h.doc.id)).toEqual(['n']);
  });
});

describe('snippets', () => {
  it('marks the matches, escapes everything else, and trims long text around the first match', () => {
    expect(buildSnippet('农业革命是历史上最大的骗局。', '骗局')).toBe('农业革命是历史上最大的<mark>骗局</mark>。');
    expect(buildSnippet('Focus <b>is</b> a skill', 'skill')).toBe('Focus &lt;b&gt;is&lt;/b&gt; a <mark>skill</mark>');
    const long = `${'x '.repeat(100)}needle${' y'.repeat(100)}`;
    const out = buildSnippet(long, 'needle', 30);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toContain('<mark>needle</mark>');
    expect(out.length).toBeLessThan(200);
  });

  it('marks the pairs when the Chinese run does not occur whole', () => {
    expect(buildSnippet('革命之后是农业', '农业革命')).toContain('<mark>农业</mark>');
  });
});

describe('speed with a big library (2.7)', () => {
  it('2,000 highlights: the index builds in under a second and one query takes under 50 ms', () => {
    const words = ['农业', '革命', '历史', '认知', '故事', 'attention', 'focus', 'habit', 'system', 'culture', 'memory', 'deep', 'reading', '时间', '世界'];
    const make = (i: number) => {
      const pick = (k: number) => words[(i * 7 + k * 3) % words.length];
      return `${pick(1)} ${pick(2)} ${i} ${pick(3)}，这是第${i}条高亮：${pick(4)} and ${pick(5)} ${'more words to make the passage longer '.repeat(3)}`;
    };
    const docs: SearchDoc[] = Array.from({ length: 2000 }, (_, i) => doc({ id: `h${i}`, type: 'highlight', bookId: `b${i % 100}`, body: make(i) }));
    docs.push(doc({ id: 'needle', type: 'highlight', body: '这是唯一包含骗局二字的高亮。' }));

    const t0 = performance.now();
    const index = new GlobalIndex(docs);
    const buildMs = performance.now() - t0;

    const timings: number[] = [];
    for (const q of ['骗局', 'attention', 'focus habit', '农业革命', 'memor']) {
      const t = performance.now();
      index.search(q);
      timings.push(performance.now() - t);
    }
    const hits = index.search('骗局');
    expect(hits.map((h) => h.doc.id)).toEqual(['needle']);
    expect(index.size).toBe(2001);
    // Recorded for the phase report.
    process.stdout.write(`global search: built ${index.size} docs in ${buildMs.toFixed(0)} ms; slowest of 5 queries ${Math.max(...timings).toFixed(1)} ms\n`);
    expect(buildMs).toBeLessThan(1000);
    expect(Math.max(...timings)).toBeLessThan(50);
  });
});
