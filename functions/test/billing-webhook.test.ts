import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyBillingEvent, verifySignature, billingWebhook, type BillingDb } from '../src/billing-webhook';
import type { LSPayload } from '../src/billing-state';
import { FakeDb } from './fake-db';

const UID = 'uid-123';
const LIFETIME_VARIANT = '2999';
const NOW = Date.parse('2026-10-19T00:00:00Z');
const fixture = (name: string): LSPayload =>
  JSON.parse(readFileSync(new URL(`./fixtures/billing/${name}.json`, import.meta.url), 'utf8'));

let db: FakeDb;
const apply = (name: string, over: { now?: number; lifetimeVariantId?: string } = {}) =>
  applyBillingEvent(db as unknown as BillingDb, fixture(name), { lifetimeVariantId: LIFETIME_VARIANT, now: NOW, ...over });
const billing = () => db.read(`billing/${UID}`);

beforeEach(() => { db = new FakeDb(); });

describe('state machine — one test per row of the plan table', () => {
  it('subscription_created, active → pro, period end = renews_at, no cancel', async () => {
    await apply('subscription_created_active');
    expect(billing()).toMatchObject({ plan: 'pro', status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: Date.parse('2026-11-01T10:00:00Z'), provider: 'lemonsqueezy', providerSubscriptionId: '5001' });
  });

  it('subscription_created, on_trial → pro', async () => {
    await apply('subscription_created_on_trial');
    expect(billing()).toMatchObject({ plan: 'pro', status: 'on_trial', currentPeriodEnd: Date.parse('2026-10-15T10:00:00Z') });
  });

  it('subscription_updated (renewal) moves the period end', async () => {
    await apply('subscription_created_active');
    await apply('subscription_updated_renewed');
    expect(billing()).toMatchObject({ plan: 'pro', currentPeriodEnd: Date.parse('2026-12-01T10:00:00Z'), cancelAtPeriodEnd: false });
  });

  it('subscription_cancelled → stays pro, cancelAtPeriodEnd, period end = ends_at', async () => {
    await apply('subscription_created_active');
    await apply('subscription_cancelled');
    expect(billing()).toMatchObject({ plan: 'pro', status: 'cancelled', cancelAtPeriodEnd: true, currentPeriodEnd: Date.parse('2026-11-01T10:00:00Z') });
  });

  it('subscription_resumed after cancel → pro, cancelAtPeriodEnd false', async () => {
    await apply('subscription_created_active');
    await apply('subscription_cancelled');
    await apply('subscription_resumed');
    expect(billing()).toMatchObject({ plan: 'pro', status: 'active', cancelAtPeriodEnd: false });
  });

  it('subscription_expired → free', async () => {
    await apply('subscription_created_active');
    await apply('subscription_cancelled');
    await apply('subscription_expired');
    expect(billing()).toMatchObject({ plan: 'free', status: 'expired' });
  });

  it('status past_due → stays pro, status past_due', async () => {
    await apply('subscription_created_active');
    await apply('subscription_updated_past_due');
    expect(billing()).toMatchObject({ plan: 'pro', status: 'past_due' });
  });

  it('order_created with the lifetime variant → lifetime', async () => {
    await apply('order_created_lifetime');
    expect(billing()).toMatchObject({ plan: 'lifetime', status: 'lifetime', lifetimeOrderId: '8001', lifetimeActive: true });
  });

  it("a monthly subscription's first order never makes the user lifetime", async () => {
    const out = await apply('order_created_monthly_first_order');
    expect(out).toMatchObject({ status: 'ignored' });
    expect(billing()).toBeUndefined();
    await apply('subscription_created_active');
    await apply('order_created_monthly_first_order');
    expect(billing()?.plan).toBe('pro');
  });

  it('order_refunded for the lifetime variant → free', async () => {
    await apply('order_created_lifetime');
    await apply('order_refunded_lifetime');
    expect(billing()).toMatchObject({ plan: 'free', lifetimeActive: false });
  });

  it('refunding lifetime falls back to an active subscription instead of free', async () => {
    await apply('subscription_created_active');
    await apply('order_created_lifetime');
    expect(billing()?.plan).toBe('lifetime');
    await apply('order_refunded_lifetime');
    expect(billing()).toMatchObject({ plan: 'pro', status: 'active' });
  });

  it('order_refunded for a non-lifetime variant is ignored', async () => {
    await apply('subscription_created_active');
    expect(await apply('order_refunded_monthly')).toMatchObject({ status: 'ignored' });
    expect(billing()?.plan).toBe('pro');
  });
});

describe('ordering, idempotency and edge cases', () => {
  it('a stale subscription_updated after cancelled does not undo the cancellation', async () => {
    await apply('subscription_cancelled');
    const out = await apply('subscription_updated_stale_active');
    expect(out).toMatchObject({ status: 'ignored', reason: 'stale subscription event' });
    expect(billing()).toMatchObject({ plan: 'pro', cancelAtPeriodEnd: true });
  });

  it('redelivering the same event is idempotent', async () => {
    await apply('subscription_created_active');
    const first = { ...billing()! };
    delete first.updatedAt;
    await apply('subscription_created_active');
    const second = { ...billing()! };
    delete second.updatedAt;
    expect(second).toEqual(first);
  });

  it('cancelled whose paid-through date already passed is treated as expired', async () => {
    await apply('subscription_cancelled', { now: Date.parse('2026-12-01T00:00:00Z') });
    expect(billing()).toMatchObject({ plan: 'free', status: 'expired' });
  });

  it('a refund that arrives before its order_created keeps the user free', async () => {
    await apply('order_refunded_lifetime');
    await apply('order_created_lifetime');
    expect(billing()?.plan).toBe('free');
  });

  it('without a configured lifetime variant, orders are ignored', async () => {
    expect(await apply('order_created_lifetime', { lifetimeVariantId: '' })).toMatchObject({ status: 'ignored' });
  });

  it('events without a uid are parked in billing_orphans and change no billing doc', async () => {
    expect(await apply('subscription_created_no_uid')).toEqual({ status: 'orphan' });
    const orphans = [...db.store.entries()].filter(([p]) => p.startsWith('billing_orphans/'));
    expect(orphans).toHaveLength(1);
    expect(orphans[0][1]).toMatchObject({ event: 'subscription_created', resourceId: '5001' });
    expect(billing()).toBeUndefined();
  });

  it('records the customer portal link', async () => {
    await apply('subscription_created_active');
    expect(billing()?.customerPortalUrl).toContain('lemonsqueezy.com/billing');
  });
});

describe('signature', () => {
  const secret = 'whsec_test';
  const body = Buffer.from(JSON.stringify(fixture('subscription_created_active')));
  const sign = (b: Buffer, s = secret) => createHmac('sha256', s).update(b).digest('hex');

  it('accepts a correct HMAC and rejects wrong, short, non-hex and empty ones', () => {
    expect(verifySignature(body, sign(body), secret)).toBe(true);
    expect(verifySignature(body, sign(body, 'other'), secret)).toBe(false);
    expect(verifySignature(body, sign(body).slice(0, 10), secret)).toBe(false);
    expect(verifySignature(body, 'zz-not-hex', secret)).toBe(false);
    expect(verifySignature(body, '', secret)).toBe(false);
  });

  function call(headers: Record<string, string>, rawBody: Buffer | undefined) {
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;
    const res = { code: 0, body: undefined as unknown, status(c: number) { this.code = c; return this; }, json(b: unknown) { this.body = b; return this; } };
    const req = { method: 'POST', headers, rawBody };
    return (billingWebhook as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res).then(() => res);
  }

  it('wrong or missing signature → 401 and nothing is written', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect((await call({ 'x-signature': sign(body, 'wrong') }, body)).code).toBe(401);
    expect((await call({}, body)).code).toBe(401);
    spy.mockRestore();
  });
});
