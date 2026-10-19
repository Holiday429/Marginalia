/* Real-Firestore check of the quota transaction. Runs only under the emulator:
   firebase emulators:exec --only firestore "npm run test:rules" */
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll } from 'vitest';
import { monthKey, releaseAiCall, reserveAiCall } from '../src/ai-quota';
import { FREE_AI_MONTHLY } from '../src/ai-config';

const requireFromFunctions = createRequire(new URL('../package.json', import.meta.url));
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!emulator)('quota against the Firestore emulator', () => {
  let db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  beforeAll(() => {
    const admin = requireFromFunctions('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-marginalia' });
    db = admin.firestore();
  });

  it('free user: 10 reservations succeed, the 11th is refused; release gives a slot back', async () => {
    const uid = `quota-${Date.now()}`;
    for (let i = 0; i < FREE_AI_MONTHLY; i++) expect((await reserveAiCall(db, uid)).ok).toBe(true);
    expect(await reserveAiCall(db, uid)).toMatchObject({ ok: false, used: FREE_AI_MONTHLY, limit: FREE_AI_MONTHLY });
    expect((await db.doc(`usage/${uid}/months/${monthKey()}`).get()).data().aiCalls).toBe(FREE_AI_MONTHLY);

    await releaseAiCall(db, uid, monthKey());
    expect((await reserveAiCall(db, uid)).ok).toBe(true);
  });

  it('parallel reservations never exceed the limit', async () => {
    const uid = `quota-par-${Date.now()}`;
    const results = await Promise.all(Array.from({ length: FREE_AI_MONTHLY + 2 }, () => reserveAiCall(db, uid)));
    expect(results.filter((r) => r.ok)).toHaveLength(FREE_AI_MONTHLY);
  }, 60_000);
});
