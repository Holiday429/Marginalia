// Measures how often the Wikidata lookup (functions/src/geo/wikidata.ts) finds the right birth country for
// the 30 books in tests/fixtures/geo-books.json. Makes REAL requests to wikidata.org.
//   node --experimental-strip-types --no-warnings scripts/measure-geo-accuracy.mjs [--record]
// --record writes every response to tests/fixtures/wikidata-recorded.json, which the unit test replays
// offline (so CI never needs the network).
import { readFileSync, writeFileSync } from 'node:fs';
import { lookupAuthorOrigin } from '../functions/src/geo/wikidata.ts';

const books = JSON.parse(readFileSync(new URL('../tests/fixtures/geo-books.json', import.meta.url), 'utf8')).books;
const record = process.argv.includes('--record');
const recorded = {};

// Keep only what the lookup reads, so the recording stays small enough to commit.
const KEEP = new Set(['P31', 'P106', 'P19', 'P27', 'P17', 'P297']);
function trim(text) {
  try {
    const json = JSON.parse(text);
    if (!json.entities) return text;
    for (const e of Object.values(json.entities)) {
      const claims = {};
      for (const [prop, list] of Object.entries(e.claims ?? {})) {
        if (!KEEP.has(prop)) continue;
        claims[prop] = list.map((c) => ({
          rank: c.rank,
          mainsnak: { datavalue: { value: c.mainsnak?.datavalue?.value } },
          ...(c.qualifiers?.P582 ? { qualifiers: { P582: true } } : {}),
        }));
      }
      e.claims = claims;
      if (e.sitelinks) e.sitelinks = Object.fromEntries(Object.keys(e.sitelinks).map((k) => [k, 1]));
      for (const key of ['aliases', 'lastrevid', 'modified', 'pageid', 'ns', 'title', 'type', 'datatype']) delete e[key];
    }
    return JSON.stringify(json);
  } catch { return text; }
}

const recordingFetch = async (url, init) => {
  const res = await fetch(url, init);
  const text = await res.text();
  if (record) recorded[url] = { status: res.status, body: trim(text) };
  return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } });
};

let ok = 0;
const rows = [];
for (const b of books) {
  let got = null;
  let error = '';
  try {
    got = await lookupAuthorOrigin(b.author, { fetch: recordingFetch, userAgent: 'MarginaliaGeoTest/0.1 (holiday.x429@gmail.com)' });
  } catch (e) { error = String(e.message ?? e); }
  const good = got?.country === b.authorOrigin;
  if (good) ok += 1;
  rows.push(`${good ? 'OK  ' : 'MISS'} ${b.language} ${b.author.padEnd(24)} expected ${b.authorOrigin} got ${got?.country ?? 'none'} (${got?.label ?? error}; ${got?.birthPlace ?? '-'}; ${got?.confidence ?? '-'})`);
}
process.stdout.write(`${rows.join('\n')}\n`);
process.stdout.write(`\naccuracy ${ok}/${books.length} = ${(100 * ok / books.length).toFixed(1)}%\n`);
if (record) { writeFileSync(new URL('../tests/fixtures/wikidata-recorded.json', import.meta.url), JSON.stringify(recorded)); process.stdout.write(`recorded ${Object.keys(recorded).length} responses\n`); }
