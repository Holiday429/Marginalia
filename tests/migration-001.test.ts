import { describe, it, expect } from 'vitest';
import { planUser } from '../scripts/migrations/001-billing.ts';

describe('migration 001 planning', () => {
  it('ignores a forged plan value on the user doc', () => {
    const p = planUser('u1', { plan: 'lifetime', entitlements: ['ai.unlimited'], quota: { aiCreditsRemaining: 99999 } }, {});
    expect(p.billing.plan).toBe('free');
    expect(p.deleteFields).toEqual(['plan', 'entitlements', 'quota']);
  });

  it('honours the owner-supplied paid list', () => {
    expect(planUser('u2', {}, { u2: 'pro' }).billing.plan).toBe('pro');
  });

  it('only creates a public card for public profiles with a slug', () => {
    expect(planUser('u3', { settings: { slug: 'ada' } }, {}).publicCard).toBeNull();
    const card = planUser('u4', { displayName: 'Ada', settings: { slug: 'Ada', profilePublic: true } }, {}).publicCard;
    expect(card).toMatchObject({ uid: 'u4', slug: 'ada', displayName: 'Ada' });
    expect(card).not.toHaveProperty('email');
  });
});
