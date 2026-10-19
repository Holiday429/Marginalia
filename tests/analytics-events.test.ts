import { describe, expect, it } from 'vitest';
import { ACTIVE_EVENTS, CORE_EVENTS, FUNNEL_EVENTS } from '../shared/analytics-events.ts';
import { buildDashboardSpec } from '../scripts/posthog/setup-dashboards.ts';
import { notifyBookStatusChange } from '../src/store/book-status-events.ts';

describe('analytics catalogue (2.10)', () => {
  it('names exactly the nine events the plan requires', () => {
    expect([...CORE_EVENTS].sort()).toEqual([
      'ai_generated', 'book_added', 'book_finished', 'email_action_clicked', 'highlight_saved',
      'import_completed', 'resurface_responded', 'session_completed', 'signup',
    ]);
  });

  it('funnel and active-reader definitions only use catalogue events', () => {
    for (const name of [...FUNNEL_EVENTS, ...ACTIVE_EVENTS]) expect(CORE_EVENTS).toContain(name);
  });

  it('dashboard payloads reference only catalogue events and cover funnel, weekly active, retention', () => {
    const spec = buildDashboardSpec();
    expect(spec.insights.map((i) => i.name)).toEqual([
      'Funnel: signup to finished book',
      'Weekly active readers',
      'Weekly retention (active readers)',
      'Events by name (last 14 days)',
    ]);
    const text = JSON.stringify(spec);
    const quoted = [...text.matchAll(/\\?'([a-z_]+)\\?'/g)].map((m) => m[1]);
    for (const name of quoted) expect(CORE_EVENTS as readonly string[]).toContain(name);
    expect(JSON.stringify(spec.insights[0].query)).toContain('"event":"signup"');
  });
});

describe('book status transitions', () => {
  it('only a real move into finished counts; creation, repeats and other moves do not', () => {
    const seen: string[] = [];
    (globalThis as any).window = { dispatchEvent: (e: CustomEvent) => seen.push(e.detail.to), };
    (globalThis as any).CustomEvent = class { type: string; detail: unknown; constructor(t: string, i: { detail: unknown }) { this.type = t; this.detail = i.detail; } };
    expect(notifyBookStatusChange('b1', undefined, 'finished')).toBe(false);
    expect(notifyBookStatusChange('b1', 'reading', 'finished')).toBe(true);
    expect(notifyBookStatusChange('b1', 'finished', 'finished')).toBe(false);
    expect(notifyBookStatusChange('b1', 'read', 'finished')).toBe(false); // legacy 'read' is already finished
    expect(notifyBookStatusChange('b1', 'finished', 'reading')).toBe(false);
    expect(seen).toEqual(['finished', 'reading']);
  });
});
