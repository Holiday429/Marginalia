/* Marginalia · Lemon Squeezy billing webhook
   Verifies the LS signature, then applies the event to billing/{uid} through the state machine in
   billing-state.ts. billing/{uid} is server-written only (firestore.rules: write false).

   POST /billingWebhook
   Headers: X-Signature: <hmac-sha256-hex>
   Body:    Lemon Squeezy webhook payload (raw JSON)
*/

import * as crypto from 'crypto';
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Paths } from './_shared/paths';
import { reduceBillingEvent, uidFromPayload, type BillingDoc, type LSPayload } from './billing-state';

// admin.initializeApp() is called once in ai-generate.ts — shared instance.

export function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false; // signature was not valid hex / wrong length
  }
}

/** The slice of Firestore the webhook needs (admin SDK satisfies it). */
export interface BillingDb {
  doc(path: string): unknown;
  collection(path: string): { add(data: Record<string, unknown>): Promise<unknown> };
  runTransaction<T>(fn: (tx: {
    get(ref: unknown): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
    set(ref: unknown, data: Record<string, unknown>): unknown;
  }) => Promise<T>): Promise<T>;
}

export type ApplyOutcome =
  | { status: 'applied'; uid: string; plan: BillingDoc['plan'] }
  | { status: 'ignored'; reason: string }
  | { status: 'orphan' };

/** Applies one verified payload. `serverTime` is injected so tests do not need the admin SDK. */
export async function applyBillingEvent(
  db: BillingDb,
  payload: LSPayload,
  opts: { lifetimeVariantId: string; now?: number; serverTime?: unknown },
): Promise<ApplyOutcome> {
  const uid = uidFromPayload(payload);
  if (!uid) {
    // Cannot map to a user. Park it for manual resolution; acknowledge so LS stops retrying.
    await db.collection('billing_orphans').add({
      event: payload.meta?.event_name ?? null,
      resourceType: payload.data?.type ?? null,
      resourceId: String(payload.data?.id ?? ''),
      customerId: payload.data?.attributes?.customer_id ?? null,
      userEmail: payload.data?.attributes?.user_email ?? null,
      receivedAt: opts.serverTime ?? Date.now(),
    });
    return { status: 'orphan' };
  }

  const ref = db.doc(Paths.billing(uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const result = reduceBillingEvent(snap.exists ? (snap.data() as Partial<BillingDoc>) : undefined, payload, {
      lifetimeVariantId: opts.lifetimeVariantId,
      now: opts.now ?? Date.now(),
    });
    if (result.kind === 'ignore') return { status: 'ignored' as const, reason: result.reason };
    tx.set(ref, { ...result.next, updatedAt: opts.serverTime ?? Date.now() });
    return { status: 'applied' as const, uid, plan: result.next.plan };
  });
}

export const billingWebhook = functions.onRequest(
  { secrets: ['LEMON_SQUEEZY_WEBHOOK_SECRET', 'LEMON_SQUEEZY_VARIANT_LIFETIME'] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const signature = (req.headers['x-signature'] as string) || '';
    const rawBody: Buffer = (req as unknown as { rawBody: Buffer }).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'Missing body' });
      return;
    }
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    let payload: LSPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as LSPayload;
    } catch {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }

    try {
      const outcome = await applyBillingEvent(admin.firestore() as unknown as BillingDb, payload, {
        lifetimeVariantId: process.env.LEMON_SQUEEZY_VARIANT_LIFETIME ?? '',
        serverTime: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.info('[billing-webhook] event=%s outcome=%s', payload.meta?.event_name, outcome.status);
      res.status(200).json({ ok: true, ...outcome });
    } catch (err) {
      // 500 makes Lemon Squeezy retry; the state machine is idempotent and order-safe.
      console.error('[billing-webhook] failed', err);
      res.status(500).json({ error: 'Failed to apply event' });
    }
  }
);
