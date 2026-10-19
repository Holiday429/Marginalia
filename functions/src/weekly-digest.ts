/* Marginalia · weekly digest + email link functions (plan 2.4).
   weeklyDigest   — scheduled daily; sends to readers whose chosen weekday it is (see digest/run.ts).
   emailAction    — HTTP; what a click in the email does (see digest/actions.ts).
   Action reminders now reach people through the weekly email too (the due action in the digest);
   action-reminders.ts keeps only the in-app notification and never sends email.

   Configuration (docs/open-questions.md Q2.4-a): EMAIL_PROVIDER, EMAIL_FROM, EMAIL_API_KEY, EMAIL_LINK_SECRET,
   EMAIL_ACTION_BASE_URL, APP_BASE_URL, EMAIL_POSTAL_ADDRESS, optional POSTHOG_KEY / POSTHOG_HOST.
   With no provider configured the scheduled run logs that and sends nothing, so deploying is safe.
*/

import * as scheduler from 'firebase-functions/v2/scheduler';
import * as https from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { DEFAULT_WORKSPACE_ID } from './_shared/paths';
import { allowedOrigins } from './ai-config';
import { handleEmailAction } from './digest/actions';
import { reportEmailClick } from './digest/analytics';
import { runWeeklyDigest } from './digest/run';
import { createEmailSender } from './digest/senders';
import { Paths } from './_shared/paths';

const db = admin.firestore();
const workspaceId = () => process.env.WORKSPACE_ID || DEFAULT_WORKSPACE_ID;

export const weeklyDigest = scheduler.onSchedule(
  { schedule: 'every day 07:00', timeZone: 'UTC', secrets: ['EMAIL_LINK_SECRET'] },
  async () => {
    const sender = createEmailSender(process.env, db);
    if (sender.name === 'none') {
      console.warn('[weekly-digest] no email provider configured (EMAIL_PROVIDER); nothing sent');
      return;
    }
    const summary = await runWeeklyDigest({
      db,
      workspaceId: workspaceId(),
      sender,
      linkSecret: process.env.EMAIL_LINK_SECRET ?? '',
      actionBaseUrl: process.env.EMAIL_ACTION_BASE_URL ?? '',
      appBaseUrl: process.env.APP_BASE_URL ?? allowedOrigins()[0] ?? '',
      postalAddress: process.env.EMAIL_POSTAL_ADDRESS,
      getEmail: async (uid) => (await admin.auth().getUser(uid).catch(() => null))?.email ?? null,
    });
    console.info('[weekly-digest]', JSON.stringify({ ...summary, recipients: summary.recipients.length }));
  },
);

export const emailAction = https.onRequest({ secrets: ['EMAIL_LINK_SECRET'], cors: false }, async (req, res) => {
  const post = req.method === 'POST';
  if (req.method !== 'GET' && !post) { res.status(405).send('Method not allowed'); return; }
  const token = String((post ? req.body?.t ?? req.query.t : req.query.t) ?? '');
  const result = await handleEmailAction(
    { db, linkSecret: process.env.EMAIL_LINK_SECRET ?? '', appBaseUrl: process.env.APP_BASE_URL ?? allowedOrigins()[0] ?? '' },
    { method: post ? 'POST' : 'GET', token, text: post ? String(req.body?.text ?? '') : undefined },
  );

  if (result.uid && result.kind !== 'unsub') {
    const consent = (await db.doc(Paths.user(result.uid)).get()).data()?.settings?.analyticsConsent as 'granted' | 'denied' | undefined;
    await reportEmailClick(process.env, consent, { uid: result.uid, action: `${result.kind}:${result.answer ?? ''}`, outcome: result.outcome });
  }

  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
  res.status(result.status).type('html').send(result.html);
});
