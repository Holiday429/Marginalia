/* Plan 1.8: after deleting a test account no document under that uid remains and the Auth user is
   gone; other users are untouched; a renewing subscription blocks deletion. Needs both emulators:
   firebase emulators:exec --only auth,firestore "npm run test:rules" */
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll } from 'vitest';
import { AccountDeleteError, deleteAccountData, hasRenewingSubscription, type DeleteDeps } from '../src/delete-account';

const requireFromFunctions = createRequire(new URL('../package.json', import.meta.url));
const emulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const WS = 'default';

describe.skipIf(!emulators)('deleteAccountData against the emulators', () => {
  let admin: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const storageDeleted: string[] = [];

  beforeAll(() => {
    admin = requireFromFunctions('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-marginalia' });
    db = admin.firestore();
  });

  const deps = (): DeleteDeps => ({
    workspaceId: WS,
    db,
    getEmail: async (uid) => (await admin.auth().getUser(uid).catch(() => null))?.email ?? null,
    deleteStoragePrefix: async (prefix) => { storageDeleted.push(prefix); },
    deleteAuthUser: (uid) => admin.auth().deleteUser(uid),
  });

  /** Every document path in the database (including "missing" docs that only hold sub-collections). */
  async function allPaths(): Promise<string[]> {
    const out: string[] = [];
    const walkDoc = async (docRef: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      out.push(docRef.path);
      for (const col of await docRef.listCollections()) await walkCol(col);
    };
    const walkCol = async (col: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const d of await col.listDocuments()) await walkDoc(d);
    };
    for (const col of await db.listCollections()) await walkCol(col);
    return out;
  }

  async function seedUser(uid: string, email: string) {
    await admin.auth().createUser({ uid, email, password: 'correct-horse-1' });
    const set = (path: string, data: object) => db.doc(path).set(data);
    await set(`users/${uid}`, { settings: { slug: `slug-${uid}`, profilePublic: true }, avatarUrl: 'data:,x', publishedSlug: `slug-${uid}` });
    await set(`users/${uid}/rateLimits/ai`, { callTimestamps: [1] });
    await set(`billing/${uid}`, { plan: 'free', status: 'none' });
    await set(`usage/${uid}/months/2026-10`, { aiCalls: 3 });
    await set(`publicProfiles/slug-${uid}`, { uid, displayName: 'X' });
    await set(`workspaces/${WS}/userProfiles/${uid}`, { uid, email });
    await set(`workspaces/${WS}/notifications/${uid}/unread/n1`, { text: 'hi' });
    await set(`workspaces/${WS}/users/${uid}/books/b1`, { title: 'T' });
    await set(`workspaces/${WS}/users/${uid}/books/b1/notes/main`, { content: 'secret note' });
    await set(`workspaces/${WS}/users/${uid}/books/b1/sessions/s0`, { startedAt: 1 });
    await set(`workspaces/${WS}/users/${uid}/highlights/h1`, { bookId: 'b1', quote: 'q' });
    await set(`workspaces/${WS}/users/${uid}/actions/a1`, { bookId: 'b1', text: 'do' });
    await set(`workspaces/${WS}/users/${uid}/sessions/s1`, { startedAt: 1, bookId: '' });
    await set(`workspaces/${WS}/users/${uid}/ai_results/mindmap-gen`, { original: {} });
    await set(`workspaces/${WS}/users/${uid}/data/library_layout`, { shelves: [] });
    await set(`audit/ai_calls/${uid}/1700000000000`, { featureId: 'mindmap-gen' });
    await set(`billing_orphans/mine-${uid}`, { userEmail: email, event: 'subscription_created' });
    await set(`billing_orphans/stranger-${uid.replace(/\D/g, '')}`, { userEmail: 'someone-else@example.com', event: 'subscription_created' });
  }

  it('removes every trace of the user, keeps other users, and the Auth user is gone', async () => {
    const uid = `del-${Date.now()}`;
    const other = `keep-${Date.now()}`;
    await seedUser(uid, `${uid}@example.com`);
    await seedUser(other, `${other}@example.com`);
    expect((await allPaths()).filter((p) => p.includes(uid)).length).toBeGreaterThan(10);

    const done = await deleteAccountData(deps(), uid);

    const left = (await allPaths()).filter((p) => p.includes(uid));
    expect(left, `documents still under ${uid}`).toEqual([]);
    await expect(admin.auth().getUser(uid)).rejects.toMatchObject({ code: 'auth/user-not-found' });
    expect(storageDeleted).toContain(`workspaces/${WS}/users/${uid}/`);
    expect(done).toContain('auth');

    // The other user and unrelated support records are untouched.
    expect((await allPaths()).filter((p) => p.includes(other)).length).toBeGreaterThan(10);
    await expect(admin.auth().getUser(other)).resolves.toMatchObject({ uid: other });
    expect((await db.doc(`billing_orphans/mine-${uid}`).get()).exists).toBe(false);
    expect((await db.doc(`billing_orphans/stranger-${uid.replace(/\D/g, '')}`).get()).exists).toBe(true);
    expect((await db.doc(`billing_orphans/mine-${other}`).get()).exists).toBe(true);
  });

  it('is idempotent: running it again after a partial failure still succeeds', async () => {
    const uid = `retry-${Date.now()}`;
    await seedUser(uid, `${uid}@example.com`);
    await deleteAccountData({ ...deps(), deleteAuthUser: async () => { throw new Error('auth down'); } }, uid).catch(() => undefined);
    expect((await allPaths()).filter((p) => p.includes(uid))).toEqual([]);
    await admin.auth().getUser(uid); // still signed-in-able: the Auth user is removed last
    await deleteAccountData(deps(), uid);
    await expect(admin.auth().getUser(uid)).rejects.toMatchObject({ code: 'auth/user-not-found' });
  });

  it('refuses while a subscription is still renewing and deletes nothing', async () => {
    const uid = `sub-${Date.now()}`;
    await seedUser(uid, `${uid}@example.com`);
    await db.doc(`billing/${uid}`).set({ plan: 'pro', subscriptionPlan: 'pro', subscriptionStatus: 'active', cancelAtPeriodEnd: false, customerPortalUrl: 'https://portal.example/x' });
    await expect(deleteAccountData(deps(), uid)).rejects.toMatchObject({ code: 'subscription-active', portalUrl: 'https://portal.example/x' });
    expect((await db.doc(`workspaces/${WS}/users/${uid}/books/b1`).get()).exists).toBe(true);
    await expect(admin.auth().getUser(uid)).resolves.toBeDefined();
    // Once cancelled (no further charges) deletion goes through.
    await db.doc(`billing/${uid}`).set({ plan: 'pro', subscriptionPlan: 'pro', subscriptionStatus: 'cancelled', cancelAtPeriodEnd: true });
    await deleteAccountData(deps(), uid);
    expect((await allPaths()).filter((p) => p.includes(uid))).toEqual([]);
  });
});

describe('hasRenewingSubscription', () => {
  it('only blocks subscriptions that will charge again', () => {
    expect(hasRenewingSubscription(undefined)).toBe(false);
    expect(hasRenewingSubscription({ plan: 'free' })).toBe(false);
    expect(hasRenewingSubscription({ plan: 'lifetime', lifetimeActive: true })).toBe(false);
    expect(hasRenewingSubscription({ subscriptionPlan: 'pro', subscriptionStatus: 'active', cancelAtPeriodEnd: false })).toBe(true);
    expect(hasRenewingSubscription({ subscriptionPlan: 'pro', subscriptionStatus: 'past_due', cancelAtPeriodEnd: false })).toBe(true);
    expect(hasRenewingSubscription({ subscriptionPlan: 'pro', subscriptionStatus: 'cancelled', cancelAtPeriodEnd: true })).toBe(false);
    expect(hasRenewingSubscription({ subscriptionPlan: 'free', subscriptionStatus: 'expired' })).toBe(false);
  });
  it('AccountDeleteError carries the portal link', () => {
    expect(new AccountDeleteError('subscription-active', 'x', 'https://p').portalUrl).toBe('https://p');
  });
});
