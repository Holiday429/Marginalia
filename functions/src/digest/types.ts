/* Marginalia · weekly digest: shared types. */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** e.g. List-Unsubscribe */
  headers?: Record<string, string>;
}

/** The only thing the digest knows about email delivery. A provider is one implementation of this. */
export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('No email provider is configured (set EMAIL_PROVIDER). See docs/open-questions.md Q2.4-a.');
    this.name = 'EmailNotConfiguredError';
  }
}

export interface DigestPrefs { enabled?: boolean; day?: number; lastSentAt?: number }

export interface DigestHighlight {
  id: string;
  quote: string;
  bookId: string;
  bookTitle: string;
  tier: '7d' | '30d' | '90d';
}

export interface DigestAction {
  id: string;
  text: string;
  bookId: string;
  bookTitle: string;
  ageDays: number;
}

export interface DigestContent {
  highlights: DigestHighlight[];
  action: DigestAction | null;
}

export type LinkKind = 'hl' | 'act' | 'unsub';

export interface LinkPayload {
  v: 1;
  /** kind: highlight answer, action answer, or unsubscribe */
  k: LinkKind;
  /** user id */
  u: string;
  /** workspace id */
  w: string;
  /** highlight or action id (empty for unsubscribe) */
  i: string;
  /** tier the link was issued for (highlights) */
  t?: '7d' | '30d' | '90d';
  /** answer: resonates | thought | action | dismiss for highlights; done | snooze for actions */
  r?: string;
  /** expiry, epoch ms */
  e: number;
  /** unique id; the ledger entry that makes a link single-use */
  j: string;
}
