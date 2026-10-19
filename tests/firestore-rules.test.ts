/* Smoke tests for Firestore security rules.
   Requires the Firebase Emulator Suite running on default ports.
   Run: firebase emulators:start --only firestore
   Then: npm run test:rules
*/

import { describe, it, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'marginalia-rules-test';
const WORKSPACE_ID = 'ws1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore rules — cross-user isolation', () => {
  const uidA = 'user-a';
  const uidB = 'user-b';
  const bookPath = `workspaces/${WORKSPACE_ID}/users/${uidA}/books/book1`;

  it('user A can read their own book', async () => {
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertSucceeds(db.doc(bookPath).get());
  });

  it('user B cannot read user A books', async () => {
    const db = testEnv.authenticatedContext(uidB).firestore();
    await assertFails(db.doc(bookPath).get());
  });

  it('unauthenticated read is denied', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc(bookPath).get());
  });
});

describe('Firestore rules — library layout', () => {
  const uidA = 'user-a';
  const uidB = 'user-b';
  const layoutPath = `workspaces/${WORKSPACE_ID}/users/${uidA}/data/library_layout`;

  it('owner can write and read their layout', async () => {
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertSucceeds(db.doc(layoutPath).set({ shelves: [] }));
    await assertSucceeds(db.doc(layoutPath).get());
  });

  it("another user cannot read or write someone else's layout", async () => {
    const db = testEnv.authenticatedContext(uidB).firestore();
    await assertFails(db.doc(layoutPath).get());
    await assertFails(db.doc(layoutPath).set({ shelves: [] }));
  });
});

describe('Firestore rules — highlights', () => {
  const uidA = 'user-a';
  const uidB = 'user-b';
  const hlPath = `workspaces/${WORKSPACE_ID}/users/${uidA}/highlights/hl1`;

  it('owner can write, read and delete a highlight', async () => {
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertSucceeds(db.doc(hlPath).set({ bookId: 'b1', quote: 'q' }));
    await assertSucceeds(db.doc(hlPath).get());
    await assertSucceeds(db.doc(hlPath).delete());
  });

  it("another user cannot read or write someone else's highlights", async () => {
    const db = testEnv.authenticatedContext(uidB).firestore();
    await assertFails(db.doc(hlPath).get());
    await assertFails(db.doc(hlPath).set({ bookId: 'b1', quote: 'q' }));
  });
});

describe('Firestore rules — billing fields (1.1)', () => {
  const uidA = 'user-a';
  const uidB = 'user-b';

  it('owner cannot write plan, entitlements or quota on users/{uid}', async () => {
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertFails(db.doc(`users/${uidA}`).set({ plan: 'pro' }, { merge: true }));
    await assertFails(db.doc(`users/${uidA}`).set({ entitlements: ['ai.unlimited'] }, { merge: true }));
    await assertFails(db.doc(`users/${uidA}`).set({ quota: { aiCreditsRemaining: 9999 } }, { merge: true }));
    await assertFails(db.doc(`users/${uidA}`).set({ plan: 'lifetime', settings: {} }));
  });

  it('owner cannot update plan on an existing users/{uid}', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${uidA}`).set({ settings: { language: 'en' } });
    });
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertFails(db.doc(`users/${uidA}`).update({ plan: 'pro' }));
    await assertSucceeds(db.doc(`users/${uidA}`).set({ settings: { language: 'zh-CN' } }, { merge: true }));
  });

  it('owner can write ordinary settings and avatar', async () => {
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertSucceeds(db.doc(`users/${uidA}`).set({ avatarUrl: 'data:,x', settings: { slug: 'a' } }, { merge: true }));
  });

  it('owner cannot write billing/{uid}; server (rules disabled) can', async () => {
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertFails(db.doc(`billing/${uidA}`).set({ plan: 'pro' }));
    await assertFails(db.doc(`billing/${uidA}`).update({ plan: 'pro' }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`billing/${uidA}`).set({ plan: 'free', status: 'none' });
    });
  });

  it('owner can read their own billing; another user cannot; anonymous cannot', async () => {
    await assertSucceeds(testEnv.authenticatedContext(uidA).firestore().doc(`billing/${uidA}`).get());
    await assertFails(testEnv.authenticatedContext(uidB).firestore().doc(`billing/${uidA}`).get());
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(`billing/${uidA}`).get());
  });

  it('usage counters are readable by the owner only and never client-writable', async () => {
    const path = `usage/${uidA}/months/2026-10`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(path).set({ aiCalls: 3 });
    });
    await assertSucceeds(testEnv.authenticatedContext(uidA).firestore().doc(path).get());
    await assertFails(testEnv.authenticatedContext(uidB).firestore().doc(path).get());
    await assertFails(testEnv.authenticatedContext(uidA).firestore().doc(path).set({ aiCalls: 0 }));
  });
});

describe('Firestore rules — users/{uid} privacy and publicProfiles (1.1)', () => {
  const uidA = 'user-a';
  const uidB = 'user-b';

  it('unauthenticated and other users cannot read users/{uid}, even when the profile is public', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${uidA}`).set({ email: 'a@example.com', settings: { profilePublic: true, slug: 'ada' } });
    });
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(`users/${uidA}`).get());
    await assertFails(testEnv.authenticatedContext(uidB).firestore().doc(`users/${uidA}`).get());
    await assertSucceeds(testEnv.authenticatedContext(uidA).firestore().doc(`users/${uidA}`).get());
  });

  it('users collection cannot be queried by slug from the client', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('users').where('settings.slug', '==', 'ada').limit(1).get());
  });

  it('unauthenticated visitors can read publicProfiles/{slug}', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('publicProfiles/ada').set({ uid: uidA, displayName: 'Ada' });
    });
    await assertSucceeds(testEnv.unauthenticatedContext().firestore().doc('publicProfiles/ada').get());
  });

  it('owner can publish a profile under a free slug; others cannot take or edit it', async () => {
    const a = testEnv.authenticatedContext(uidA).firestore();
    const b = testEnv.authenticatedContext(uidB).firestore();
    await assertSucceeds(a.doc('publicProfiles/ada-reads').set({ uid: uidA, displayName: 'Ada' }));
    await assertSucceeds(a.doc('publicProfiles/ada-reads').set({ uid: uidA, displayName: 'Ada L.' }));
    await assertFails(b.doc('publicProfiles/ada-reads').set({ uid: uidB, displayName: 'Mallory' }));
    await assertFails(b.doc('publicProfiles/ada-reads').set({ uid: uidA, displayName: 'Mallory' }));
    await assertFails(b.doc('publicProfiles/ada-reads').delete());
    await assertSucceeds(a.doc('publicProfiles/ada-reads').delete());
  });

  it('publicProfiles rejects foreign uid, extra fields, bad and reserved slugs', async () => {
    const a = testEnv.authenticatedContext(uidA).firestore();
    await assertFails(a.doc('publicProfiles/nice-slug').set({ uid: uidB, displayName: 'x' }));
    await assertFails(a.doc('publicProfiles/nice-slug').set({ uid: uidA, displayName: 'x', email: 'a@example.com' }));
    await assertFails(a.doc('publicProfiles/nice-slug').set({ uid: uidA, displayName: 'x', plan: 'pro' }));
    await assertFails(a.doc('publicProfiles/Bad_Slug').set({ uid: uidA, displayName: 'x' }));
    await assertFails(a.doc('publicProfiles/admin').set({ uid: uidA, displayName: 'x' }));
    await assertFails(testEnv.unauthenticatedContext().firestore().doc('publicProfiles/anon').set({ uid: uidA }));
  });
});

describe('Firestore rules — reading sessions (1.4)', () => {
  const uidA = 'user-a';
  const uidB = 'user-b';
  const path = `workspaces/${WORKSPACE_ID}/users/${uidA}/sessions/s1`;

  it('owner can create, finish and read a session', async () => {
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertSucceeds(db.doc(path).set({ bookId: '', startedAt: 1000, endedAt: null, durationMs: null }));
    await assertSucceeds(db.doc(path).set({ bookId: '', startedAt: 1000, endedAt: 4000, durationMs: 3000 }, { merge: true }));
    await assertSucceeds(db.doc(path).get());
  });

  it('another user cannot read or write it', async () => {
    const db = testEnv.authenticatedContext(uidB).firestore();
    await assertFails(db.doc(path).get());
    await assertFails(db.doc(path).set({ bookId: '', startedAt: 1, durationMs: 1 }, { merge: true }));
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(path).get());
  });

  it('rejects a session without a numeric startedAt and refuses to rewrite startedAt', async () => {
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertFails(db.doc(`workspaces/${WORKSPACE_ID}/users/${uidA}/sessions/bad`).set({ bookId: '' }));
    await assertFails(db.doc(path).set({ startedAt: 5 }, { merge: true }));
  });

  it('legacy users/{uid}/data/* paths are not writable', async () => {
    // The old code built a 4-segment collection path (invalid in the SDK); nothing under users/{uid}/data is allowed.
    const db = testEnv.authenticatedContext(uidA).firestore();
    await assertFails(db.doc(`users/${uidA}/data/s1`).set({ startedAt: 1 }));
  });
});
