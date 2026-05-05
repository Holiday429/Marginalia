/* Marginalia · Action Reminders — scheduled Cloud Function
   Runs daily. Scans all open/snoozed actions across all users and fires
   tiered reminders at 7 / 30 / 90 days after creation (or after last snooze).

   On each firing:
     - Writes a notification doc to notifications/{uid}/unread/{notifId}
     - Sets the corresponding remindedN flag to true on the action doc

   See ADR 0007 for design rationale (tiers, lifecycle, no auto-deletion).
*/

import * as scheduler from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

// admin.initializeApp() is called once in ai-generate.ts — shared instance.
const db = admin.firestore();

type ReminderTier = 7 | 30 | 90;

interface TierConfig {
  flagField:   'reminded7' | 'reminded30' | 'reminded90';
  atField:     'remind7At' | 'remind30At' | 'remind90At';
  tier:        ReminderTier;
}

const TIERS: TierConfig[] = [
  { tier: 7,  flagField: 'reminded7',  atField: 'remind7At'  },
  { tier: 30, flagField: 'reminded30', atField: 'remind30At' },
  { tier: 90, flagField: 'reminded90', atField: 'remind90At' },
];

export const actionReminders = scheduler.onSchedule(
  { schedule: 'every 24 hours', timeZone: 'UTC' },
  async () => {
    const now = Date.now();

    // CollectionGroup query across all users' action subcollections.
    // Firestore rules allow Admin SDK unrestricted access.
    const openSnap = await db
      .collectionGroup('actions')
      .where('status', 'in', ['open', 'snoozed'])
      .get();

    // Batch writes (max 500 ops per batch — split if needed).
    let batch = db.batch();
    let opCount = 0;

    const flush = async () => {
      if (opCount > 0) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    };

    for (const doc of openSnap.docs) {
      const data = doc.data() as Record<string, unknown>;

      // Extract uid from path: users/{uid}/data/actions/{actionId}
      const pathParts = doc.ref.path.split('/');
      // Path is: users / {uid} / data / actions / {actionId}
      const uid = pathParts[1];
      if (!uid) continue;

      for (const { tier, flagField, atField } of TIERS) {
        const remindAt = data[atField] as number | undefined;
        const alreadyFired = data[flagField] as boolean | undefined;

        if (!remindAt || alreadyFired || remindAt > now) continue;

        // Write notification doc
        const notifRef = db
          .collection(`notifications/${uid}/unread`)
          .doc();

        batch.set(notifRef, {
          type:      'action_reminder',
          tier,
          actionId:  doc.id,
          bookId:    data['bookId'] ?? null,
          text:      data['text']   ?? '',
          createdAt: now,
          read:      false,
        });

        // Mark this tier as fired on the action doc
        batch.update(doc.ref, { [flagField]: true });

        opCount += 2;

        // Flush before hitting the 500-op batch limit
        if (opCount >= 490) await flush();
      }
    }

    await flush();
  },
);
