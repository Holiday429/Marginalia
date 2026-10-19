/* Marginalia · unified analytics facade
   All Sentry and PostHog calls go through here.
   No other file imports posthog-js or @sentry/browser directly.

   Consent-gated: neither SDK is initialised (so no request leaves the browser) until the visitor
   has accepted analytics (see consent.ts). Declining or later withdrawing stops both.
*/

import * as Sentry from '@sentry/browser';
import posthog from 'posthog-js';
import { ENV } from '../core/env.ts';
import { CONSENT_EVENT, getConsent } from './consent.ts';

let _sentryReady = false;
let _posthogReady = false;
let _pendingUid: string | null = null;

function start(): void {
  if (!_sentryReady && import.meta.env.PROD && ENV.SENTRY_DSN) {
    Sentry.init({
      dsn: ENV.SENTRY_DSN,
      environment: 'production',
      // Belt and braces: an event captured after consent was withdrawn is dropped, not sent.
      beforeSend: (event) => (getConsent() === 'granted' ? event : null),
    });
    _sentryReady = true;
  }

  if (!_posthogReady && ENV.POSTHOG_KEY) {
    posthog.init(ENV.POSTHOG_KEY, {
      api_host: ENV.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: false,
      persistence: 'localStorage',
      advanced_disable_feature_flags: true, // we use no feature flags; avoids /flags requests on identify/reset
    });
    _posthogReady = true;
  }

  if (_pendingUid) identifyUser(_pendingUid);
}

function stop(): void {
  if (_posthogReady) {
    posthog.opt_out_capturing();
    posthog.reset();
    _posthogReady = false;
  }
  if (_sentryReady) {
    void Sentry.close(0); // do not flush: nothing more may leave the browser once consent is withdrawn
    _sentryReady = false;
  }
}

/** Starts analytics only if the visitor already accepted; reacts to later choices. */
export function initAnalytics(): void {
  if (getConsent() === 'granted') start();
  window.addEventListener(CONSENT_EVENT, (event) => {
    const choice = (event as CustomEvent<{ choice?: string }>).detail?.choice;
    if (choice === 'granted') start();
    else stop();
  });
}

export function logEvent(name: string, props?: Record<string, unknown>): void {
  if (_posthogReady) posthog.capture(name, props);
}

export function logError(err: unknown, context?: Record<string, unknown>): void {
  if (_sentryReady) {
    Sentry.withScope((scope) => {
      if (context) scope.setExtras(context);
      Sentry.captureException(err);
    });
  }
}

export function identifyUser(uid: string): void {
  _pendingUid = uid; // replayed if consent arrives after sign-in
  if (_posthogReady) posthog.identify(uid);
  if (_sentryReady) Sentry.setUser({ id: uid });
}
