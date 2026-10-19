/* Marginalia · finish card block on the Notes tab (plan 2.3). Pure markup + the data for the image export. */

import type { ReadingCardData } from './reading-card.ts';
import type { FinishCard } from '../data/schema/moment.ts';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export interface FinishBlockState {
  card: FinishCard | null;
  momentState: 'completed' | 'skipped' | null;
  isFinished: boolean;
  finishedAt?: number;
}

export function renderFinishCardBlock(state: FinishBlockState): string {
  const { card, momentState, isFinished, finishedAt } = state;
  if (card) {
    const date = finishedAt ? new Date(finishedAt).toLocaleDateString() : '';
    return `
      <article class="finish-card" data-finish-card>
        <h3 class="finish-card__headline">${esc(card.headline)}</h3>
        <p class="finish-card__synthesis">${esc(card.synthesis)}</p>
        ${card.tags.length ? `<div class="finish-card__tags">${card.tags.map((t) => `<span class="finish-card__tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="finish-card__foot">
          ${date ? `<span class="finish-card__date">${esc(date)}</span>` : '<span></span>'}
          <button type="button" class="finish-card__btn" data-fc-export>Export as image</button>
        </div>
      </article>`;
  }
  if (momentState === 'completed') {
    return `
      <div class="finish-card finish-card--pending" data-finish-card-pending>
        <p class="finish-card__synthesis">Your answers are saved, but the finish card has not been written yet.</p>
        <button type="button" class="finish-card__btn" data-fc-generate>Write the finish card</button>
      </div>`;
  }
  if (isFinished) {
    return `
      <div class="finish-card finish-card--prompt" data-finish-card-prompt>
        <p class="finish-card__synthesis">You finished this book. Answer three short questions and get a card that sums up what it meant to you.</p>
        <button type="button" class="finish-card__btn" data-fc-start>Write a finish reflection</button>
      </div>`;
  }
  return '';
}

/** Data for the existing reading-card image renderer, with the finish synthesis as the takeaway. */
export function buildFinishReadingCardData(
  book: { title: string; titleZh?: string; author?: string; authorZh?: string; rating?: number | null; summary?: string; year?: number | string | null; cover?: { bg?: string; text?: string; image?: string }; highlights?: Array<{ quote?: string }> },
  card: FinishCard,
): ReadingCardData {
  const quotes = (book.highlights ?? []).map((h) => String(h.quote ?? '').trim()).filter(Boolean).slice(0, 3);
  return {
    title: book.title,
    displayTitle: book.titleZh || book.title,
    subtitle: card.headline,
    author: [book.authorZh, book.author].filter(Boolean).join(' · ') || book.author || '',
    rating: book.rating ?? null,
    summary: book.summary,
    highlights: quotes.length ? quotes : ['No highlights captured yet.'],
    takeaway: card.synthesis,
    keywords: card.tags.slice(0, 6),
    coverUrl: book.cover?.image,
    publishedYear: book.year ? String(book.year) : '',
    spineColor: book.cover?.bg || '#171311',
    textColor: book.cover?.text || '#f0e8d8',
  };
}
