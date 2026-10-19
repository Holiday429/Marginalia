/* Marginalia · billing state machine (pure, no I/O).
   Turns a Lemon Squeezy webhook payload plus the previous billing/{uid} doc into the next doc.

   | Event / status                                          | Result                                         |
   | subscription_created/updated/resumed, active|on_trial   | pro, currentPeriodEnd=renews_at, cancel=false  |
   | subscription_cancelled (status cancelled)               | stays pro, cancelAtPeriodEnd=true, end=ends_at |
   | subscription_expired                                    | free                                           |
   | status past_due                                         | stays pro, status 'past_due'                   |
   | order_created, lifetime variant                         | lifetime                                       |
   | order_created, any other variant                        | ignored (subscription first orders)            |
   | order_refunded, lifetime variant                        | lifetime off → subscription plan or free       |
   Stale subscription events (updated_at older than the last applied) are dropped. */

import type { Plan } from './_shared/entitlements';

export type SubPlan = 'free' | 'pro';

export interface BillingDoc {
  plan: Plan;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  provider: 'lemonsqueezy' | 'none' | 'manual-migration';
  providerSubscriptionId: string | null;
  customerPortalUrl: string | null;
  // Bookkeeping for ordering and the lifetime/subscription split:
  subscriptionPlan: SubPlan;
  subscriptionStatus: string | null;
  subscriptionUpdatedAt: number | null;
  lifetimeOrderId: string | null;
  lifetimeActive: boolean;
  refundedLifetimeOrderIds: string[];
}

export interface LSPayload {
  meta: { event_name?: string; custom_data?: { uid?: string } };
  data: { type?: string; id?: string | number; attributes: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ReduceContext { lifetimeVariantId: string; now: number }

export type ReduceResult =
  | { kind: 'apply'; next: BillingDoc }
  | { kind: 'ignore'; reason: string };

export function emptyBilling(): BillingDoc {
  return {
    plan: 'free', status: 'none', currentPeriodEnd: null, cancelAtPeriodEnd: false,
    provider: 'none', providerSubscriptionId: null, customerPortalUrl: null,
    subscriptionPlan: 'free', subscriptionStatus: null, subscriptionUpdatedAt: null,
    lifetimeOrderId: null, lifetimeActive: false, refundedLifetimeOrderIds: [],
  };
}

const ms = (iso: unknown): number | null => {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** Recomputes the effective plan from the two independent sources (lifetime order, subscription). */
function compose(b: BillingDoc): BillingDoc {
  if (b.lifetimeActive) {
    return { ...b, plan: 'lifetime', status: 'lifetime', currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }
  return {
    ...b,
    plan: b.subscriptionPlan === 'pro' ? 'pro' : 'free',
    status: b.subscriptionStatus ?? 'none',
  };
}

function reduceSubscription(prev: BillingDoc, p: LSPayload, ctx: ReduceContext): ReduceResult {
  const a = p.data.attributes;
  const event = p.meta.event_name!;
  const updatedAt = ms(a.updated_at);
  if (prev.subscriptionUpdatedAt !== null && updatedAt !== null && updatedAt < prev.subscriptionUpdatedAt) {
    return { kind: 'ignore', reason: 'stale subscription event' };
  }

  const next: BillingDoc = {
    ...prev,
    provider: 'lemonsqueezy',
    providerSubscriptionId: String(p.data.id ?? prev.providerSubscriptionId ?? ''),
    customerPortalUrl: a.urls?.customer_portal ?? prev.customerPortalUrl,
    subscriptionUpdatedAt: updatedAt ?? prev.subscriptionUpdatedAt,
  };

  const status: string = String(a.status ?? '');
  const effective = event === 'subscription_expired' ? 'expired'
    : event === 'subscription_cancelled' ? 'cancelled'
    : status;

  switch (effective) {
    case 'active':
    case 'on_trial':
      next.subscriptionPlan = 'pro';
      next.subscriptionStatus = effective;
      next.currentPeriodEnd = ms(a.renews_at);
      next.cancelAtPeriodEnd = false;
      break;
    case 'cancelled': {
      const end = ms(a.ends_at);
      next.currentPeriodEnd = end;
      next.cancelAtPeriodEnd = true;
      // Paid-through date already passed (late delivery): treat as expired.
      const over = end !== null && end <= ctx.now;
      next.subscriptionPlan = over ? 'free' : 'pro';
      next.subscriptionStatus = over ? 'expired' : 'cancelled';
      break;
    }
    case 'expired':
      next.subscriptionPlan = 'free';
      next.subscriptionStatus = 'expired';
      next.currentPeriodEnd = ms(a.ends_at) ?? prev.currentPeriodEnd;
      next.cancelAtPeriodEnd = false;
      break;
    case 'past_due':
      // Access continues while Lemon Squeezy retries payment; it sends `expired` if dunning fails.
      next.subscriptionPlan = 'pro';
      next.subscriptionStatus = 'past_due';
      next.currentPeriodEnd = ms(a.renews_at) ?? prev.currentPeriodEnd;
      next.cancelAtPeriodEnd = false;
      break;
    case 'unpaid':
    case 'paused':
      next.subscriptionPlan = 'free';
      next.subscriptionStatus = effective;
      next.cancelAtPeriodEnd = false;
      break;
    default:
      return { kind: 'ignore', reason: `unknown subscription status "${status}"` };
  }
  return { kind: 'apply', next: compose(next) };
}

function reduceOrder(prev: BillingDoc, p: LSPayload, ctx: ReduceContext): ReduceResult {
  const a = p.data.attributes;
  const event = p.meta.event_name!;
  const orderId = String(p.data.id ?? '');
  const variantId = String(a.first_order_item?.variant_id ?? '');
  if (!ctx.lifetimeVariantId || variantId !== ctx.lifetimeVariantId) {
    return { kind: 'ignore', reason: 'order is not the lifetime variant' };
  }

  if (event === 'order_created') {
    if (a.status !== 'paid') return { kind: 'ignore', reason: `order status "${a.status}" is not paid` };
    if (prev.refundedLifetimeOrderIds.includes(orderId)) return { kind: 'ignore', reason: 'order already refunded' };
    return { kind: 'apply', next: compose({ ...prev, provider: 'lemonsqueezy', lifetimeOrderId: orderId, lifetimeActive: true }) };
  }

  // order_refunded
  const refunded = prev.refundedLifetimeOrderIds.includes(orderId)
    ? prev.refundedLifetimeOrderIds
    : [...prev.refundedLifetimeOrderIds, orderId];
  const affectsCurrent = prev.lifetimeOrderId === null || prev.lifetimeOrderId === orderId;
  return {
    kind: 'apply',
    next: compose({
      ...prev,
      refundedLifetimeOrderIds: refunded,
      lifetimeActive: affectsCurrent ? false : prev.lifetimeActive,
    }),
  };
}

export function reduceBillingEvent(prevDoc: Partial<BillingDoc> | undefined, payload: LSPayload, ctx: ReduceContext): ReduceResult {
  const prev: BillingDoc = { ...emptyBilling(), ...(prevDoc ?? {}) };
  const event = payload.meta?.event_name;
  switch (event) {
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed':
    case 'subscription_cancelled':
    case 'subscription_expired':
      return reduceSubscription(prev, payload, ctx);
    case 'order_created':
    case 'order_refunded':
      return reduceOrder(prev, payload, ctx);
    default:
      return { kind: 'ignore', reason: `unhandled event "${event}"` };
  }
}

export function uidFromPayload(payload: LSPayload): string | null {
  const uid = payload.meta?.custom_data?.uid;
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !uid.includes('/') ? uid : null;
}
