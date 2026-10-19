/* Marginalia · email senders (plan 2.4).
   The digest only talks to the EmailSender interface. Two implementations exist today:
   - MockEmailSender: keeps messages in memory and, given a Firestore handle, in mail_outbox/ (server-only),
     so local runs and tests can read what would have been sent.
   - NoProviderSender: refuses with a clear error until a real provider is wired in.
   THE CONNECTION POINT FOR A REAL PROVIDER is createEmailSender() below: add a case for the provider
   chosen in docs/open-questions.md Q2.4-a (Resend, Postmark, …) that implements EmailSender.send().
*/

import { Paths } from '../_shared/paths';
import { EmailNotConfiguredError, type EmailMessage, type EmailSender } from './types';

interface OutboxDb { doc(path: string): { set(data: unknown): Promise<unknown> } }

export class MockEmailSender implements EmailSender {
  readonly name = 'mock';
  readonly sent: Array<EmailMessage & { id: string }> = [];
  private n = 0;

  constructor(private readonly db?: OutboxDb) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const id = `mock-${Date.now()}-${(this.n += 1)}`;
    this.sent.push({ ...message, id });
    if (this.db) await this.db.doc(Paths.mailOutbox(id)).set({ ...message, id, sentAt: Date.now() });
    return { id };
  }
}

export class NoProviderSender implements EmailSender {
  readonly name = 'none';
  async send(): Promise<{ id: string }> { throw new EmailNotConfiguredError(); }
}

/**
 * Chooses the sender from the environment.
 *   EMAIL_PROVIDER=mock   → MockEmailSender (also the default inside the Functions emulator)
 *   anything else / unset → NoProviderSender (the digest then skips sending and says why)
 */
export function createEmailSender(env: NodeJS.ProcessEnv, db?: OutboxDb): EmailSender {
  const provider = (env.EMAIL_PROVIDER ?? (env.FUNCTIONS_EMULATOR === 'true' ? 'mock' : '')).toLowerCase();
  if (provider === 'mock') return new MockEmailSender(db);
  // case 'resend':   return new ResendSender(env.EMAIL_API_KEY, env.EMAIL_FROM);
  // case 'postmark': return new PostmarkSender(env.EMAIL_API_KEY, env.EMAIL_FROM);
  return new NoProviderSender();
}
