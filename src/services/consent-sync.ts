/* Marginalia · mirror the analytics choice to the account (plan 2.4, decision Q2.10-c).
   A click in the weekly email happens on the server, where no consent banner exists. The server only
   reports that click to PostHog when users/{uid}.settings.analyticsConsent is "granted", so the browser
   writes its choice there whenever it changes and on sign-in.
*/

import { doc, setDoc } from 'firebase/firestore';
import { MarginaliaAuth } from '../firebase/auth.ts';
import { Paths } from '../firebase/paths.ts';
import { logError } from './analytics.ts';
import { CONSENT_EVENT, getConsent } from './consent.ts';

async function mirror(): Promise<void> {
  const choice = getConsent();
  const uid = MarginaliaAuth?.user?.uid;
  const db = MarginaliaAuth?.db;
  if (!choice || !uid || !db) return;
  try {
    await setDoc(doc(db, Paths.user(uid)), { settings: { analyticsConsent: choice } }, { merge: true });
  } catch (err) {
    logError(err, { context: 'consent mirror' });
  }
}

export function startConsentSync(): void {
  window.addEventListener(CONSENT_EVENT, () => { void mirror(); });
  window.addEventListener('marginalia:auth-changed', () => { void mirror(); });
}
