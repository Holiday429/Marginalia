// Marginalia · analytics event catalogue (plan 2.10).
// One definition for the browser (src/services/events.ts) and Cloud Functions, so the names that
// feed the PostHog funnel and the weekly-active dashboard cannot drift apart.

export interface AnalyticsEventMap {
  /** A new account was created. */
  signup: { method: 'email' | 'google' };
  /** A book was saved. Imports report through `import_completed` instead, not once per book. */
  book_added: { bookId: string; status: string; source: 'manual' };
  /** One import run finished (Kindle today; Goodreads, StoryGraph, WeChat Read, Readwise in 2.5). */
  import_completed: { source: string; books: number; highlights: number };
  /** A highlight was saved. Imports send one event per run with `count`. */
  highlight_saved: { source: 'quick' | 'book' | 'import'; bookId: string | null; count: number };
  /** The reader answered a resurfaced highlight, in the app or from the weekly email. */
  resurface_responded: { rating: 'resonates' | 'thought' | 'action' | 'dismiss'; tier: '7d' | '30d' | '90d' | null; via: 'app' | 'email' };
  /** A button in the weekly email was used (sent from the server; no browser consent exists there). */
  email_action_clicked: { action: string; outcome: 'applied' | 'already_done' | 'expired' | 'invalid' };
  /** A reading session ended. */
  session_completed: { bookId: string | null; durationMs: number };
  /** A book moved into "finished" from another status. */
  book_finished: { bookId: string };
  /** An AI generation completed. */
  ai_generated: { featureId: string; provider?: string; model?: string };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

/** The ten events plan 2.10 requires. The PostHog funnel and retention definitions are built from these. */
export const CORE_EVENTS = [
  'signup',
  'book_added',
  'import_completed',
  'highlight_saved',
  'resurface_responded',
  'email_action_clicked',
  'session_completed',
  'book_finished',
  'ai_generated',
] as const satisfies readonly AnalyticsEventName[];

/**
 * "Active in a week" for the retention dashboard: the reader did something that feeds the loop
 * (saved a highlight, answered a resurfaced one, finished a book or a session) rather than merely
 * opening the app. This is the same bar the phase-2 gate uses.
 */
export const ACTIVE_EVENTS = [
  'highlight_saved',
  'resurface_responded',
  'session_completed',
  'book_finished',
] as const satisfies readonly AnalyticsEventName[];

/** Signup → first book → first highlight → first finished book. */
export const FUNNEL_EVENTS = ['signup', 'book_added', 'highlight_saved', 'book_finished'] as const satisfies readonly AnalyticsEventName[];
