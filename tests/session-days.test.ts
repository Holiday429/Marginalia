import { describe, it, expect } from 'vitest';
import { buildSessionDays, localDateKey } from '../src/profile/session-days.ts';

describe('buildSessionDays', () => {
  const today = new Date(2026, 9, 19, 21, 30).getTime(); // local time
  it('colours the cell of the day a session started, summing minutes', () => {
    const days = buildSessionDays([
      { startedAt: today, durationMs: 25 * 60000 },
      { startedAt: today + 3600_000, durationMs: 30 * 60000 },
    ]);
    expect(days).toEqual([{ date: '2026-10-19', sessions: 2, minutes: 55, highlights: 0 }]);
  });

  it('counts highlights per day and merges them with sessions', () => {
    const days = buildSessionDays([{ startedAt: today, durationMs: 60000 }], [today, today, today - 86_400_000]);
    expect(days.find((d) => d.date === '2026-10-19')).toMatchObject({ sessions: 1, highlights: 2 });
    expect(days.find((d) => d.date === '2026-10-18')).toMatchObject({ sessions: 0, highlights: 1 });
  });

  it('tolerates open sessions, Firestore timestamps and junk', () => {
    const days = buildSessionDays([
      { startedAt: today, durationMs: null },
      { startedAt: { seconds: today / 1000 } },
      { startedAt: 'nope' },
      {},
    ]);
    expect(days).toEqual([{ date: '2026-10-19', sessions: 2, minutes: 0, highlights: 0 }]);
  });

  it('localDateKey uses the local calendar day', () => {
    expect(localDateKey(new Date(2026, 0, 5, 0, 5).getTime())).toBe('2026-01-05');
  });
});
