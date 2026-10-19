/* Marginalia · what a click in the weekly email does (plan 2.4).
   Link → signed payload (tokens.ts). Verified here, then:
   - highlight answers (still holds / turn into action / stop reminding) apply at once;
   - "add a thought" shows a small form first and applies when it is submitted;
   - action answers (mark done / remind me next week);
   - unsubscribe switches the weekly email off.
   Every answer link works once: the first use writes email_tokens/{jti}; later clicks get "already handled".
   Expired links are refused. No login is involved: the signature is the proof.
*/

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { Paths, WsPaths } from '../_shared/paths';
import { applyResponse, isRating, isTier, type ResurfaceFields, type ResurfaceRating } from '../_shared/resurface';
import { verifyLink } from './tokens';
import type { LinkPayload } from './types';

const DAY_MS = 86_400_000;

export type ClickOutcome = 'applied' | 'already_done' | 'expired' | 'invalid';

export interface ActionRequest {
  method: 'GET' | 'POST';
  token: string;
  /** the sentence from the "add a thought" form (POST) */
  text?: string;
}

export interface ActionResponse {
  status: number;
  html: string;
  outcome: ClickOutcome;
  uid?: string;
  kind?: LinkPayload['k'];
  answer?: string;
}

export interface ActionDeps {
  db: Firestore;
  linkSecret: string;
  appBaseUrl: string;
  now?: number;
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

function page(title: string, body: string, appBaseUrl: string, status = 200): { status: number; html: string } {
  return {
    status,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;padding:48px 20px;background:#f3ede2;color:#1a1714;font:17px/1.6 Georgia,serif}main{max-width:480px;margin:0 auto}h1{font-size:24px;font-weight:500;margin:0 0 12px}p{margin:0 0 16px}a{color:#8b3120}textarea{box-sizing:border-box;width:100%;padding:10px;font:16px Georgia,serif;border:1px solid #1a1714;border-radius:4px}button{min-height:44px;padding:0 18px;border:0;border-radius:4px;background:#1a1714;color:#f3ede2;font:16px Georgia,serif;cursor:pointer}</style></head>
<body><main><h1>${esc(title)}</h1>${body}<p><a href="${esc(appBaseUrl)}">Open Marginalia</a></p></main></body></html>`,
  };
}

const RESPONSE_COPY: Record<ResurfaceRating, string> = {
  resonates: 'Marked as still holding. It will come back later.',
  thought: 'Your thought was added to the highlight.',
  action: 'Turned into an action. You will find it on the book page.',
  dismiss: 'Done. This highlight will not be sent again.',
};

export async function handleEmailAction(deps: ActionDeps, req: ActionRequest): Promise<ActionResponse> {
  const now = deps.now ?? Date.now();
  const { db, appBaseUrl } = deps;
  const verified = verifyLink(req.token, deps.linkSecret, now);
  if (!verified.ok) {
    const expired = verified.reason === 'expired';
    return {
      ...page(expired ? 'This link has expired' : 'This link is not valid',
        `<p>${expired ? 'Links in the weekly email stop working after 14 days.' : 'It may be incomplete or changed. Use the buttons in the email, or open Marginalia.'}</p>`, appBaseUrl, expired ? 410 : 400),
      outcome: verified.reason,
    };
  }
  const p = verified.payload;
  const base = { uid: p.u, kind: p.k, answer: p.r };

  // ── Unsubscribe: idempotent, works on GET (a person) and POST (the mail client's one-click). ──
  if (p.k === 'unsub') {
    await db.doc(Paths.user(p.u)).set({ settings: { digest: { enabled: false } }, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return {
      ...page('You are unsubscribed', '<p>No more weekly emails. You can turn them back on in Marginalia, under Profile and Settings.</p>', appBaseUrl),
      outcome: 'applied', ...base,
    };
  }

  const ledgerRef = db.doc(Paths.emailToken(p.j));
  const handled = () => ({ ...page('Already handled', '<p>You already used this link. Nothing changed.</p>', appBaseUrl), outcome: 'already_done' as const, ...base });

  // The "add a thought" link first shows a form; the answer is recorded when it is submitted.
  if (p.k === 'hl' && p.r === 'thought' && req.method === 'GET') {
    if ((await ledgerRef.get()).exists) return handled();
    return {
      ...page('Add a thought',
        `<form method="post" action=""><input type="hidden" name="t" value="${esc(req.token)}"><p>What do you think of it now?</p><p><textarea name="text" rows="4" maxlength="400" required autofocus></textarea></p><button type="submit">Save</button></form>`, appBaseUrl),
      outcome: 'applied', ...base, // nothing is written yet; counted as a click, not a change
    };
  }

  if (p.k === 'hl') {
    if (!isRating(p.r) || !isTier(p.t) || !p.i) return { ...page('This link is not valid', '<p>Use the buttons in the email.</p>', appBaseUrl, 400), outcome: 'invalid', ...base };
    const rating = p.r;
    const tier = p.t;
    const highlightRef = db.doc(WsPaths.highlight(p.w, p.u, p.i));
    const result = await db.runTransaction(async (tx) => {
      if ((await tx.get(ledgerRef)).exists) return 'already_done' as const;
      const snap = await tx.get(highlightRef);
      const data = (snap.data() ?? {}) as ResurfaceFields & { quote?: string; bookId?: string; annotation?: string };
      const tierDone = { '7d': data.resurfaced7, '30d': data.resurfaced30, '90d': data.resurfaced90 }[tier];
      tx.set(ledgerRef, { uid: p.u, kind: 'hl', answer: rating, usedAt: now });
      if (!snap.exists || tierDone) return 'already_done' as const; // answered in the app meanwhile (or deleted)

      const patch: Record<string, unknown> = { ...applyResponse(data, tier, rating, now) };
      if (rating === 'thought') {
        const thought = String(req.text ?? '').trim().slice(0, 400);
        const previous = String(data.annotation ?? '').trim();
        if (thought) patch.annotation = previous ? `${previous}\n${thought}` : thought;
      }
      tx.set(highlightRef, { ...patch, updatedAt: now, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (rating === 'action' && data.quote) {
        tx.set(db.collection(WsPaths.actions(p.w, p.u)).doc(), {
          bookId: data.bookId ?? '', text: String(data.quote).slice(0, 400), status: 'open', createdAt: now,
          remind7At: now + 7 * DAY_MS, remind30At: now + 30 * DAY_MS, remind90At: now + 90 * DAY_MS,
          reminded7: false, reminded30: false, reminded90: false, resolvedAt: null,
          _v: 1, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return 'applied' as const;
    });
    if (result === 'already_done') return handled();
    return { ...page('Done', `<p>${esc(RESPONSE_COPY[rating])}</p>`, appBaseUrl), outcome: 'applied', ...base };
  }

  // p.k === 'act'
  if (!p.i || (p.r !== 'done' && p.r !== 'snooze')) return { ...page('This link is not valid', '<p>Use the buttons in the email.</p>', appBaseUrl, 400), outcome: 'invalid', ...base };
  const actionRef = db.doc(WsPaths.action(p.w, p.u, p.i));
  const op = p.r;
  const result = await db.runTransaction(async (tx) => {
    if ((await tx.get(ledgerRef)).exists) return 'already_done' as const;
    const snap = await tx.get(actionRef);
    tx.set(ledgerRef, { uid: p.u, kind: 'act', answer: op, usedAt: now });
    const status = snap.data()?.status;
    if (!snap.exists || status === 'done' || status === 'archived') return 'already_done' as const;
    const patch = op === 'done'
      ? { status: 'done', resolvedAt: now }
      : { status: 'snoozed', remind7At: now + 7 * DAY_MS, remind30At: now + 30 * DAY_MS, remind90At: now + 90 * DAY_MS, reminded7: false, reminded30: false, reminded90: false };
    tx.set(actionRef, { ...patch, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return 'applied' as const;
  });
  if (result === 'already_done') return handled();
  return { ...page('Done', `<p>${op === 'done' ? 'Marked as done.' : 'You will be reminded again in a week.'}</p>`, appBaseUrl), outcome: 'applied', ...base };
}
