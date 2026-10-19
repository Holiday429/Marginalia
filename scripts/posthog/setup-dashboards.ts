/* ==========================================================================
   PostHog dashboard setup (plan 2.10)
   --------------------------------------------------------------------------
   Creates one dashboard, "Marginalia core loop", with:
     1. Funnel: signup -> book_added -> highlight_saved -> book_finished (30-day window)
     2. Weekly active readers: distinct people who saved a highlight, answered a resurfaced one,
        finished a session or finished a book that week (HogQL; matches the phase-2 gate)
     3. Weekly retention: of people who did something active in a week, how many do again later
     4. Event volume by name (sanity check that every catalogue event arrives)
   Event names come from shared/analytics-events.ts, the same catalogue the app uses.

   Dry run by default (prints the payloads). With --apply it calls the PostHog API:
     POSTHOG_PERSONAL_API_KEY=phx_...  POSTHOG_PROJECT_ID=12345 [POSTHOG_HOST=https://us.posthog.com]
     npm run analytics:dashboards -- --apply        (Node 22 type stripping; no tsx needed)
   The payload shapes follow PostHog's query schema but have NOT been run against a real PostHog
   project from this repository; check the four tiles after the first --apply.
   ========================================================================== */

import { ACTIVE_EVENTS, CORE_EVENTS, FUNNEL_EVENTS } from '../../shared/analytics-events.ts';

export interface DashboardSpec {
  dashboard: { name: string; description: string };
  insights: Array<{ name: string; description: string; query: Record<string, unknown> }>;
}

const eventNode = (event: string) => ({ kind: 'EventsNode', event, name: event, math: 'dau' });
const sqlList = (names: readonly string[]) => names.map((n) => `'${n}'`).join(', ');

export function buildDashboardSpec(): DashboardSpec {
  return {
    dashboard: {
      name: 'Marginalia core loop',
      description: 'Signup to finished book, weekly active readers and retention. Defined in scripts/posthog/setup-dashboards.ts.',
    },
    insights: [
      {
        name: 'Funnel: signup to finished book',
        description: 'Share of new accounts that add a book, save a highlight and finish a book within 30 days.',
        query: {
          kind: 'InsightVizNode',
          source: {
            kind: 'FunnelsQuery',
            series: FUNNEL_EVENTS.map(eventNode),
            funnelsFilter: { funnelVizType: 'steps', funnelWindowInterval: 30, funnelWindowIntervalUnit: 'day', funnelOrderType: 'ordered' },
            dateRange: { date_from: '-90d' },
          },
        },
      },
      {
        name: 'Weekly active readers',
        description: `People with at least one of: ${ACTIVE_EVENTS.join(', ')}.`,
        query: {
          kind: 'DataVisualizationNode',
          source: {
            kind: 'HogQLQuery',
            query: `SELECT toStartOfWeek(timestamp) AS week, count(DISTINCT person_id) AS active_readers
FROM events
WHERE event IN (${sqlList(ACTIVE_EVENTS)}) AND timestamp > now() - INTERVAL 12 WEEK
GROUP BY week ORDER BY week`,
          },
        },
      },
      {
        name: 'Weekly retention (active readers)',
        description: 'First active week, then returning in each following week.',
        query: {
          kind: 'InsightVizNode',
          source: {
            kind: 'RetentionQuery',
            retentionFilter: {
              retentionType: 'retention_first_time',
              period: 'Week',
              totalIntervals: 9,
              targetEntity: { id: 'highlight_saved', name: 'highlight_saved', type: 'events' },
              returningEntity: { id: 'highlight_saved', name: 'highlight_saved', type: 'events' },
            },
            dateRange: { date_from: '-8w' },
          },
        },
      },
      {
        name: 'Events by name (last 14 days)',
        description: 'Every catalogue event should appear here once the app has been used.',
        query: {
          kind: 'DataVisualizationNode',
          source: {
            kind: 'HogQLQuery',
            query: `SELECT event, count() AS total, count(DISTINCT person_id) AS people
FROM events
WHERE event IN (${sqlList(CORE_EVENTS)}) AND timestamp > now() - INTERVAL 14 DAY
GROUP BY event ORDER BY total DESC`,
          },
        },
      },
    ],
  };
}

async function api(host: string, key: string, path: string, body: unknown): Promise<{ id: number }> {
  const res = await fetch(`${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostHog ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: number };
}

async function main(): Promise<void> {
  const spec = buildDashboardSpec();
  if (!process.argv.includes('--apply')) {
    process.stdout.write(`${JSON.stringify(spec, null, 2)}\n\n(dry run: pass --apply with POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID)\n`);
    return;
  }
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  const host = (process.env.POSTHOG_HOST ?? 'https://us.posthog.com').replace(/\/$/, '');
  if (!key || !project) throw new Error('Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID.');

  const dashboard = await api(host, key, `/api/projects/${project}/dashboards/`, spec.dashboard);
  for (const insight of spec.insights) {
    const created = await api(host, key, `/api/projects/${project}/insights/`, { ...insight, dashboards: [dashboard.id], saved: true });
    process.stdout.write(`created insight ${created.id}: ${insight.name}\n`);
  }
  process.stdout.write(`dashboard ${host}/project/${project}/dashboard/${dashboard.id}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => { process.stderr.write(`${String(err)}\n`); process.exit(1); });
}
