// Marginalia · Firestore path builders — the ONLY place Firestore paths are spelled out.
// Pure string helpers (no SDK imports) so the web client and Cloud Functions share one source.
// Functions get a build-time copy via scripts/sync-shared.mjs. `npm run check:paths` fails the
// build if a literal path shows up in a collection()/doc() call anywhere else, and
// tests/path-cases.ts forces a rules test for every builder added here.

/** Workspace used when VITE_WORKSPACE_ID / WORKSPACE_ID is not set (matches .env.example). */
export const DEFAULT_WORKSPACE_ID = 'marginalia-main';

/** Collection-group names (queried across all users by Cloud Functions). */
export const GroupNames = {
  actions: 'actions',
  highlights: 'highlights',
} as const;

/** Top-level account documents. */
export const Paths = {
  /** Account-level metadata the user may edit (settings, avatar). Never holds billing fields. */
  user: (uid: string) => `users/${uid}`,
  /** The collection of account documents (queried by Cloud Functions, e.g. the weekly digest). */
  users: () => 'users',
  /** Server-only AI/rate-limit state under the user doc. */
  rateLimit: (uid: string) => `users/${uid}/rateLimits/ai`,
  /** Server-written billing state. Clients may only read their own. */
  billing: (uid: string) => `billing/${uid}`,
  /** Server-written AI usage counter for a month, `YYYY-MM`. */
  usageMonth: (uid: string, month: string) => `usage/${uid}/months/${month}`,
  usageMonths: (uid: string) => `usage/${uid}/months`,
  /** Publicly readable profile card, keyed by slug. Exists only while the profile is public. */
  publicProfile: (slug: string) => `publicProfiles/${slug}`,
  publicProfiles: () => 'publicProfiles',
  /** Webhook events that could not be mapped to a user (server-only, support use). */
  billingOrphans: () => 'billing_orphans',
  /** Shared lookup cache for book geography (authors' birthplaces, books' settings). Server-only. */
  geoCache: (key: string) => `geoCache/${key}`,
  /** Server-only call counter for the geography functions. */
  geoRateLimit: (uid: string) => `users/${uid}/rateLimits/geo`,
  /** One-time email-link ledger: a document per link already used (server-only). */
  emailToken: (jti: string) => `email_tokens/${jti}`,
  /** Local/dev mailbox written by the mock email sender (server-only; never used in production). */
  mailOutbox: (id: string) => `mail_outbox/${id}`,
} as const;

/** Per-user data lives under workspaces/{ws}/users/{uid}. */
export const WsPaths = {
  user: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}`,
  userProfiles: (ws: string) => `workspaces/${ws}/userProfiles`,
  userProfile: (ws: string, uid: string) => `workspaces/${ws}/userProfiles/${uid}`,
  notifications: (ws: string, uid: string) => `workspaces/${ws}/notifications/${uid}/unread`,
  notification: (ws: string, uid: string, id: string) => `workspaces/${ws}/notifications/${uid}/unread/${id}`,
  notificationsRoot: (ws: string, uid: string) => `workspaces/${ws}/notifications/${uid}`,
  books: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/books`,
  book: (ws: string, uid: string, bookId: string) => `workspaces/${ws}/users/${uid}/books/${bookId}`,
  bookNote: (ws: string, uid: string, bookId: string) => `workspaces/${ws}/users/${uid}/books/${bookId}/notes/main`,
  bookAiResult: (ws: string, uid: string, bookId: string, featureId: string) => `workspaces/${ws}/users/${uid}/books/${bookId}/ai/${featureId}`,
  bookVisualNote: (ws: string, uid: string, bookId: string, noteId: string) => `workspaces/${ws}/users/${uid}/books/${bookId}/visualNotes/${noteId}`,
  highlights: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/highlights`,
  highlight: (ws: string, uid: string, id: string) => `workspaces/${ws}/users/${uid}/highlights/${id}`,
  actions: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/actions`,
  action: (ws: string, uid: string, id: string) => `workspaces/${ws}/users/${uid}/actions/${id}`,
  sessions: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/sessions`,
  session: (ws: string, uid: string, id: string) => `workspaces/${ws}/users/${uid}/sessions/${id}`,
  /** One finish-ritual record per book (answers + finish card). Doc id is the bookId. */
  moments: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/moments`,
  moment: (ws: string, uid: string, bookId: string) => `workspaces/${ws}/users/${uid}/moments/${bookId}`,
  aiResult: (ws: string, uid: string, featureId: string) => `workspaces/${ws}/users/${uid}/ai_results/${featureId}`,
  libraryLayout: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/data/library_layout`,
  graphLinkStatus: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/graph/linkStatus`,
  annualShelf: (ws: string, uid: string, year: number | string) => `workspaces/${ws}/users/${uid}/annual_shelf/${year}`,
  /** Cloud Storage prefix for the user's uploaded files (covers, …). */
  storagePrefix: (ws: string, uid: string) => `workspaces/${ws}/users/${uid}/`,
} as const;

export const AuditPaths = {
  aiCall: (uid: string, id: string) => `audit/ai_calls/${uid}/${id}`,
  aiCalls: (uid: string) => `audit/ai_calls/${uid}`,
} as const;
