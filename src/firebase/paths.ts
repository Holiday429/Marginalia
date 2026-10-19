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

/** Per-user data lives under workspaces/{ws}/users/{uid}. */
export const WsPaths = {
  user: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}`,
  books: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/books`,
  book: (ws: string, uid: string, bookId: string) => `workspaces/${ws}/users/${uid}/books/${bookId}`,
  bookNote: (ws: string, uid: string, bookId: string) => `workspaces/${ws}/users/${uid}/books/${bookId}/notes/main`,
  highlights: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/highlights`,
  actions: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/actions`,
  aiResult: (ws: string, uid: string, featureId: string) => `workspaces/${ws}/users/${uid}/ai_results/${featureId}`,
  sessions: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/sessions`,
} as const;

export const AuditPaths = {
  aiCall: (uid: string, id: string) => `audit/ai_calls/${uid}/${id}`,
  rateLimit: (uid: string) => `users/${uid}/rateLimits/ai`,
} as const;
