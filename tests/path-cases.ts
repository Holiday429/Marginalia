// One rules test case per path builder in src/firebase/paths.ts (plan 1.9).
// tests/firestore-rules.test.ts asserts this table covers every builder, so adding a path without
// deciding (and testing) who may read and write it fails the suite.

import { AuditPaths, Paths, WsPaths } from '../src/firebase/paths.ts';

export type Access =
  | 'owner-rw'                 // the owner reads and writes; everyone else is denied
  | 'owner-read-server-write'  // the owner reads; only the server writes
  | 'server-only'              // no client may read or write
  | 'public-read-owner-write'  // anyone reads; only the owner writes
  | 'not-firestore';           // a Storage prefix, covered by storage.rules

export interface PathCase { doc: string; access: Access; data?: Record<string, unknown> }

export const OWNER = 'user-a';
export const OTHER = 'user-b';
const WS = 'ws1';
const U = OWNER;

export const CASES = {
  Paths: {
    user: { doc: Paths.user(U), access: 'owner-rw', data: { settings: { language: 'en' } } },
    users: { doc: `${Paths.users()}/${U}`, access: 'owner-rw', data: { settings: { language: 'en' } } },
    rateLimit: { doc: Paths.rateLimit(U), access: 'server-only' },
    billing: { doc: Paths.billing(U), access: 'owner-read-server-write' },
    usageMonth: { doc: Paths.usageMonth(U, '2026-10'), access: 'owner-read-server-write' },
    usageMonths: { doc: `${Paths.usageMonths(U)}/2026-11`, access: 'owner-read-server-write' },
    publicProfile: { doc: Paths.publicProfile('probe-slug'), access: 'public-read-owner-write', data: { uid: U, displayName: 'P' } },
    publicProfiles: { doc: `${Paths.publicProfiles()}/probe-two`, access: 'public-read-owner-write', data: { uid: U, displayName: 'P' } },
    billingOrphans: { doc: `${Paths.billingOrphans()}/o1`, access: 'server-only' },
    emailToken: { doc: Paths.emailToken('j1'), access: 'server-only' },
    mailOutbox: { doc: Paths.mailOutbox('m1'), access: 'server-only' },
  },
  WsPaths: {
    user: { doc: WsPaths.user(WS, U), access: 'server-only' },
    userProfiles: { doc: `${WsPaths.userProfiles(WS)}/${U}`, access: 'owner-rw' },
    userProfile: { doc: WsPaths.userProfile(WS, U), access: 'owner-rw' },
    notifications: { doc: `${WsPaths.notifications(WS, U)}/n2`, access: 'owner-rw' },
    notification: { doc: WsPaths.notification(WS, U, 'n1'), access: 'owner-rw' },
    notificationsRoot: { doc: WsPaths.notificationsRoot(WS, U), access: 'server-only' },
    books: { doc: `${WsPaths.books(WS, U)}/b2`, access: 'owner-rw' },
    book: { doc: WsPaths.book(WS, U, 'b1'), access: 'owner-rw' },
    bookNote: { doc: WsPaths.bookNote(WS, U, 'b1'), access: 'owner-rw', data: { content: 'n' } },
    bookAiResult: { doc: WsPaths.bookAiResult(WS, U, 'b1', 'mindmap-gen'), access: 'owner-rw' },
    bookVisualNote: { doc: WsPaths.bookVisualNote(WS, U, 'b1', 'v1'), access: 'owner-rw' },
    highlights: { doc: `${WsPaths.highlights(WS, U)}/h2`, access: 'owner-rw' },
    highlight: { doc: WsPaths.highlight(WS, U, 'h1'), access: 'owner-rw' },
    actions: { doc: `${WsPaths.actions(WS, U)}/a2`, access: 'owner-rw' },
    action: { doc: WsPaths.action(WS, U, 'a1'), access: 'owner-rw' },
    sessions: { doc: `${WsPaths.sessions(WS, U)}/s2`, access: 'owner-rw', data: { bookId: '', startedAt: 1 } },
    session: { doc: WsPaths.session(WS, U, 's1'), access: 'owner-rw', data: { bookId: '', startedAt: 1 } },
    moments: { doc: `${WsPaths.moments(WS, U)}/b2`, access: 'owner-rw', data: { bookId: 'b2', kind: 'finish', state: 'skipped' } },
    moment: { doc: WsPaths.moment(WS, U, 'b1'), access: 'owner-rw', data: { bookId: 'b1', kind: 'finish', state: 'skipped' } },
    aiResult: { doc: WsPaths.aiResult(WS, U, 'reader-portrait'), access: 'owner-rw' },
    libraryLayout: { doc: WsPaths.libraryLayout(WS, U), access: 'owner-rw' },
    graphLinkStatus: { doc: WsPaths.graphLinkStatus(WS, U), access: 'owner-rw' },
    annualShelf: { doc: WsPaths.annualShelf(WS, U, 2026), access: 'owner-rw' },
    storagePrefix: { doc: WsPaths.storagePrefix(WS, U), access: 'not-firestore' },
  },
  AuditPaths: {
    aiCall: { doc: AuditPaths.aiCall(U, '1700000000000'), access: 'owner-read-server-write' },
    aiCalls: { doc: `${AuditPaths.aiCalls(U)}/1700000000001`, access: 'owner-read-server-write' },
  },
} satisfies Record<string, Record<string, PathCase>>;

export const BUILDERS = { Paths, WsPaths, AuditPaths } as const;
