// Marginalia · Firestore path builders.
// Pure string helpers (no SDK imports) so the web client and Cloud Functions share one source.
// Functions get a build-time copy via scripts/sync-shared.mjs.

export const Paths = {
  /** Account-level metadata the user may edit (settings, avatar). Never holds billing fields. */
  user: (uid: string) => `users/${uid}`,
  /** Server-written billing state. Clients may only read their own. */
  billing: (uid: string) => `billing/${uid}`,
  /** Server-written AI usage counter for a month, `YYYY-MM`. */
  usageMonth: (uid: string, month: string) => `usage/${uid}/months/${month}`,
  usageMonths: (uid: string) => `usage/${uid}/months`,
  /** Publicly readable profile card, keyed by slug. Exists only while the profile is public. */
  publicProfile: (slug: string) => `publicProfiles/${slug}`,
  publicProfiles: () => 'publicProfiles',
} as const;
