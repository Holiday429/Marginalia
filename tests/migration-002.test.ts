import { describe, expect, it } from 'vitest';
import { planHighlight } from '../scripts/migrations/002-resurface-fields.ts';

const NOW = Date.UTC(2026, 9, 20);

describe('migration 002 planning', () => {
  it('schedules a highlight that has none, with nothing answered', () => {
    const plan = planHighlight('h1', { quote: 'q' }, NOW)!;
    expect(plan.resurface7At).toBeGreaterThanOrEqual(NOW);
    expect(plan.resurface7At).toBeLessThanOrEqual(NOW + 7 * 86_400_000);
    expect([plan.resurfaced7, plan.resurfaced30, plan.resurfaced90]).toEqual([false, false, false]);
  });

  it('never touches a highlight that already has a schedule (answers are preserved)', () => {
    expect(planHighlight('h2', { quote: 'q', resurface7At: 1, resurfaced7: true }, NOW)).toBeNull();
  });

  it('skips empty highlights', () => {
    expect(planHighlight('h3', { quote: '  ' }, NOW)).toBeNull();
    expect(planHighlight('h4', {}, NOW)).toBeNull();
  });

  it('is deterministic per id, so a re-run after a partial failure schedules the same moments', () => {
    expect(planHighlight('same', { quote: 'q' }, NOW)).toEqual(planHighlight('same', { quote: 'q' }, NOW));
  });
});
