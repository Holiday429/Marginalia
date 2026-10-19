/* Marginalia · weekly digest run (plan 2.4).
   For every reader who turned the weekly email on and whose chosen weekday is today, build the digest
   (up to three highlights due for another look plus one due action). Nothing due means no email. A reader
   is never emailed twice in five days. The email sender is injected, so tests and local runs use the mock.
*/

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { Paths, WsPaths } from '../_shared/paths';
import { buildDigestContent, isEmpty, type ActionRow, type HighlightRow } from './build';
import { buildDigestEmail, type DigestLinks } from './email';
import { LINK_TTL_MS, UNSUBSCRIBE_TTL_MS, newTokenId, signLink } from './tokens';
import type { DigestPrefs, EmailSender, LinkPayload } from './types';

const DAY_MS = 86_400_000;
export const MIN_DAYS_BETWEEN_EMAILS = 5;

export interface DigestRunDeps {
  db: Firestore;
  workspaceId: string;
  sender: EmailSender;
  linkSecret: string;
  /** Public URL of the emailAction function, e.g. https://<region>-<project>.cloudfunctions.net/emailAction */
  actionBaseUrl: string;
  /** Public URL of the web app. */
  appBaseUrl: string;
  postalAddress?: string;
  getEmail(uid: string): Promise<string | null>;
}

export interface DigestSummary {
  considered: number;
  sent: number;
  skippedNotToday: number;
  skippedRecently: number;
  skippedNothingDue: number;
  skippedNoEmail: number;
  failed: number;
  /** ids of the readers an email went to (never their addresses) */
  recipients: string[];
}

export function makeLinks(deps: Pick<DigestRunDeps, 'workspaceId' | 'linkSecret' | 'actionBaseUrl' | 'appBaseUrl'>, uid: string, now: number): DigestLinks {
  const url = (payload: Omit<LinkPayload, 'v' | 'u' | 'w' | 'j' | 'e'>, ttl = LINK_TTL_MS) =>
    `${deps.actionBaseUrl}?t=${encodeURIComponent(signLink({ v: 1, u: uid, w: deps.workspaceId, j: newTokenId(), e: now + ttl, ...payload }, deps.linkSecret))}`;
  return {
    highlight: (id, tier, rating) => url({ k: 'hl', i: id, t: tier, r: rating }),
    action: (id, op) => url({ k: 'act', i: id, r: op }),
    unsubscribe: url({ k: 'unsub', i: '' }, UNSUBSCRIBE_TTL_MS),
    app: deps.appBaseUrl,
    settings: `${deps.appBaseUrl}#profile`,
  };
}

export async function runWeeklyDigest(deps: DigestRunDeps, now: number = Date.now()): Promise<DigestSummary> {
  const { db, workspaceId } = deps;
  const summary: DigestSummary = { considered: 0, sent: 0, skippedNotToday: 0, skippedRecently: 0, skippedNothingDue: 0, skippedNoEmail: 0, failed: 0, recipients: [] };
  const today = new Date(now).getUTCDay();

  const users = await db.collection(Paths.users()).where('settings.digest.enabled', '==', true).get();
  for (const userDoc of users.docs) {
    summary.considered += 1;
    const uid = userDoc.id;
    const prefs = (userDoc.data().settings?.digest ?? {}) as DigestPrefs;
    if ((typeof prefs.day === 'number' ? prefs.day : 1) !== today) { summary.skippedNotToday += 1; continue; }
    if (typeof prefs.lastSentAt === 'number' && now - prefs.lastSentAt < MIN_DAYS_BETWEEN_EMAILS * DAY_MS) { summary.skippedRecently += 1; continue; }

    const [highlightSnap, actionSnap, bookSnap] = await Promise.all([
      db.collection(WsPaths.highlights(workspaceId, uid)).limit(3000).get(),
      db.collection(WsPaths.actions(workspaceId, uid)).where('status', 'in', ['open', 'snoozed']).get(),
      db.collection(WsPaths.books(workspaceId, uid)).limit(1000).get(),
    ]);
    const bookTitles = new Map<string, string>(bookSnap.docs.map((d) => [d.id, String(d.data().title ?? d.data().meta?.title ?? '')]));
    const content = buildDigestContent({
      highlights: highlightSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as HighlightRow),
      actions: actionSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ActionRow),
      bookTitles,
      now,
    });
    if (isEmpty(content)) { summary.skippedNothingDue += 1; continue; }

    const to = await deps.getEmail(uid);
    if (!to) { summary.skippedNoEmail += 1; continue; }

    try {
      await deps.sender.send(buildDigestEmail(content, makeLinks(deps, uid, now), { to, postalAddress: deps.postalAddress }));
    } catch (err) {
      summary.failed += 1;
      console.error('[weekly-digest] send failed for', uid, err instanceof Error ? err.message : err);
      continue; // not marked as sent: the next run tries again
    }

    // Remember what was shown, so next week's pick moves on to other highlights and actions.
    const batch = db.batch();
    for (const h of content.highlights) batch.set(db.doc(WsPaths.highlight(workspaceId, uid, h.id)), { lastSurfacedAt: now }, { merge: true });
    if (content.action) batch.set(db.doc(WsPaths.action(workspaceId, uid, content.action.id)), { lastDigestAt: now }, { merge: true });
    batch.set(userDoc.ref, { settings: { digest: { lastSentAt: now } }, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    summary.sent += 1;
    summary.recipients.push(uid);
  }
  return summary;
}
