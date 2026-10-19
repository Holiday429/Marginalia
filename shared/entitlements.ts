// Marginalia · Entitlements schema
// Single source of truth for plan → entitlement mapping.
// Shared by the web client and Cloud Functions (functions/src/_shared is a build-time copy).

export type Entitlement =
  | 'ai.unlimited'
  | 'export.pdf'
  | 'export.json'
  | 'profile.public'
  | 'profile.customDomain'
  | 'sync.notion'
  | 'library.3d'
  | 'room.customAudio'
  | 'reader.builtin';

export type Plan = 'free' | 'pro' | 'lifetime';

const FREE: Entitlement[] = ['export.json', 'profile.public'];

const PRO: Entitlement[] = [
  ...FREE,
  'ai.unlimited',
  'export.pdf',
  'profile.customDomain',
  'sync.notion',
  'library.3d',
  'room.customAudio',
];

export const PLAN_ENTITLEMENTS: Record<Plan, Entitlement[]> = {
  free: FREE,
  pro: PRO,
  lifetime: PRO,
};

export const PLANS: readonly Plan[] = ['free', 'pro', 'lifetime'];

export function isPlan(value: unknown): value is Plan {
  return typeof value === 'string' && (PLANS as readonly string[]).includes(value);
}
