// Marginalia · analytics consent.
// Nothing is sent to PostHog or Sentry until the visitor agrees. The choice lives in localStorage
// (per browser) and changes are broadcast so analytics can start or stop without a reload.

export type ConsentChoice = 'granted' | 'denied' | null;

const KEY = 'marginalia:consent';
export const CONSENT_EVENT = 'marginalia:consent-changed';

export function getConsent(): ConsentChoice {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'granted' || raw === 'denied' ? raw : null;
  } catch {
    return null; // storage blocked (private window): treated as "not asked yet", never as consent
  }
}

export function setConsent(choice: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch { /* the choice still applies for this page view via the event below */ }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { choice } }));
}
