/* Marginalia · AI monthly quota.
   Counts calls in usage/{uid}/months/{YYYY-MM} inside a transaction. The slot is reserved BEFORE
   the model call and released if the call fails, so failed generations never cost the user. */

import { isPlan, type Plan } from './_shared/entitlements';
import { Paths } from './_shared/paths';
import { FREE_AI_MONTHLY, PRO_AI_MONTHLY_FAIR_USE } from './ai-config';

/** The slice of Firestore the quota code needs (admin SDK Firestore satisfies it). */
export interface QuotaDb {
  doc(path: string): unknown;
  runTransaction<T>(fn: (tx: QuotaTx) => Promise<T>): Promise<T>;
}
export interface QuotaTx {
  get(ref: unknown): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(ref: unknown, data: Record<string, unknown>, opts?: { merge: boolean }): unknown;
}

export function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthlyLimit(plan: Plan): number {
  return plan === 'free' ? FREE_AI_MONTHLY : PRO_AI_MONTHLY_FAIR_USE;
}

export type Reservation =
  | { ok: true; plan: Plan; used: number; limit: number; month: string }
  | { ok: false; plan: Plan; used: number; limit: number; month: string };

export async function reserveAiCall(db: QuotaDb, uid: string, now = new Date()): Promise<Reservation> {
  const month = monthKey(now);
  const billingRef = db.doc(Paths.billing(uid));
  const usageRef = db.doc(Paths.usageMonth(uid, month));

  return db.runTransaction(async (tx) => {
    const [billing, usage] = await Promise.all([tx.get(billingRef), tx.get(usageRef)]);
    const rawPlan = billing.exists ? billing.data()?.plan : undefined;
    const plan: Plan = isPlan(rawPlan) ? rawPlan : 'free';
    const used = Number(usage.data()?.aiCalls ?? 0);
    const limit = monthlyLimit(plan);
    if (used >= limit) return { ok: false, plan, used, limit, month };
    tx.set(usageRef, { aiCalls: used + 1 }, { merge: true });
    return { ok: true, plan, used: used + 1, limit, month };
  });
}

/** Gives the slot back after a failed generation. Never goes below zero. */
export async function releaseAiCall(db: QuotaDb, uid: string, month: string): Promise<void> {
  const usageRef = db.doc(Paths.usageMonth(uid, month));
  await db.runTransaction(async (tx) => {
    const usage = await tx.get(usageRef);
    const used = Number(usage.data()?.aiCalls ?? 0);
    tx.set(usageRef, { aiCalls: Math.max(0, used - 1) }, { merge: true });
  });
}
