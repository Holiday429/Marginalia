/* Marginalia · unified analytics facade
   All Sentry and PostHog calls go through here.
   No other file imports posthog-js or @sentry/browser directly.
*/

import * as Sentry from '@sentry/browser';
import posthog from 'posthog-js';
import { ENV } from '../core/env.ts';

let _sentryReady = false;
let _posthogReady = false;

export function initAnalytics(): void {
  if (import.meta.env.PROD && ENV.SENTRY_DSN) {
    Sentry.init({ dsn: ENV.SENTRY_DSN, environment: 'production' });
    _sentryReady = true;
  }

  if (ENV.POSTHOG_KEY) {
    posthog.init(ENV.POSTHOG_KEY, {
      api_host: ENV.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: false,
    });
    _posthogReady = true;
  }
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
  if (_posthogReady) posthog.identify(uid);
  if (_sentryReady) Sentry.setUser({ id: uid });
}
