/* Smoke tests for Firestore security rules.
   Requires the Firebase Emulator Suite running on default ports.
   Run: firebase emulators:start --only firestore
   Then: npm run test:rules
*/

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
