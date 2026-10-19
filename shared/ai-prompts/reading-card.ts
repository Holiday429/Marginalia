/* Prompt: reading-card
   Output: { takeaway, keywords } used by the shareable reading card (src/book/reading-card.ts). */
import type { BookCtx } from './types';

export function buildReadingCardPrompt(book: BookCtx, extras: { notes?: string } = {}): string {
  const quotes = (book.highlights || [])
    .slice(0, 8)
    .map((item, index) => `${index + 1}. "${String(item.quote || '').trim()}"`)
    .join('\n');
  const cleanedNotes = String(extras.notes || '').replace(/\s+/g, ' ').trim();
  const tags = (book.tags || []).slice(0, 8).join(', ');

  return `You are creating a polished Marginalia reading card for "${book.title}" by ${book.author || 'unknown'}.

Use the reader's real book data below to write the MY TAKEAWAY section and propose concise keywords.

Overview summary:
${String(book.summary || '').trim() || '(none)'}

Highlights:
${quotes || '(none)'}

Reader notes:
${cleanedNotes || '(none)'}

Existing tags:
${tags || '(none)'}

Return JSON only:
{
  "takeaway": "80-130 words. First-person if notes support it. Read like a thoughtful personal reflection, not marketing copy. Use the dominant language from the notes when obvious; otherwise use the book's main language.",
  "keywords": ["3 to 6 short keywords or short phrases grounded in the real material"]
}`;
}
