// Marginalia · spaced resurface of highlights (plan 2.4). Pure logic, shared by the browser
// (home / Today panel) and the Cloud Functions (weekly email, email links).
//
// Every highlight carries three review moments (7, 30 and 90 days). The reader answers one of four
// ways; answering closes that moment and pushes the next ones out so the same highlight never comes
// back on consecutive days.

export const DAY_MS = 86_400_000;
/** After an answer, the next moment is never sooner than this. */
export const MIN_GAP_DAYS = 7;

export type ResurfaceTier = '7d' | '30d' | '90d';
export type ResurfaceRating = 'resonates' | 'thought' | 'action' | 'dismiss';
export const RESURFACE_RATINGS: readonly ResurfaceRating[] = ['resonates', 'thought', 'action', 'dismiss'];

export interface ResurfaceFields {
  resurface7At?: number;
  resurface30At?: number;
  resurface90At?: number;
  resurfaced7?: boolean;
  resurfaced30?: boolean;
  resurfaced90?: boolean;
  resurfaceRating?: ResurfaceRating;
  resurfaceRespondedAt?: number;
  /** When a weekly email last showed it; the picker prefers highlights shown least recently. */
  lastSurfacedAt?: number;
}

const TIERS = [
  { tier: '7d', days: 7, at: 'resurface7At', done: 'resurfaced7' },
  { tier: '30d', days: 30, at: 'resurface30At', done: 'resurfaced30' },
  { tier: '90d', days: 90, at: 'resurface90At', done: 'resurfaced90' },
] as const;

export const TIER_LABEL: Record<ResurfaceTier, string> = { '7d': 'One week ago', '30d': 'One month ago', '90d': 'Three months ago' };

/** Schedule for a highlight saved at `anchor`: 7, 30 and 90 days later, nothing answered yet. */
export function scheduleFrom(anchor: number): Required<Pick<ResurfaceFields, 'resurface7At' | 'resurface30At' | 'resurface90At' | 'resurfaced7' | 'resurfaced30' | 'resurfaced90'>> {
  return {
    resurface7At: anchor + 7 * DAY_MS,
    resurface30At: anchor + 30 * DAY_MS,
    resurface90At: anchor + 90 * DAY_MS,
    resurfaced7: false,
    resurfaced30: false,
    resurfaced90: false,
  };
}

function hashToUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Schedule for a highlight that existed before this feature: the first moment is spread over the next
 * week (by id), so a library of 300 old highlights does not become 300 things due on day one.
 */
export function backfillSchedule(id: string, now: number): ReturnType<typeof scheduleFrom> {
  const first = now + Math.round(hashToUnit(id) * 7 * DAY_MS);
  return {
    resurface7At: first,
    resurface30At: first + 23 * DAY_MS,
    resurface90At: first + 83 * DAY_MS,
    resurfaced7: false,
    resurfaced30: false,
    resurfaced90: false,
  };
}

/** The tier that is due now: the earliest unanswered moment, if its time has come. Unscheduled highlights are never due. */
export function dueTier(h: ResurfaceFields, now: number): { tier: ResurfaceTier; dueAt: number } | null {
  for (const t of TIERS) {
    if (h[t.done]) continue;
    const at = h[t.at];
    if (typeof at !== 'number') return null; // unscheduled (or a partly written schedule)
    return at <= now ? { tier: t.tier, dueAt: at } : null;
  }
  return null;
}

export interface DuePick<T> { highlight: T; tier: ResurfaceTier; dueAt: number }

/** Up to `limit` due highlights: least recently shown first, then oldest due. One entry per highlight. */
export function pickDue<T extends ResurfaceFields & { quote?: string }>(highlights: readonly T[], now: number, limit = 3): Array<DuePick<T>> {
  const due: Array<DuePick<T>> = [];
  for (const highlight of highlights) {
    if (!highlight.quote) continue;
    const d = dueTier(highlight, now);
    if (d) due.push({ highlight, tier: d.tier, dueAt: d.dueAt });
  }
  due.sort((a, b) => (a.highlight.lastSurfacedAt ?? 0) - (b.highlight.lastSurfacedAt ?? 0) || a.dueAt - b.dueAt);
  return due.slice(0, limit);
}

/** The field changes for answering `tier` with `rating`. Merge them into the highlight document. */
export function applyResponse(h: ResurfaceFields, tier: ResurfaceTier, rating: ResurfaceRating, now: number): ResurfaceFields {
  const patch: ResurfaceFields = { resurfaceRating: rating, resurfaceRespondedAt: now };
  if (rating === 'dismiss') {
    patch.resurfaced7 = true;
    patch.resurfaced30 = true;
    patch.resurfaced90 = true;
    return patch;
  }
  let floor = now + MIN_GAP_DAYS * DAY_MS; // next moment no sooner than this, and each one after that a week later still
  let passed = false;
  for (const t of TIERS) {
    if (t.tier === tier) { patch[t.done] = true; passed = true; continue; }
    if (!passed || h[t.done]) continue;
    const current = h[t.at];
    const next = Math.max(typeof current === 'number' ? current : 0, floor);
    patch[t.at] = next;
    floor = next + MIN_GAP_DAYS * DAY_MS;
  }
  return patch;
}

export function isRating(value: unknown): value is ResurfaceRating {
  return typeof value === 'string' && (RESURFACE_RATINGS as readonly string[]).includes(value);
}

export function isTier(value: unknown): value is ResurfaceTier {
  return value === '7d' || value === '30d' || value === '90d';
}

// ── Due actions (shared by the weekly email and the Today panel) ───────────────

export interface ActionRow {
  id: string;
  text?: string;
  bookId?: string;
  status?: string;
  createdAt?: number;
  remind7At?: number;
  remind30At?: number;
  remind90At?: number;
  lastDigestAt?: number;
}

/** An action is due once any of its 7 / 30 / 90 day marks has passed; done and archived ones never are. */
export function actionDueAt(a: ActionRow, now: number): number | null {
  if (a.status !== 'open' && a.status !== 'snoozed') return null;
  const marks = [a.remind7At, a.remind30At, a.remind90At].filter((t): t is number => typeof t === 'number' && t <= now);
  return marks.length ? Math.max(...marks) : null;
}

/** The one due action to show: the one shown least recently first, so the same one does not come up every time. */
export function pickDueAction<T extends ActionRow>(actions: readonly T[], now: number): T | null {
  const due = actions
    .map((a) => ({ a, at: actionDueAt(a, now) }))
    .filter((x): x is { a: T; at: number } => x.at !== null && Boolean(x.a.text))
    .sort((x, y) => (x.a.lastDigestAt ?? 0) - (y.a.lastDigestAt ?? 0) || x.at - y.at);
  return due[0]?.a ?? null;
}
