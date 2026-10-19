// Marginalia · Aggregates reading-session docs (and highlight dates) into per-day heatmap data.
// Pure functions: the Firestore reads live in profile.ts.

import type { SessionDay } from './profile-types.ts';

/** 'YYYY-MM-DD' in the viewer's local timezone, so "today" colours today's cell. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export interface RawSession { startedAt?: unknown; durationMs?: unknown }

function toMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const seconds = (value as { seconds?: unknown } | null)?.seconds;
  return typeof seconds === 'number' ? seconds * 1000 : null;
}

export function buildSessionDays(sessions: RawSession[], highlightTimes: unknown[] = []): SessionDay[] {
  const days = new Map<string, SessionDay>();
  const day = (key: string): SessionDay => {
    let entry = days.get(key);
    if (!entry) { entry = { date: key, sessions: 0, minutes: 0, highlights: 0 }; days.set(key, entry); }
    return entry;
  };

  for (const s of sessions) {
    const started = toMs(s.startedAt);
    if (started === null) continue;
    const entry = day(localDateKey(started));
    entry.sessions += 1;
    const dur = typeof s.durationMs === 'number' && s.durationMs > 0 ? s.durationMs : 0;
    entry.minutes += Math.round(dur / 60000);
  }
  for (const t of highlightTimes) {
    const ms = toMs(t);
    if (ms !== null) day(localDateKey(ms)).highlights += 1;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
