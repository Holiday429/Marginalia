/* Marginalia · weekly digest email markup (plan 2.4). Pure: content + link builders in, subject/html/text out.
   Email clients ignore stylesheets and web fonts, so this uses inline styles and a system serif; the
   colour values are therefore literal here (the app's design tokens cannot reach an email). */

import { TIER_LABEL } from '../_shared/resurface';
import type { DigestContent, EmailMessage } from './types';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export interface DigestLinks {
  highlight(id: string, tier: '7d' | '30d' | '90d', rating: 'resonates' | 'thought' | 'action' | 'dismiss'): string;
  action(id: string, op: 'done' | 'snooze'): string;
  unsubscribe: string;
  app: string;
  settings: string;
}

const PAPER = '#f3ede2';
const INK = '#1a1714';
const MUTED = '#6b6259';
const ACCENT = '#8b3120';
const RULE = '#d8cfbd';

const button = (href: string, label: string, primary = false) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border:1px solid ${primary ? INK : RULE};border-radius:4px;background:${primary ? INK : 'transparent'};color:${primary ? PAPER : INK};font:14px Georgia,serif;text-decoration:none">${esc(label)}</a>`;

export function subjectFor(content: DigestContent): string {
  const n = content.highlights.length;
  if (n && content.action) return `Marginalia: ${n === 1 ? 'a highlight' : `${n} highlights`} and an action for this week`;
  if (n) return n === 1 ? 'Marginalia: a highlight worth another look' : `Marginalia: ${n} highlights worth another look`;
  return 'Marginalia: an action is due';
}

export function buildDigestEmail(
  content: DigestContent,
  links: DigestLinks,
  opts: { to: string; postalAddress?: string },
): EmailMessage {
  const highlightBlocks = content.highlights.map((h) => `
    <div style="margin:0 0 28px;padding:0 0 24px;border-bottom:1px solid ${RULE}">
      <p style="margin:0 0 6px;font:12px Courier New,monospace;color:${MUTED}">${esc(TIER_LABEL[h.tier])}</p>
      <p style="margin:0 0 6px;font:18px/1.5 Georgia,serif;color:${INK}">${esc(h.quote)}</p>
      <p style="margin:0 0 14px;font:13px Courier New,monospace;color:${MUTED}">${h.bookTitle ? `— ${esc(h.bookTitle)}` : 'Not attributed to a book yet'}</p>
      ${button(links.highlight(h.id, h.tier, 'resonates'), 'Still holds', true)}${button(links.highlight(h.id, h.tier, 'thought'), 'Add a thought')}${button(links.highlight(h.id, h.tier, 'action'), 'Turn into action')}${button(links.highlight(h.id, h.tier, 'dismiss'), 'Stop reminding')}
    </div>`).join('');

  const actionBlock = content.action ? `
    <div style="margin:0 0 28px">
      <p style="margin:0 0 6px;font:12px Courier New,monospace;color:${MUTED}">An action is due${content.action.bookTitle ? ` · ${esc(content.action.bookTitle)}` : ''}</p>
      <p style="margin:0 0 14px;font:18px/1.5 Georgia,serif;color:${INK}">${esc(content.action.text)}</p>
      ${button(links.action(content.action.id, 'done'), 'Mark done', true)}${button(links.action(content.action.id, 'snooze'), 'Remind me next week')}
    </div>` : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subjectFor(content))}</title></head>
<body style="margin:0;padding:24px 12px;background:${PAPER}">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:28px 24px;border-top:3px solid ${ACCENT}">
    <p style="margin:0 0 24px;font:22px Georgia,serif;color:${INK}">Marginalia</p>
    <p style="margin:0 0 24px;font:15px/1.5 Georgia,serif;color:${MUTED}">${content.highlights.length ? 'Lines you saved a while ago. Answer with one tap; nothing needs a login.' : 'Something you meant to do.'}</p>
    ${highlightBlocks}${actionBlock}
    <p style="margin:0 0 8px;font:13px Courier New,monospace"><a href="${esc(links.app)}" style="color:${ACCENT}">Open Marginalia</a></p>
    <p style="margin:24px 0 0;font:12px/1.6 Courier New,monospace;color:${MUTED}">
      You get this because you turned on the weekly email. <a href="${esc(links.settings)}" style="color:${MUTED}">Change when it comes</a> or
      <a href="${esc(links.unsubscribe)}" style="color:${MUTED}">unsubscribe</a>.<br>${esc(opts.postalAddress || 'Marginalia')}
    </p>
  </div>
</body></html>`;

  const text = [
    'Marginalia',
    '',
    ...content.highlights.flatMap((h) => [
      `${TIER_LABEL[h.tier]}${h.bookTitle ? ` — ${h.bookTitle}` : ''}`,
      `"${h.quote}"`,
      `Still holds: ${links.highlight(h.id, h.tier, 'resonates')}`,
      `Add a thought: ${links.highlight(h.id, h.tier, 'thought')}`,
      `Turn into action: ${links.highlight(h.id, h.tier, 'action')}`,
      `Stop reminding: ${links.highlight(h.id, h.tier, 'dismiss')}`,
      '',
    ]),
    ...(content.action ? [
      `An action is due: ${content.action.text}`,
      `Mark done: ${links.action(content.action.id, 'done')}`,
      `Remind me next week: ${links.action(content.action.id, 'snooze')}`,
      '',
    ] : []),
    `Open Marginalia: ${links.app}`,
    `Change when it comes: ${links.settings}`,
    `Unsubscribe: ${links.unsubscribe}`,
    opts.postalAddress || 'Marginalia',
  ].join('\n');

  return {
    to: opts.to,
    subject: subjectFor(content),
    html,
    text,
    headers: { 'List-Unsubscribe': `<${links.unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
