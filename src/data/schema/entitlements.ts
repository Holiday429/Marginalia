// Marginalia · Entitlements schema
// Single source of truth for plan → entitlement mapping.

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
