/* ==========================================================================
   Migration 001 — billing fields leave users/{uid}
   --------------------------------------------------------------------------
   For every users/{uid} doc:
     1. writes billing/{uid} = free, unless the uid is in the paid list
        (the old users.plan value is NOT trusted: clients could write it);
     2. deletes plan / entitlements / quota from users/{uid};
     3. if settings.profilePublic && settings.slug, creates publicProfiles/{slug}
        so existing public profile links keep working.
   Nothing else is deleted. Dry run unless --apply is passed.

   Usage (dev first, production only by the owner):
     npx tsx scripts/migrations/001-billing.ts --project=<id> [--paid=paid.json] [--apply]
   paid.json: { "<uid>": "pro" | "lifetime", ... }   (the owner's own list of paying users)
   Emulator: set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and use any --project.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type PaidPlan = 'pro' | 'lifetime';
type UserData = Record<string, any>;

export interface UserPlan {
  billing: { plan: 'free' | PaidPlan; status: string; provider: string };
  deleteFields: string[];
  publicCard: Record<string, unknown> | null;
}

const LEGACY_FIELDS = ['plan', 'entitlements', 'quota'];

/** Pure planning step, unit-testable without Firestore. */
export function planUser(uid: string, data: UserData, paid: Record<string, PaidPlan>): UserPlan {
  const plan = paid[uid] ?? 'free';
  const settings = data.settings ?? {};
  const slug = String(settings.slug ?? '').trim().toLowerCase();
  const isPublic = settings.profilePublic === true && slug.length > 0;
  const card = isPublic
    ? {
        uid,
        slug,
        displayName: String(data.displayName || settings.username || slug),
        ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
        ...(settings.bio ? { bio: settings.bio } : {}),
        ...(settings.location?.city ? { location: settings.location.city } : {}),
        sections: settings.profileSections ?? {},
      }
    : null;
  return {
    billing: { plan, status: plan === 'free' ? 'none' : 'active', provider: plan === 'free' ? 'none' : 'manual-migration' },
    deleteFields: LEGACY_FIELDS.filter((f) => f in data),
    publicCard: card,
  };
}

async function main() {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const projectId = arg('project');
  if (!projectId) throw new Error('Missing --project=<firebase project id>');
  const apply = process.argv.includes('--apply');
  const paid: Record<string, PaidPlan> = arg('paid') ? JSON.parse(readFileSync(resolve(arg('paid')!), 'utf8')) : {};

  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const admin = createRequire(resolve(root, 'functions/package.json'))('firebase-admin');
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { FieldValue } = admin.firestore;

  const users = await db.collection('users').get();
  const summary = { users: users.size, paid: 0, deletedLegacyFields: 0, publicCards: 0, skippedExisting: 0 };

  for (const snap of users.docs) {
    const uid = snap.id;
    const p = planUser(uid, snap.data(), paid);
    if (p.billing.plan !== 'free') summary.paid++;
    summary.deletedLegacyFields += p.deleteFields.length;

    const billingRef = db.doc(`billing/${uid}`);
    if ((await billingRef.get()).exists) {
      summary.skippedExisting++; // never overwrite state written by the webhook
    } else if (apply) {
      await billingRef.set({ ...p.billing, updatedAt: FieldValue.serverTimestamp() });
    }

    if (apply && p.deleteFields.length) {
      await snap.ref.update(Object.fromEntries(p.deleteFields.map((f) => [f, FieldValue.delete()])));
    }

    if (p.publicCard) {
      const slug = p.publicCard.slug as string;
      const cardRef = db.doc(`publicProfiles/${slug}`);
      const existing = await cardRef.get();
      if (existing.exists && existing.data()?.uid !== uid) {
        console.warn(`slug "${slug}" already claimed by another uid; skipping uid=${uid}`);
      } else {
        summary.publicCards++;
        if (apply) {
          await cardRef.set({ ...p.publicCard, updatedAt: FieldValue.serverTimestamp() });
          await snap.ref.set({ publishedSlug: slug }, { merge: true });
        }
      }
    }
  }

  console.log(JSON.stringify({ projectId, mode: apply ? 'APPLIED' : 'DRY RUN', ...summary }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
