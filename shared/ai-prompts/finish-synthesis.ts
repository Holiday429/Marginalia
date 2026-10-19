/* Prompt: finish-synthesis
   Used by the finish ritual (plan 2.3). The reader's three answers arrive as validated `params`.
   Output: { headline, synthesis, tags } — the finish card stored in moments/{bookId}.
*/
import type { BookCtx } from './types';

export interface FinishAnswers { belief: string; intention: string; next: string }

/** Parameter names the gateway accepts for this feature, with their maximum length. */
export const FINISH_SYNTHESIS_PARAMS = { belief: 400, intention: 400, next: 400 } as const;

// NOTE: template-literal text below is sent to the model verbatim; do not re-indent it.
export function buildFinishSynthesisPrompt(book: BookCtx, answers: Partial<FinishAnswers> = {}): string {
    const quotes = (book.highlights || []).slice(0, 6).map((h) => `"${String(h.quote || '').trim()}"`).join('\n');
    return `You are a thoughtful reading companion. The reader just finished "${book.title}" by ${book.author || 'unknown author'}.

Their reflections:
- What shifted or surprised them: "${answers.belief || '(skipped)'}"
- What they intend to do differently: "${answers.intention || '(skipped)'}"
- What they want to read next, and why: "${answers.next || '(skipped)'}"

Their highlights from the book:
${quotes || '(none saved)'}

Write a personal synthesis of what this book meant to this reader. Be specific and concrete: name the ideas from their highlights and connect them to their stated intentions. If an answer was skipped, do not invent one. 2 to 3 sentences. Do not use generic phrases like "this book changed my perspective". Write in the language the reader used in their answers, otherwise the language of the book's title.

Return JSON only: { "headline": "<5 words max>", "synthesis": "<the paragraph>", "tags": ["<tag1>", "<tag2>"] }`;
}
