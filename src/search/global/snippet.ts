/* Marginalia · result snippets with the matched words marked (plan 2.7). Pure; returns escaped HTML. */

const esc = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const WORDS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}_']+/gu;
const IS_CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** The strings to look for in the original text: each Latin word, each CJK run (or its pairs when the run is not found whole). */
export function needles(query: string, text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const m of query.normalize('NFKC').matchAll(WORDS)) {
    const run = m[0].toLowerCase();
    if (IS_CJK.test(run)) {
      if (lower.includes(run) || [...run].length < 2) out.push(run);
      else { const c = [...run]; for (let i = 0; i + 1 < c.length; i += 1) out.push(c[i] + c[i + 1]); }
    } else out.push(run);
  }
  return [...new Set(out)].filter(Boolean).sort((a, b) => b.length - a.length);
}

/** A window of `radius` characters around the first match, with every match wrapped in <mark>. */
export function buildSnippet(text: string, query: string, radius = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const terms = needles(query, flat);
  const lower = flat.toLowerCase();
  let first = -1;
  for (const t of terms) { const i = lower.indexOf(t); if (i >= 0 && (first < 0 || i < first)) first = i; }
  const start = first < 0 ? 0 : Math.max(0, first - radius);
  const end = Math.min(flat.length, (first < 0 ? 0 : first) + radius * 2);
  const slice = flat.slice(start, end);
  const sliceLower = slice.toLowerCase();

  // Mark: collect non-overlapping ranges, longest needles first.
  const ranges: Array<[number, number]> = [];
  for (const t of terms) {
    let from = 0;
    for (;;) {
      const i = sliceLower.indexOf(t, from);
      if (i < 0) break;
      if (!ranges.some(([a, b]) => i < b && i + t.length > a)) ranges.push([i, i + t.length]);
      from = i + t.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let html = '';
  let at = 0;
  for (const [a, b] of ranges) { html += esc(slice.slice(at, a)) + `<mark>${esc(slice.slice(a, b))}</mark>`; at = b; }
  html += esc(slice.slice(at));
  return `${start > 0 ? '…' : ''}${html}${end < flat.length ? '…' : ''}`;
}
