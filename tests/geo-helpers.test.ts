import { describe, expect, it } from 'vitest';
import { MIN_LOCATED_FOR_INSIGHT, insightText, isLocated, locatedCount, needsAutoPlacement, placementPatch, regionName } from '../src/map/geo-helpers.ts';
import { parseSetting, buildSettingPrompt } from '../functions/src/geo/setting';
import { reverseGeocode, roundCoordinate } from '../functions/src/geo/reverse-geocode';
import { authorCacheKey, bookCacheKey } from '../shared/geo-keys.ts';

describe('automatic placement (2.6)', () => {
  const result = { bookId: 'b1', authorOrigin: { country: 'JP', city: 'Kyoto' }, contentLocation: { country: 'FR' } };

  it('only books without an author origin and not confirmed are sent', () => {
    expect(needsAutoPlacement({ id: 'a', title: 'T', author: 'A' })).toBe(true);
    expect(needsAutoPlacement({ id: 'a', title: 'T', author: 'A', geo: { authorOrigin: { country: 'US' } } })).toBe(false);
    expect(needsAutoPlacement({ id: 'a', title: 'T', author: 'A', geoStatus: 'confirmed' })).toBe(false);
    expect(needsAutoPlacement({ id: 'a', title: 'T', author: '' })).toBe(false); // nothing to look up
  });

  it('fills what is missing, marks the book pending, and never replaces a place the reader set', () => {
    expect(placementPatch({ id: 'b1' }, result)).toEqual({
      geo: { authorOrigin: { country: 'JP', city: 'Kyoto' }, contentLocation: { country: 'FR' }, readerLocation: null },
      geoStatus: 'pending',
    });
    const mine = placementPatch({ id: 'b1', geo: { authorOrigin: { country: 'US' } } }, result)!;
    expect(mine.geo.authorOrigin).toEqual({ country: 'US' }); // the reader's own place stays
    expect(mine.geo.contentLocation).toEqual({ country: 'FR' });
    expect(placementPatch({ id: 'b1', geo: { authorOrigin: { country: 'US' }, contentLocation: { country: 'US' } } }, result)).toBeNull(); // nothing to add
    expect(placementPatch({ id: 'b1' }, { bookId: 'b1', authorOrigin: null, contentLocation: null })).toBeNull();
  });

  it('counts placed books and gates the insight at ten', () => {
    const placed = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, geo: { authorOrigin: { country: 'CN' } } }));
    expect(isLocated({ location: { country: 'US' } })).toBe(true);
    expect(isLocated({})).toBe(false);
    expect(locatedCount([...placed(3), {}, {}])).toBe(3);
    expect(MIN_LOCATED_FOR_INSIGHT).toBe(10);
    expect(insightText(9, ['Asia'])).toBe('Place 1 more book on the map to see where you read most.');
    expect(insightText(4, ['Asia'])).toBe('Place 6 more books on the map to see where you read most.');
    expect(insightText(10, ['Asia', 'Europe'])).toBe('You read most from Asia & Europe.');
  });

  it('region names read as English, falling back to the code', () => {
    expect(regionName('JP')).toBe('Japan');
    expect(regionName(null)).toBe('');
  });
});

describe('story setting reply', () => {
  it('accepts a valid answer and drops everything else', () => {
    expect(parseSetting('{"country":"fr","city":"Paris","confidence":"high"}')).toEqual({ country: 'FR', city: 'Paris', confidence: 'high' });
    expect(parseSetting('```json\n{"country":"JP","city":null,"confidence":"medium"}\n```')).toEqual({ country: 'JP', city: null, confidence: 'medium' });
    expect(parseSetting('{"country":"France"}')).toEqual({ country: null, city: null, confidence: 'low' }); // not an ISO code
    expect(parseSetting('{"country":null,"city":"Paris","confidence":"high"}')).toMatchObject({ country: null, city: null }); // a city without a country is not used
    expect(parseSetting('not json')).toEqual({ country: null, city: null, confidence: 'low' });
  });

  it('the prompt names the book and tells the model not to guess', () => {
    const p = buildSettingPrompt({ title: 'Dune', author: 'Frank Herbert' });
    expect(p).toContain('"Dune" by Frank Herbert');
    expect(p).toMatch(/Never guess/);
  });
});

describe('where I read', () => {
  it('coordinates are cut to two decimals before the lookup, and nothing else is returned', async () => {
    let asked = '';
    const fake = (async (url: string) => {
      asked = String(url);
      return new Response(JSON.stringify({ address: { town: 'Cascais', country_code: 'pt', road: 'Rua Secreta 12' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const place = await reverseGeocode(38.722345678, -9.139312345, { fetch: fake, userAgent: 'test' });
    expect(asked).toContain('lat=38.72');
    expect(asked).toContain('lon=-9.14');
    expect(asked).not.toContain('38.722');
    expect(place).toEqual({ country: 'PT', city: 'Cascais' }); // the street never leaves the function
    expect(roundCoordinate(1.005)).toBeCloseTo(1, 1);
  });

  it('refuses impossible coordinates and unknown countries', async () => {
    const fake = (async () => new Response(JSON.stringify({ address: {} }), { status: 200 })) as unknown as typeof fetch;
    expect(await reverseGeocode(123, 0, { fetch: fake, userAgent: 't' })).toBeNull();
    expect(await reverseGeocode(10, 10, { fetch: fake, userAgent: 't' })).toBeNull();
  });
});

describe('cache keys', () => {
  it('are stable across spelling noise', () => {
    expect(authorCacheKey('Haruki  Murakami')).toBe(authorCacheKey('haruki murakami'));
    expect(authorCacheKey('尤瓦尔·赫拉利')).toBe(authorCacheKey('尤瓦尔 赫拉利'));
    expect(authorCacheKey('A')).not.toBe(authorCacheKey('B'));
    expect(bookCacheKey('Dune', 'Frank Herbert')).not.toBe(bookCacheKey('Dune Messiah', 'Frank Herbert'));
  });
});
