# 0006 — Lemon Squeezy as payments provider

**Status:** Accepted
**Date:** 2026-05-05

## Context

P1 requires a payments provider to sell the Pro plan (~$5–8/mo) and a lifetime option. Requirements:
- Handles EU VAT / global tax automatically (no manual tax registration)
- No bank account required to activate test mode (blocks fast iteration)
- Simple webhook API for subscription lifecycle events
- Supports embedding `custom_data` in the checkout so our webhook can map a purchase back to a Firebase UID without a separate lookup table

## Decision

Use **Lemon Squeezy**. The client calls a Cloud Function (`createCheckout`) which creates a Lemon Squeezy checkout session embedding `custom_data: { uid }`. Lemon Squeezy fires webhooks to a second Cloud Function (`billingWebhook`) on subscription lifecycle events; the webhook updates `users/{uid}.plan` and `users/{uid}.entitlements` in Firestore. `EntitlementsStore` uses `onSnapshot` so the UI updates live without a page reload.

## Alternatives considered

- **Paddle** — similar feature set (VAT handling, merchant of record), but requires a business entity and bank account before test mode is usable. Blocked fast iteration. Can be swapped in later by replacing the two Cloud Functions; client interface is identical.
- **Stripe** — most flexible, but no merchant-of-record VAT handling out of the box. Requires Stripe Tax add-on + regional setup. Overkill for an indie launch.

## Consequences

- Lemon Squeezy is the merchant of record — they handle chargebacks and VAT remittance.
- Webhook secret (`LEMON_SQUEEZY_WEBHOOK_SECRET`) and API key (`LEMON_SQUEEZY_API_KEY`) stored as Cloud Function secrets, never on client.
- Checkout URL is generated server-side; client never holds the API key.
- If Lemon Squeezy merchant approval is delayed, swap to Paddle by reimplementing the two functions — the `EntitlementsStore` and client `billing.ts` interface are provider-agnostic.
- Test card: Lemon Squeezy test store uses `4242 4242 4242 4242` (any future expiry, any CVV).
