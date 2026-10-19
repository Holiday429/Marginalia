/* Marginalia · where a story is set (plan 2.6): the prompt for the internal model call and the check of
   its answer. Internal: this call is made by the server on the reader's behalf and is not counted against
   their AI allowance (it is logged for cost accounting, see resolve.ts). */

export interface BookSetting { country: string | null; city: string | null; confidence: 'high' | 'medium' | 'low' }

export interface ModelReply { text: string; inputTokens: number; outputTokens: number }
export type ModelCall = (prompt: string) => Promise<ModelReply>;

// NOTE: template-literal text below is sent to the model verbatim; do not re-indent it.
export function buildSettingPrompt(book: { title: string; author: string }): string {
  return `Where is the story of this book mainly set?

Book: "${book.title}" by ${book.author || 'unknown author'}

Return only JSON: {"country": "ISO 3166-1 alpha-2 code of the main country, or null", "city": "the main city or region in English, or null", "confidence": "high" | "medium" | "low"}

Rules:
- A book that is nonfiction or has no clear setting gets {"country": null, "city": null, "confidence": "low"}.
- If you do not recognise the book, answer the same. Never guess.`;
}

export function parseSetting(text: string): BookSetting {
  const none: BookSetting = { country: null, city: null, confidence: 'low' };
  let json: unknown;
  try { json = JSON.parse(text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim()); } catch { return none; }
  if (!json || typeof json !== 'object') return none;
  const j = json as Record<string, unknown>;
  const country = typeof j.country === 'string' && /^[A-Za-z]{2}$/.test(j.country.trim()) ? j.country.trim().toUpperCase() : null;
  const city = country && typeof j.city === 'string' && j.city.trim() ? j.city.trim().slice(0, 80) : null;
  const confidence = j.confidence === 'high' || j.confidence === 'medium' ? j.confidence : 'low';
  return { country, city, confidence };
}
