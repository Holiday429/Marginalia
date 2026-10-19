/* Marginalia · server-side product event for email clicks (plan 2.10, decision Q2.10-c).
   A click in an email has no browser, so no consent banner was shown: the event is sent only for readers
   whose stored choice (users/{uid}.settings.analyticsConsent) is "granted", and only if POSTHOG_KEY is set. */

import type { ClickOutcome } from './actions';

export interface ClickEvent { uid: string; action: string; outcome: ClickOutcome }

export async function reportEmailClick(
  env: NodeJS.ProcessEnv,
  consent: 'granted' | 'denied' | undefined,
  event: ClickEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const key = env.POSTHOG_KEY;
  if (!key || consent !== 'granted') return false;
  const host = (env.POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
  try {
    const res = await fetchImpl(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, event: 'email_action_clicked', distinct_id: event.uid, properties: { action: event.action, outcome: event.outcome } }),
    });
    return res.ok;
  } catch {
    return false; // analytics must never break the click
  }
}
