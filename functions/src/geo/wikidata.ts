/* Marginalia · author origin from Wikidata (plan 2.6). Pure apart from the injected fetch.
   Finds the author's Wikidata item, then place of birth (P19) → its country (P17) → ISO code (P297),
   and citizenship (P27). "Author origin" on the map is the birth country; citizenship is the fallback
   when no birthplace is recorded. A wrong person is the main risk, so candidates are scored (human, a
   writing-related occupation, how well known, exact name match) instead of taking the first hit. */

export interface WikidataDeps {
  fetch: typeof fetch;
  /** e.g. https://www.wikidata.org (tests and the emulator point this at a fake) */
  baseUrl?: string;
  /** Wikimedia asks every client to identify itself with contact details. */
  userAgent: string;
}

export interface AuthorOrigin {
  qid: string;
  label: string;
  /** ISO 3166-1 alpha-2 of the country of the birthplace, or of the first citizenship when no birthplace is known */
  country: string | null;
  birthPlace: string | null;
  citizenship: string[];
  confidence: 'high' | 'medium' | 'low';
}

type Claim = { rank?: string; mainsnak?: { datavalue?: { value?: unknown } }; qualifiers?: Record<string, unknown> };
type Entity = {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, unknown>;
};

const WRITING = new Set([
  'Q36180', 'Q6625963', 'Q49757', 'Q4853732', 'Q482980', 'Q11774202', 'Q1930187', 'Q201788', 'Q4964182', 'Q214917',
  'Q28389', 'Q1209498', 'Q177220', 'Q3055126', 'Q4263842', 'Q1028181', 'Q18844224', 'Q15980158',
]);
const WRITER_WORDS = /writer|author|novelist|poet|historian|essayist|philosopher|journalist|playwright|scientist|作家|小说家|诗人|历史学家|哲学家|学者|散文|剧作家|漫画/i;
const hasCJK = (s: string) => /[一-鿿぀-ヿ]/.test(s);

const idOf = (claim: Claim | undefined): string | null => {
  const v = claim?.mainsnak?.datavalue?.value as { id?: string } | undefined;
  return v?.id ?? null;
};

/** The best claim of a property: a preferred one, else the first that has not ended, else the first. */
function bestClaim(entity: Entity, prop: string): Claim | undefined {
  const claims = entity.claims?.[prop] ?? [];
  const live = claims.filter((c) => c.rank !== 'deprecated');
  return live.find((c) => c.rank === 'preferred') ?? live.find((c) => !c.qualifiers?.P582) ?? live[0];
}

const ids = (entity: Entity, prop: string): string[] =>
  (entity.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated').map(idOf).filter((x): x is string => Boolean(x));

class Client {
  private readonly deps: WikidataDeps;

  constructor(deps: WikidataDeps) { this.deps = deps; }

  private async json(params: Record<string, string>): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const base = (this.deps.baseUrl ?? 'https://www.wikidata.org').replace(/\/$/, '');
    const url = `${base}/w/api.php?${new URLSearchParams({ format: 'json', origin: '*', ...params }).toString()}`;
    const res = await this.deps.fetch(url, { headers: { 'User-Agent': this.deps.userAgent, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Wikidata ${res.status}`);
    return res.json();
  }

  async search(term: string, language: string): Promise<string[]> {
    const r = await this.json({ action: 'wbsearchentities', search: term, language, uselang: language, type: 'item', limit: '7' });
    return ((r.search ?? []) as Array<{ id: string }>).map((x) => x.id);
  }

  async entities(idList: string[], props = 'claims|labels|descriptions'): Promise<Record<string, Entity>> {
    if (!idList.length) return {};
    const r = await this.json({ action: 'wbgetentities', ids: [...new Set(idList)].join('|'), props, languages: 'en|zh' });
    return (r.entities ?? {}) as Record<string, Entity>;
  }
}

const labelOf = (e: Entity | undefined) => e?.labels?.en?.value ?? e?.labels?.zh?.value ?? '';
const squash = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export async function lookupAuthorOrigin(name: string, deps: WikidataDeps): Promise<AuthorOrigin | null> {
  const client = new Client(deps);
  const primary = hasCJK(name) ? 'zh' : 'en';
  let candidateIds = await client.search(name, primary);
  if (!candidateIds.length) candidateIds = await client.search(name, primary === 'zh' ? 'en' : 'zh');
  if (!candidateIds.length && hasCJK(name)) {
    // Translated names are written many ways ("安托万·德·圣-埃克苏佩里" vs "圣埃克苏佩里"): try the longest piece on its own.
    const pieces = name.split(/[·・•\-\s]+/).filter((p) => p.length >= 2).sort((a, b) => b.length - a.length);
    for (const piece of pieces.slice(0, 2)) {
      candidateIds = await client.search(piece, 'zh');
      if (candidateIds.length) break;
    }
  }
  if (!candidateIds.length) return null;

  const candidates = await client.entities(candidateIds, 'claims|labels|descriptions|sitelinks');
  const wanted = squash(name);
  const scored = candidateIds
    .map((id) => candidates[id])
    .filter((e): e is Entity => Boolean(e) && ids(e, 'P31').includes('Q5'))
    .filter((e) => ids(e, 'P19').length > 0 || ids(e, 'P27').length > 0)
    .map((e) => {
      const occupations = ids(e, 'P106');
      const writerish = occupations.some((o) => WRITING.has(o)) || WRITER_WORDS.test(e.descriptions?.en?.value ?? '') || WRITER_WORDS.test(e.descriptions?.zh?.value ?? '');
      const exact = [e.labels?.en?.value, e.labels?.zh?.value].some((l) => l && squash(l) === wanted);
      const fame = Math.min(5, Object.keys(e.sitelinks ?? {}).length / 20);
      return { e, writerish, exact, score: (writerish ? 4 : 0) + (exact ? 3 : 0) + fame };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;

  const { e } = best;
  const placeId = idOf(bestClaim(e, 'P19'));
  const citizenIds = ids(e, 'P27');
  const place = placeId ? (await client.entities([placeId]))[placeId] : undefined;
  // A place of birth that is itself a country (rare, but it happens) is its own country.
  const countryIds = new Set<string>([...citizenIds]);
  const placeCountry = place ? (idOf(bestClaim(place, 'P17')) ?? null) : null;
  if (placeCountry) countryIds.add(placeCountry);
  const countries = await client.entities([...countryIds]);
  const iso = (id: string | null) => (id ? (countries[id]?.claims?.P297?.[0]?.mainsnak?.datavalue?.value as string | undefined) ?? null : null);
  const birthIso = iso(placeCountry) ?? (place?.claims?.P297?.[0]?.mainsnak?.datavalue?.value as string | undefined) ?? null;
  const citizenIso = citizenIds.map((id) => iso(id)).filter((x): x is string => Boolean(x));

  return {
    qid: e.id,
    label: labelOf(e),
    country: birthIso ?? citizenIso[0] ?? null,
    birthPlace: place ? labelOf(place) || null : null,
    citizenship: citizenIso,
    confidence: best.writerish && best.exact ? 'high' : best.writerish || best.exact ? 'medium' : 'low',
  };
}
