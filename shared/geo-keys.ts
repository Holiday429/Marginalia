// Marginalia · cache keys for book geography (plan 2.6). Shared by the Cloud Functions and tests.

/** Lower-case letters, digits and CJK only; width variants and punctuation (including "·") disappear. */
export function squashName(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** FNV-1a, base 36. */
export function shortHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** One cache document per author: where they were born does not depend on which book asked. */
export function authorCacheKey(author: string): string {
  return `a-${shortHash(squashName(author))}-${squashName(author).length}`;
}

/** One cache document per book (its setting): title + author. */
export function bookCacheKey(title: string, author: string): string {
  const core = `${squashName(title)}|${squashName(author)}`;
  return `b-${shortHash(core)}-${core.length}`;
}
