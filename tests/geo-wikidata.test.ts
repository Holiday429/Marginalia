import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lookupAuthorOrigin, type WikidataDeps } from '../functions/src/geo/wikidata';

// Plan 2.6: the Wikidata lookup finds the author's birth country for at least 80% of a 30-book list
// (15 Chinese, 15 English). The responses were recorded from the real wikidata.org with
// `node --experimental-strip-types scripts/measure-geo-accuracy.mjs --record`, so this runs offline.
// If the client's requests change, a request is missing from the recording and the test says so: re-record.

const books = JSON.parse(readFileSync(new URL('./fixtures/geo-books.json', import.meta.url), 'utf8')).books as Array<{ title: string; author: string; language: string; authorOrigin: string }>;
const recorded = JSON.parse(readFileSync(new URL('./fixtures/wikidata-recorded.json', import.meta.url), 'utf8')) as Record<string, { status: number; body: string }>;

const replay: WikidataDeps = {
  userAgent: 'test',
  fetch: (async (url: string) => {
    const hit = recorded[String(url)];
    if (!hit) throw new Error(`not in the recording (re-record with scripts/measure-geo-accuracy.mjs --record): ${url}`);
    return new Response(hit.body, { status: hit.status });
  }) as unknown as typeof fetch,
};

describe('author origin from Wikidata (replayed real responses)', () => {
  it('finds the birth country for at least 80% of 30 books, in both languages', async () => {
    const results = [];
    for (const b of books) results.push({ b, got: await lookupAuthorOrigin(b.author, replay) });
    const rate = (lang: string) => {
      const sel = results.filter((r) => r.b.language === lang);
      return sel.filter((r) => r.got?.country === r.b.authorOrigin).length / sel.length;
    };
    const overall = results.filter((r) => r.got?.country === r.b.authorOrigin).length / results.length;
    const misses = results.filter((r) => r.got?.country !== r.b.authorOrigin).map((r) => `${r.b.author}: ${r.got?.country ?? 'none'} (wanted ${r.b.authorOrigin})`);
    expect(misses).toEqual([]);
    expect(overall).toBeGreaterThanOrEqual(0.8);
    expect(rate('zh')).toBeGreaterThanOrEqual(0.8);
    expect(rate('en')).toBeGreaterThanOrEqual(0.8);
    expect(books.filter((b) => b.language === 'zh')).toHaveLength(15);
    expect(books.filter((b) => b.language === 'en')).toHaveLength(15);
  });

  it('keeps the birthplace and citizenship, and says how sure it is', async () => {
    const orwell = await lookupAuthorOrigin('George Orwell', replay);
    expect(orwell).toMatchObject({ country: 'IN', birthPlace: 'Motihari', confidence: 'high' });
    expect(orwell?.citizenship).toContain('GB'); // born in India, a British citizen: origin is the birth country
  });

  it('returns null for a name nobody has, instead of guessing', async () => {
    const empty: WikidataDeps = { userAgent: 't', fetch: (async () => new Response(JSON.stringify({ search: [] }), { status: 200 })) as unknown as typeof fetch };
    expect(await lookupAuthorOrigin('Zzzz Qqqq', empty)).toBeNull();
  });

  it('does not take a person who is not a writer just because the name matches', async () => {
    const fake: WikidataDeps = {
      userAgent: 't',
      fetch: (async (url: string) => {
        const u = String(url);
        if (u.includes('wbsearchentities')) return new Response(JSON.stringify({ search: [{ id: 'Q1' }] }), { status: 200 });
        return new Response(JSON.stringify({ entities: { Q1: { id: 'Q1', labels: { en: { value: 'Alex Smith' } }, descriptions: { en: { value: 'footballer' } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }], P106: [{ mainsnak: { datavalue: { value: { id: 'Q937857' } } } }], P27: [{ mainsnak: { datavalue: { value: { id: 'Q145' } } } }] } } } }), { status: 200 });
      }) as unknown as typeof fetch,
    };
    const r = await lookupAuthorOrigin('Alex Smith', fake);
    expect(r?.confidence).not.toBe('high'); // exact name but not a writer: low or medium, never "high"
  });
});
