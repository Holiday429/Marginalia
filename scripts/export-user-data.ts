/* ==========================================================================
   Export one user's full data from a Firebase project to a JSON file.
   --------------------------------------------------------------------------
   Usage:
     npx tsx scripts/export-user-data.ts \
       --key=./service-account-dev.json \
       --uid=<your-uid> \
       --workspace=default \
       --out=./data-export-dev-$(date +%Y%m%d).json

   Output JSON shape:
     {
       projectId, workspaceId, uid, exportedAt,
       collections: {
         books:       [{ id, ...doc }],
         highlights:  [{ id, ...doc }],
         actions:     [{ id, ...doc }],
         notes:       [{ id, ...doc }],
         sessions:    [{ id, ...doc }],
         ai_results:  [{ id, ...doc }],
       }
     }
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';

const COLLECTIONS = ['books', 'highlights', 'actions', 'notes', 'sessions', 'ai_results'] as const;

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required arg --${name}=...`);
}

async function main() {
  const keyPath = resolve(arg('key'));
  const uid = arg('uid');
  const workspaceId = arg('workspace', 'default');
  const outPath = resolve(arg('out'));

  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  const projectId = serviceAccount.project_id;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const db = admin.firestore();

  const userPath = `workspaces/${workspaceId}/users/${uid}`;
  console.log(`[export] project=${projectId} user=${userPath}`);

  const collections: Record<string, unknown[]> = {};
  let total = 0;
  for (const name of COLLECTIONS) {
    const snap = await db.collection(`${userPath}/${name}`).get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    collections[name] = docs;
    total += docs.length;
    console.log(`  ${name}: ${docs.length} docs`);
  }

  const payload = {
    projectId,
    workspaceId,
    uid,
    exportedAt: new Date().toISOString(),
    collections,
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`[export] wrote ${total} docs total → ${outPath}`);
}

main().catch(err => {
  console.error('[export] failed:', err);
  process.exit(1);
});
