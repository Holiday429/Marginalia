/* Marginalia · Lemon Squeezy billing webhook
   Validates the LS webhook signature and updates users/{uid}.plan + .entitlements
   on subscription lifecycle events.

   POST /billingWebhook
   Headers: X-Signature: <hmac-sha256-hex>
   Body:    Lemon Squeezy webhook payload (raw JSON)
*/

import * as crypto from 'crypto';
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// admin.initializeApp() is called once in ai-generate.ts — shared instance.

const db = admin.firestore();

type Plan = 'free' | 'pro' | 'lifetime';

const PLAN_ENTITLEMENTS: Record<Plan, string[]> = {
  free: ['export.json', 'profile.public'],
  pro: [
    'export.json',
    'profile.public',
    'ai.unlimited',
    'export.pdf',
    'profile.customDomain',
    'sync.notion',
    'library.3d',
  ],
  lifetime: [
    'export.json',
    'profile.public',
    'ai.unlimited',
    'export.pdf',
    'profile.customDomain',
    'sync.notion',
    'library.3d',
  ],
};

// Lemon Squeezy event types we care about.
type LSEvent =
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_resumed'
  | 'subscription_expired'
  | 'order_created';

interface LSPayload {
  meta: {
    event_name: LSEvent;
    custom_data?: { uid?: string };
  };
  data: {
    attributes: {
      status?: string;           // subscription status
      order_id?: number;
      product_name?: string;
      // order attributes
      custom_data?: { uid?: string };
    };
  };
}

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

function planFromPayload(payload: LSPayload): Plan {
  const status = payload.data.attributes.status || '';
  const event = payload.meta.event_name;

  // Cancelled or expired → revert to free.
  if (event === 'subscription_cancelled' || event === 'subscription_expired') return 'free';
  if (event === 'subscription_resumed') return 'pro';

  // Active subscription states.
  if (['active', 'trialing'].includes(status)) return 'pro';

  // One-time order (lifetime deal).
  if (event === 'order_created') return 'lifetime';

  // Past-due or unpaid → free until resolved.
  return 'free';
}

function uidFromPayload(payload: LSPayload): string | null {
  // custom_data can be nested at meta level or data.attributes level depending on LS version.
  return (
    payload.meta.custom_data?.uid ||
    payload.data.attributes.custom_data?.uid ||
    null
  );
}

export const billingWebhook = functions.onRequest(
  { secrets: ['LEMON_SQUEEZY_WEBHOOK_SECRET'] },
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

    // Verify signature using raw body.
    const signature = (req.headers['x-signature'] as string) || '';
    const rawBody: Buffer = (req as unknown as { rawBody: Buffer }).rawBody;

    if (!rawBody || !signature) {
      res.status(400).json({ error: 'Missing signature or body' });
      return;
    }

    if (!verifySignature(rawBody, signature, secret)) {
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

    const event = payload.meta.event_name;
    const handled: LSEvent[] = [
      'subscription_created',
      'subscription_updated',
      'subscription_cancelled',
      'subscription_resumed',
      'subscription_expired',
      'order_created',
    ];

    if (!handled.includes(event)) {
      // Acknowledge unhandled events without error.
      res.status(200).json({ ok: true, skipped: true });
      return;
    }

    const uid = uidFromPayload(payload);
    if (!uid) {
      // No uid in custom_data — can't map to a user. Log and acknowledge.
      console.warn('[billing-webhook] No uid in custom_data for event', event);
      res.status(200).json({ ok: true, skipped: true });
      return;
    }

    const plan = planFromPayload(payload);
    const entitlements = PLAN_ENTITLEMENTS[plan];

    await db.doc(`users/${uid}`).set(
      { plan, entitlements, _updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    console.info('[billing-webhook] Updated uid=%s plan=%s event=%s', uid, plan, event);
    res.status(200).json({ ok: true });
  }
);
