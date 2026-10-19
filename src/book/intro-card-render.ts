/* Marginalia · pre-read card markup (plan 2.2). Pure: takes the AI block's content, returns HTML. */

import './intro-card.css';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy read', moderate: 'Moderate', demanding: 'Demanding' };

interface IntroCardData {
  premise?: string;
  audience?: string;
  difficulty?: string;
  difficultyNote?: string;
  readingTip?: string;
  context?: { author?: string; period?: string; place?: string; summary?: string };
}

export function renderIntroCardHtml(raw: unknown): string {
  const data = (raw && typeof raw === 'object' ? raw : {}) as IntroCardData;
  const ctx = data.context ?? {};
  const difficulty = DIFFICULTY_LABEL[String(data.difficulty ?? '').toLowerCase()] ?? '';
  const facts = [
    data.audience ? ['Who it suits', data.audience] : null,
    difficulty ? ['Difficulty', `${difficulty}${data.difficultyNote ? `. ${data.difficultyNote}` : ''}`] : null,
    data.readingTip ? ['How to read it', data.readingTip] : null,
  ].filter(Boolean) as string[][];
  const context = [
    ctx.author ? ['Author', ctx.author] : null,
    ctx.period ? ['Period', ctx.period] : null,
    ctx.place ? ['Place', ctx.place] : null,
  ].filter(Boolean) as string[][];

  return `
    <article class="intro-card" data-intro-card>
      <h3 class="intro-card__title">Before you start</h3>
      ${data.premise ? `<p class="intro-card__premise">${esc(data.premise)}</p>` : ''}
      ${facts.length ? `<dl class="intro-card__facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${(context.length || ctx.summary) ? `
        <h3 class="intro-card__title">Cultural context</h3>
        ${ctx.summary ? `<p class="intro-card__context">${esc(ctx.summary)}</p>` : ''}
        ${context.length ? `<dl class="intro-card__facts">${context.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}` : ''}
    </article>`;
}
