import { describe, expect, it } from 'vitest';
import { DAY_MS, applyResponse, backfillSchedule, dueTier, pickDue, scheduleFrom, type ResurfaceFields } from '../shared/resurface.ts';

const T0 = Date.UTC(2026, 9, 1);

describe('resurface schedule (2.4)', () => {
  it('a new highlight comes back after 7, 30 and 90 days', () => {
    const s = scheduleFrom(T0);
    expect(s.resurface7At - T0).toBe(7 * DAY_MS);
    expect(s.resurface30At - T0).toBe(30 * DAY_MS);
    expect(s.resurface90At - T0).toBe(90 * DAY_MS);
    expect([s.resurfaced7, s.resurfaced30, s.resurfaced90]).toEqual([false, false, false]);
  });

  it('is not due before its time and due at the 7 day mark; unscheduled highlights are never due', () => {
    const h = scheduleFrom(T0);
    expect(dueTier(h, T0 + 6 * DAY_MS)).toBeNull();
    expect(dueTier(h, T0 + 7 * DAY_MS)).toMatchObject({ tier: '7d' });
    expect(dueTier({}, T0 + 400 * DAY_MS)).toBeNull();
  });

  it('the earliest unanswered moment is the one that is due, even if later ones have also passed', () => {
    expect(dueTier(scheduleFrom(T0), T0 + 200 * DAY_MS)).toMatchObject({ tier: '7d' });
    expect(dueTier({ ...scheduleFrom(T0), resurfaced7: true }, T0 + 200 * DAY_MS)).toMatchObject({ tier: '30d' });
  });

  it('backfill spreads old highlights over the next week and keeps the three moments apart', () => {
    const times = Array.from({ length: 200 }, (_, i) => backfillSchedule(`hl-${i}`, T0).resurface7At);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(T0);
    expect(Math.max(...times)).toBeLessThanOrEqual(T0 + 7 * DAY_MS);
    const buckets = new Set(times.map((t) => Math.floor((t - T0) / DAY_MS)));
    expect(buckets.size).toBeGreaterThanOrEqual(6);
    const s = backfillSchedule('x', T0);
    expect(s.resurface30At - s.resurface7At).toBe(23 * DAY_MS);
  });
});

describe('picking what to show', () => {
  const make = (id: string, over: ResurfaceFields = {}) => ({ id, quote: `q-${id}`, ...scheduleFrom(T0), ...over });

  it('returns at most three, one per highlight, least recently shown first', () => {
    const now = T0 + 10 * DAY_MS;
    const list = [make('a', { lastSurfacedAt: now - DAY_MS }), make('b'), make('c', { lastSurfacedAt: now - 5 * DAY_MS }), make('d'), make('e')];
    const picked = pickDue(list, now, 3).map((p) => p.highlight.id);
    expect(picked).toHaveLength(3);
    expect(picked).not.toContain('a'); // shown most recently
    expect(picked.slice(0, 2).sort()).toEqual(['b', 'd']); // never shown comes first
  });

  it('skips answered, dismissed, empty and not-yet-due highlights', () => {
    const now = T0 + 10 * DAY_MS;
    const list = [
      make('answered', { resurfaced7: true }),
      make('dismissed', { resurfaced7: true, resurfaced30: true, resurfaced90: true }),
      { id: 'empty', quote: '', ...scheduleFrom(T0) },
      make('future', scheduleFrom(now)),
      make('due'),
    ];
    expect(pickDue(list, now).map((p) => p.highlight.id)).toEqual(['due']);
  });
});

describe('answering', () => {
  const now = T0 + 7 * DAY_MS;

  it('"still holds" closes this moment and leaves the later ones scheduled', () => {
    const patch = applyResponse(scheduleFrom(T0), '7d', 'resonates', now);
    expect(patch.resurfaced7).toBe(true);
    expect(patch.resurfaced30).toBeUndefined();
    expect(patch.resurfaceRating).toBe('resonates');
    expect(patch.resurface30At).toBe(T0 + 30 * DAY_MS); // already later than now + 7 days
  });

  it('answering late pushes the next moments out by at least a week each, never back to back', () => {
    const late = T0 + 100 * DAY_MS; // the 30 and 90 day marks have both passed already
    const patch = applyResponse(scheduleFrom(T0), '7d', 'thought', late);
    expect(patch.resurface30At).toBe(late + 7 * DAY_MS);
    expect(patch.resurface90At).toBe(late + 14 * DAY_MS);
    const after = { ...scheduleFrom(T0), ...patch };
    expect(dueTier(after, late + DAY_MS)).toBeNull();
    expect(dueTier(after, late + 7 * DAY_MS)).toMatchObject({ tier: '30d' });
  });

  it('"stop reminding" closes every moment', () => {
    const patch = applyResponse(scheduleFrom(T0), '7d', 'dismiss', now);
    expect([patch.resurfaced7, patch.resurfaced30, patch.resurfaced90]).toEqual([true, true, true]);
    expect(dueTier({ ...scheduleFrom(T0), ...patch }, T0 + 1000 * DAY_MS)).toBeNull();
  });

  it('answering the last moment leaves nothing scheduled', () => {
    const h = { ...scheduleFrom(T0), resurfaced7: true, resurfaced30: true };
    const patch = applyResponse(h, '90d', 'action', T0 + 90 * DAY_MS);
    expect(dueTier({ ...h, ...patch }, T0 + 5000 * DAY_MS)).toBeNull();
  });
});
