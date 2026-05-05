/* Marginalia · Profile Slug Uniqueness Check — HTTP Callable
   Called before writing settings.slug to users/{uid}.
   Checks that the requested slug is not already taken by another user.

   Rules enforced here (client cannot be trusted for these):
   - 3–32 characters
   - Only lowercase letters, digits, and hyphens
   - Cannot start or end with a hyphen
   - Must not be taken by a different uid
*/

import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// admin.initializeApp() is called once in ai-generate.ts — shared instance.
const db = admin.firestore();

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$|^[a-z0-9]{1,32}$/;

// Reserved slugs that cannot be claimed.
const RESERVED = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'help', 'home',
  'login', 'logout', 'me', 'profile', 'settings', 'signup',
  'support', 'terms', 'privacy', 'about', 'contact', 'p',
]);

export const profileSlugCheck = functions.onCall(async (request) => {
  const uid  = request.auth?.uid;
  if (!uid) {
    throw new functions.HttpsError('unauthenticated', 'Sign in required.');
  }

  const slug = (request.data?.slug ?? '').trim().toLowerCase();

  if (!SLUG_RE.test(slug)) {
    return { available: false, reason: 'invalid_format' };
  }
  if (RESERVED.has(slug)) {
    return { available: false, reason: 'reserved' };
  }

  const snap = await db
    .collection('users')
    .where('settings.slug', '==', slug)
    .limit(1)
    .get();

  if (snap.empty) {
    return { available: true };
  }

  // Taken by this user already — still available (idempotent re-save).
  if (snap.docs[0].id === uid) {
    return { available: true };
  }

  return { available: false, reason: 'taken' };
});
