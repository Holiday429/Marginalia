/* Marginalia · account deletion (callable).
   Deletes everything the app stores for the signed-in user — Firestore, Storage files, the Auth
   user — after refusing while a subscription is still renewing (the user must cancel it first, or
   they would keep being charged). Every step is idempotent, so a failed run can simply be retried:
   the Auth user is removed last, so the user can still sign in to retry.

   Call: deleteAccount({ confirm: 'DELETE' }) → { ok: true, deleted: string[] } */

import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { AuditPaths, DEFAULT_WORKSPACE_ID, Paths, WsPaths } from './_shared/paths';
import { allowedOrigins } from './ai-config';

export class AccountDeleteError extends Error {
  constructor(public code: 'subscription-active', message: string, public portalUrl?: string | null) {
    super(message);
  }
}

/** The slice of Firestore / Auth / Storage the deletion needs (admin SDK satisfies it; tests fake it). */
export interface DeleteDeps {
  workspaceId: string;
  db: {
    doc(path: string): { get(): Promise<{ exists: boolean; data(): Record<string, any> | undefined }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    collection(path: string): {
      where(field: string, op: '==', value: unknown): { get(): Promise<{ docs: Array<{ ref: unknown }> }> };
    } & unknown;
    recursiveDelete(ref: unknown): Promise<void>;
  };
  getEmail(uid: string): Promise<string | null>;
  deleteStoragePrefix(prefix: string): Promise<void>;
  deleteAuthUser(uid: string): Promise<void>;
}

/** A subscription that will charge again: active / trial / past_due and not set to cancel. */
export function hasRenewingSubscription(billing: Record<string, any> | undefined): boolean { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!billing || billing.subscriptionPlan !== 'pro') return false;
  if (billing.cancelAtPeriodEnd === true) return false;
  return ['active', 'on_trial', 'past_due'].includes(String(billing.subscriptionStatus ?? billing.status));
}

export async function deleteAccountData(deps: DeleteDeps, uid: string): Promise<string[]> {
  const { db, workspaceId: ws } = deps;
  const done: string[] = [];

  const billing = await db.doc(Paths.billing(uid)).get();
  if (hasRenewingSubscription(billing.data())) {
    throw new AccountDeleteError(
      'subscription-active',
      'Cancel your subscription first, then delete your account.',
      billing.data()?.customerPortalUrl ?? null,
    );
  }

  const email = await deps.getEmail(uid);

  // Public profile cards owned by this uid (the current slug and any stale one).
  const cards = await db.collection(Paths.publicProfiles()).where('uid', '==', uid).get();
  for (const card of cards.docs) { await db.recursiveDelete(card.ref); done.push('publicProfiles'); }

  // Support records that only carry the email (webhook events that could not be mapped to a uid).
  if (email) {
    const orphans = await db.collection(Paths.billingOrphans()).where('userEmail', '==', email).get();
    for (const o of orphans.docs) { await db.recursiveDelete(o.ref); done.push('billing_orphans'); }
  }

  const targets: Array<[string, unknown]> = [
    [WsPaths.user(ws, uid), db.doc(WsPaths.user(ws, uid))],
    [WsPaths.userProfile(ws, uid), db.doc(WsPaths.userProfile(ws, uid))],
    [WsPaths.notificationsRoot(ws, uid), db.doc(WsPaths.notificationsRoot(ws, uid))],
    [Paths.user(uid), db.doc(Paths.user(uid))],
    [Paths.billing(uid), db.doc(Paths.billing(uid))],
    [Paths.usageMonths(uid), db.collection(Paths.usageMonths(uid))],
    [AuditPaths.aiCalls(uid), db.collection(AuditPaths.aiCalls(uid))],
  ];
  for (const [label, ref] of targets) {
    await db.recursiveDelete(ref);
    done.push(label.split(uid).join('{uid}'));
  }

  await deps.deleteStoragePrefix(WsPaths.storagePrefix(ws, uid));
  done.push('storage');
  await deps.deleteAuthUser(uid);
  done.push('auth');
  return done;
}

export const deleteAccount = functions.onCall({ cors: allowedOrigins() }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.HttpsError('unauthenticated', 'Sign in required.');
  if (request.data?.confirm !== 'DELETE') {
    throw new functions.HttpsError('invalid-argument', 'Confirmation text is required.');
  }

  const db = admin.firestore();
  try {
    const deleted = await deleteAccountData({
      workspaceId: process.env.WORKSPACE_ID || DEFAULT_WORKSPACE_ID,
      db: db as unknown as DeleteDeps['db'],
      getEmail: async (id) => (await admin.auth().getUser(id).catch(() => null))?.email ?? null,
      deleteStoragePrefix: (prefix) => admin.storage().bucket().deleteFiles({ prefix, force: true }).then(() => undefined),
      deleteAuthUser: (id) => admin.auth().deleteUser(id).catch((e: { code?: string }) => {
        if (e.code !== 'auth/user-not-found') throw e; // already gone: fine
      }),
    }, uid);
    return { ok: true, deleted };
  } catch (e) {
    if (e instanceof AccountDeleteError) {
      throw new functions.HttpsError('failed-precondition', e.message, { code: e.code, portalUrl: e.portalUrl ?? null });
    }
    throw e;
  }
});
