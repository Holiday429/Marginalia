import { describe, expect, it } from 'vitest';
import { renderIntroCardHtml } from '../src/book/intro-card-render.ts';
import { TAB_EMPTY_STATES, renderEmptyState } from '../src/components/empty-state/empty-state.ts';
import { parseModelJson } from '../src/ai/features/parse-model-json.ts';
import { countOpenActions, openActionLabel } from '../src/store/action-counts.ts';

describe('pre-read card (2.2)', () => {
  it('renders every section and escapes model text', () => {
    const html = renderIntroCardHtml({
      premise: 'A <b>bold</b> claim',
      audience: 'Anyone',
      difficulty: 'demanding',
      difficultyNote: 'Long.',
      readingTip: 'Slowly.',
      context: { author: 'A', period: 'P', place: 'L', summary: 'S' },
    });
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; claim');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('Demanding. Long.');
    expect(html).toContain('Cultural context');
  });

  it('copes with a partial or malformed result instead of throwing', () => {
    expect(() => renderIntroCardHtml(null)).not.toThrow();
    expect(renderIntroCardHtml({ premise: 'Only this' })).not.toContain('Cultural context');
    expect(renderIntroCardHtml('nonsense')).toContain('Before you start');
  });

  it('parses model output wrapped in a code fence', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseModelJson('not json')).toThrow();
  });
});

describe('empty states and counts (2.2)', () => {
  it('every tab has a title and a next step, in sentence case', () => {
    for (const [id, copy] of Object.entries(TAB_EMPTY_STATES)) {
      expect(copy.title.length, id).toBeGreaterThan(3);
      expect(copy.body.length, id).toBeGreaterThan(30);
      expect(copy.title, id).not.toMatch(/\b[A-Z]{2,}\b/); // no all-caps words
    }
    expect(renderEmptyState({ title: '<x>', body: 'b' })).toContain('&lt;x&gt;');
  });

  it('"open" means not done and not archived, and the label pluralises', () => {
    expect(countOpenActions([{ status: 'open' }, { status: 'snoozed' }, { status: 'done' }, { status: 'archived' }])).toBe(2);
    expect(countOpenActions(null)).toBe(0);
    expect(openActionLabel(1)).toBe('1 open action');
    expect(openActionLabel(0)).toBe('0 open actions');
  });
});
