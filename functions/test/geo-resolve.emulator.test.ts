/* Plan 2.6 against the Firestore emulator: the cache, the internal model call and its logging.
   firebase emulators:exec --only auth,firestore "npm run test:rules" */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { resolveBooks, NOT_FOUND_RETRY_MS, type ResolveDeps } from '../src/geo/resolve';
import { authorCacheKey, bookCacheKey } from '../src/_shared/geo-keys';

const requireFromFunctions = createRequire(new URL('../package.json', import.meta.url));
const emulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const recorded = JSON.parse(readFileSync(new URL('../../tests/fixtures/wikidata-recorded.json', import.meta.url), 'utf8')) as Record<string, { status: number; body: string }>;

describe.skipIf(!emulators)('resolveBooks against the emulator', () => {
  let db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let wikidataCalls = 0;
  let modelCalls: string[] = [];
  let tick = 1_700_000_000_000;

  beforeAll(() => {
    const admin = requireFromFunctions('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-marginalia' });
    db = admin.firestore();
  });
  beforeEach(() => { wikidataCalls = 0; modelCalls = []; });

  const deps = (over: Partial<ResolveDeps> = {}): ResolveDeps => ({
    db,
    now: () => tick,
    wikidata: {
      userAgent: 'test',
      fetch: (async (url: string) => {
        wikidataCalls += 1;
        const hit = recorded[String(url)];
        if (!hit) return new Response(JSON.stringify({ search: [], entities: {} }), { status: 200 });
        return new Response(hit.body, { status: hit.status });
      }) as unknown as typeof fetch,
    },
    model: async (prompt) => { modelCalls.push(prompt); return { text: '{"country":"GB","city":"London","confidence":"high"}', inputTokens: 80, outputTokens: 20 }; },
    ...over,
  });

  const uid = () => `geo-user-${Math.random().toString(36).slice(2, 8)}`;

  it('returns author origin and story setting for each book', async () => {
    const [r] = await resolveBooks(deps(), uid(), [{ id: 'b1', title: 'Pride and Prejudice', author: 'Jane Austen' }]);
    expect(r).toMatchObject({ bookId: 'b1', authorOrigin: { country: 'GB', city: 'Steventon' }, contentLocation: { country: 'GB', city: 'London' }, confidence: 'high' });
  });

  it('caches per author for everyone: a second reader\'s lookup makes no Wikidata request', async () => {
    const book = { id: 'b1', title: 'Beloved', author: 'Toni Morrison' };
    await resolveBooks(deps(), uid(), [book]);
    const first = wikidataCalls;
    expect(first).toBeGreaterThan(0);
    wikidataCalls = 0;
    const [again] = await resolveBooks(deps(), uid(), [{ id: 'other-id', title: 'Song of Solomon', author: 'Toni Morrison' }]);
    expect(wikidataCalls).toBe(0);
    expect(again.authorOrigin?.country).toBe('US');
    expect((await db.doc(`geoCache/${authorCacheKey('Toni Morrison')}`).get()).exists).toBe(true);
  });

  it('looks an author up once per batch even when several books share them', async () => {
    const author = 'Haruki Murakami';
    await resolveBooks(deps(), uid(), [
      { id: 'a', title: 'Norwegian Wood', author }, { id: 'b', title: 'Kafka on the Shore', author }, { id: 'c', title: '1Q84', author },
    ]);
    expect(wikidataCalls).toBeLessThanOrEqual(4); // search + entities + place + country, once
  });

  it('the setting call is internal: logged with its tokens, cached per book, never charged to the reader', async () => {
    const u = uid();
    const book = { id: 'b1', title: 'Persepolis', author: 'Marjane Satrapi' };
    await resolveBooks(deps(), u, [book]);
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0]).toContain('"Persepolis" by Marjane Satrapi');
    const audit = await db.collection(`audit/ai_calls/${u}`).get();
    expect(audit.size).toBe(1);
    expect(audit.docs[0].data()).toMatchObject({ featureId: 'resolve-book-geo', internal: true, countedAgainstQuota: false, inputTokens: 80, outputTokens: 20 });
    expect((await db.doc(`usage/${u}`).get()).exists).toBe(false); // no usage counter was touched

    await resolveBooks(deps(), uid(), [book]); // another reader, same book: cached
    expect(modelCalls).toHaveLength(1);
    expect((await db.doc(`geoCache/${bookCacheKey(book.title, book.author)}`).get()).exists).toBe(true);
  });

  it('a book with no setting (nonfiction) leaves the content location empty', async () => {
    const [r] = await resolveBooks(deps({ model: async () => ({ text: '{"country":null,"city":null,"confidence":"low"}', inputTokens: 1, outputTokens: 1 }) }), uid(), [{ id: 'b1', title: 'Sapiens', author: 'Yuval Noah Harari' }]);
    expect(r.contentLocation).toBeNull();
    expect(r.authorOrigin?.country).toBe('IL');
  });

  it('without a model only the author origin is resolved', async () => {
    const [r] = await resolveBooks(deps({ model: null }), uid(), [{ id: 'b1', title: 'Dune', author: 'Frank Herbert' }]);
    expect(r).toMatchObject({ authorOrigin: { country: 'US' }, contentLocation: null });
  });

  it('an author nobody knows is cached as "not found" for a week, then tried again', async () => {
    const book = { id: 'b1', title: 'Obscure', author: 'Zzqx Nobodyson' };
    const [first] = await resolveBooks(deps(), uid(), [book]);
    expect(first.authorOrigin).toBeNull();
    const calls = wikidataCalls;
    await resolveBooks(deps(), uid(), [book]);
    expect(wikidataCalls).toBe(calls); // not looked up again
    tick += NOT_FOUND_RETRY_MS + 1000;
    await resolveBooks(deps(), uid(), [book]);
    expect(wikidataCalls).toBeGreaterThan(calls); // a week later it is
  });

  it('one failing lookup does not sink the others, and a failure is not cached', async () => {
    const flaky = deps({
      wikidata: { userAgent: 't', fetch: (async (url: string) => { if (String(url).includes('Flaky')) throw new Error('network'); const hit = recorded[String(url)]; return new Response(hit?.body ?? '{}', { status: 200 }); }) as unknown as typeof fetch },
    });
    const out = await resolveBooks(flaky, uid(), [{ id: 'a', title: 'T1', author: 'Flaky Writer' }, { id: 'b', title: 'Pride and Prejudice', author: 'Jane Austen' }]);
    expect(out[0].authorOrigin).toBeNull();
    expect(out[1].authorOrigin?.country).toBe('GB');
    expect((await db.doc(`geoCache/${authorCacheKey('Flaky Writer')}`).get()).exists).toBe(false);
  });
});
