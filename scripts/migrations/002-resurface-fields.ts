/* ==========================================================================
   Migration 002 — review schedule for existing highlights (plan 2.4)
   --------------------------------------------------------------------------
   Highlights saved before the spaced-resurface feature have no schedule, so they would never come back.
   For every highlight without `resurface7At` this writes the three review moments and the three
   "answered" flags, with the first moment spread over the next 7 days by highlight id (so a big library
   does not become hundreds of things due on one day). Nothing is deleted or overwritten: highlights that
   already have a schedule are left alone. Dry run unless --apply is passed.

   Usage (dev first, production only by the owner):
     npx tsx scripts/migrations/002-resurface-fields.ts --project=<id> [--apply]
   Emulator: set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and use any --project.
   ========================================================================== */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backfillSchedule, type ResurfaceFields } from '../../shared/resurface.ts';

/** Pure planning step: the fields to add to one highlight document, or null when it already has a schedule. */
export function planHighlight(id: string, data: Record<string, unknown>, now: number): ResurfaceFields | null {
  if (typeof data.resurface7At === 'number') return null;
  if (typeof data.quote !== 'string' || !data.quote.trim()) return null; // nothing to resurface
  return backfillSchedule(id, now);
}

async function main() {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const projectId = arg('project');
  if (!projectId) throw new Error('Missing --project=<firebase project id>');
  const apply = process.argv.includes('--apply');

  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const admin = createRequire(resolve(root, 'functions/package.json'))('firebase-admin');
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { FieldValue } = admin.firestore;

  const now = Date.now();
  const snap = await db.collectionGroup('highlights').get();
  const summary = { highlights: snap.size, scheduled: 0, alreadyScheduled: 0, skippedEmpty: 0 };
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    // Only the per-user highlight collection: workspaces/{ws}/users/{uid}/highlights/{id}
    if (!/^workspaces\/[^/]+\/users\/[^/]+\/highlights\/[^/]+$/.test(doc.ref.path)) continue;
    const data = doc.data();
    const plan = planHighlight(doc.id, data, now);
    if (!plan) {
      if (typeof data.resurface7At === 'number') summary.alreadyScheduled++; else summary.skippedEmpty++;
      continue;
    }
    summary.scheduled++;
    if (!apply) continue;
    batch.set(doc.ref, { ...plan, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    ops += 1;
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (apply && ops) await batch.commit();

  console.log(JSON.stringify({ projectId, mode: apply ? 'APPLIED' : 'DRY RUN', ...summary }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
