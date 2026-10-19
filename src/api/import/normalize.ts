/* Marginalia · matching books across sources (plan 2.5): ISBN first, otherwise title + author. Pure. */

/** Digits (and a trailing X) of an ISBN; Goodreads wraps them as ="0316769487". Empty when it is not an ISBN. */
export function cleanIsbn(raw: unknown): string {
  const digits = String(raw ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
  return digits.length === 10 || digits.length === 13 ? digits : '';
}

/** ISBN-13 form of an ISBN-10 or ISBN-13, so the two spellings of the same book compare equal. */
export function toIsbn13(isbn: string): string {
  if (isbn.length === 13) return isbn;
  if (isbn.length !== 10) return '';
  const core = `978${isbn.slice(0, 9)}`;
  const sum = [...core].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return `${core}${(10 - (sum % 10)) % 10}`;
}

/** Lower-case letters, digits and CJK only; width variants and punctuation (including "·") disappear. */
function squash(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The title without a subtitle or a "(Series, #2)" tail, so "Dune: Deluxe" and "Dune (Dune #1)" match "Dune". */
function coreTitle(title: string): string {
  return title.replace(/\s*[(（［\[].*$/u, '').replace(/\s*[:：—–-]\s+.*$/u, '').trim() || title;
}

/** Primary author: the first of "A, B", "A; B", "A & B", "A and B". */
function firstAuthor(author: string): string {
  return author.split(/[,;，；&＆]|\band\b|和|、/i)[0]?.trim() ?? '';
}

export function titleAuthorKey(title: string, author: string): string {
  return `${squash(coreTitle(title))}|${squash(firstAuthor(author))}`;
}

export interface BookIdentity { title: string; author?: string; isbn?: string }

export function identityKeys(book: BookIdentity): string[] {
  const keys: string[] = [];
  const isbn = toIsbn13(cleanIsbn(book.isbn));
  if (isbn) keys.push(`isbn:${isbn}`);
  keys.push(`ta:${titleAuthorKey(book.title, book.author ?? '')}`);
  return keys;
}

/** Same book? Equal ISBN, or equal title + author. A missing author on either side matches on title alone only when both lack one. */
export function sameBook(a: BookIdentity, b: BookIdentity): boolean {
  const ka = identityKeys(a);
  const kb = new Set(identityKeys(b));
  return ka.some((k) => kb.has(k));
}

/** Stable short hash (FNV-1a, base 36), used to give imported highlights ids that do not change between imports. */
export function stableHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
