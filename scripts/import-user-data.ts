/* ==========================================================================
   Import a previously-exported JSON file into a Firebase project.
   --------------------------------------------------------------------------
   Usage:
     npx tsx scripts/import-user-data.ts \
       --key=./service-account-prod.json \
       --uid=<target-uid-in-target-project> \
       --workspace=default \
       --in=./data-export-dev-20260520.json \
       [--collections=books,highlights]      # optional filter
       [--dry-run]                            # preview only, no writes

   Notes:
     - Target uid must exist in the target project. Create it by signing in
       once via the app to that project first.
     - Existing docs with the same id are MERGED, not overwritten.
     - To wipe before import, manually delete the user's collections in the
       Firebase Console first.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (process.argv.includes(`--${name}`)) return 'true';
  return fallback;
}

const BATCH_LIMIT = 400;

async function main() {
  const keyPath = resolve(arg('key') || (() => { throw new Error('--key required'); })());
  const uid = arg('uid') || (() => { throw new Error('--uid required'); })();
  const workspaceId = arg('workspace') || 'default';
  const inPath = resolve(arg('in') || (() => { throw new Error('--in required'); })());
  const filter = (arg('collections') || '').split(',').map(s => s.trim()).filter(Boolean);
  const dryRun = Boolean(arg('dry-run'));

  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  const targetProjectId = serviceAccount.project_id;
  const payload = JSON.parse(readFileSync(inPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const db = admin.firestore();

  const userPath = `workspaces/${workspaceId}/users/${uid}`;
  console.log(`[import] source export from project=${payload.projectId} uid=${payload.uid}`);
  console.log(`[import] target project=${targetProjectId} user=${userPath}`);
  if (dryRun) console.log(`[import] DRY RUN — no writes`);

  const collections = payload.collections || {};
  let totalWrites = 0;
  for (const [name, docs] of Object.entries(collections)) {
    if (filter.length && !filter.includes(name)) continue;
    const list = docs as Array<Record<string, unknown> & { id: string }>;
    if (!list.length) continue;

    console.log(`  ${name}: ${list.length} docs`);
    if (dryRun) { totalWrites += list.length; continue; }

    // Chunk writes into batches of <= 400 (Firestore limit is 500).
    for (let i = 0; i < list.length; i += BATCH_LIMIT) {
      const slice = list.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const doc of slice) {
        const { id, ...data } = doc;
        const ref = db.collection(`${userPath}/${name}`).doc(id);
        batch.set(ref, data, { merge: true });
      }
      await batch.commit();
      totalWrites += slice.length;
    }
  }

  console.log(`[import] ${dryRun ? 'would write' : 'wrote'} ${totalWrites} docs total`);
}

main().catch(err => {
  console.error('[import] failed:', err);
  process.exit(1);
});
