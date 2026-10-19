/* Prompt: intro-card
   Target panel: overview (top of the book page)
   Output: JSON object — a pre-read card plus a short cultural context. Generated once when a book is added.
*/
import type { BookCtx } from './types';

// NOTE: template-literal text below is sent to the model verbatim; do not re-indent it.
export function buildIntroCardPrompt(book: BookCtx): string {
    return `You are a thoughtful reading companion. A reader is about to start a book and wants a short pre-read card.

Book: "${book.title}" by ${book.author || 'unknown author'}
Year: ${book.year || 'unknown'}
Type: ${book.bookType || 'unknown'}
Summary the reader saved: ${book.summary || '(none)'}
Tags: ${(book.tags || []).join(', ') || '(none)'}

Return a JSON object with EXACTLY this shape:
{
  "premise": "string — two sentences on what the book is about or argues, without spoilers",
  "audience": "string — one sentence on who this book suits",
  "difficulty": "easy" | "moderate" | "demanding",
  "difficultyNote": "string — one sentence on why it is that difficulty",
  "readingTip": "string — one concrete suggestion for how to read it",
  "context": {
    "author": "string — one or two sentences on the author's background",
    "period": "string — when it was written and what was going on then",
    "place": "string — where it was written or is set, and why that matters",
    "summary": "string — 60 to 90 words tying the author, the period and the place to the book"
  }
}

Rules:
- If you do not recognise this book, say so in "premise" and keep every other field general. Never invent plot details, quotes or biographical facts.
- Write in the language of the book's title.
- Return ONLY the JSON object, no markdown, no explanation`;
}
