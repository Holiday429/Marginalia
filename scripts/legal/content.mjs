// Marginalia · legal page content (templates drafted by Claude Code; final text is the owner's).
// Plain data → rendered by scripts/build-legal-pages.mjs. Keep statements true to how the app works.

/** Third parties that process data. The privacy page lists exactly these; tests assert it. */
export const PROCESSORS = [
  { name: 'Google (Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Functions)', purpose: 'Sign-in, storing your library and account data, file uploads, running our server code', data: 'Account details, everything you save in Marginalia, server logs', link: 'https://policies.google.com/privacy' },
  { name: 'DeepSeek', purpose: 'Generating AI features when you press a Generate button', data: 'Book title, author, summary, tags, and the highlights, notes and actions you saved for that book (or, for profile features, a summary of your library). Never your email, name or user id.', link: 'https://www.deepseek.com/privacy_policy' },
  { name: 'PostHog', purpose: 'Product analytics (only if you accept analytics)', data: 'Pseudonymous user id and events such as "book added"', link: 'https://posthog.com/privacy' },
  { name: 'Sentry', purpose: 'Error reports (only if you accept analytics)', data: 'Error details, browser and page information, pseudonymous user id', link: 'https://sentry.io/privacy/' },
  { name: 'Lemon Squeezy', purpose: 'Taking payments as merchant of record, subscriptions and invoices', data: 'Name, email, billing details and card data are handled by Lemon Squeezy; we receive your plan, status and renewal date', link: 'https://www.lemonsqueezy.com/privacy' },
  { name: 'Vercel', purpose: 'Hosting and delivering the website', data: 'IP address and request logs', link: 'https://vercel.com/legal/privacy-policy' },
  { name: 'Google Fonts', purpose: 'Delivering web fonts (until fonts are self-hosted)', data: 'IP address and request information', link: 'https://developers.google.com/fonts/faq/privacy' },
];

export function privacySections(c) {
  return [
    { h: 'Who we are', p: [`${c.productName} is a personal reading-records service operated by ${c.operatorName}, ${c.operatorAddress} ("we", "us"). You can reach us about anything in this policy at ${c.contactEmail}.`] },
    { h: 'What we collect', ul: [
      '**Account data** — email address, username and display name, optional avatar. If you sign in with Google we receive the name, email and photo Google shares with us.',
      '**Your reading content** — books, statuses, notes, highlights, actions and reminders, reading-session times, library layout, AI-generated blocks and cover images you upload. This is the point of the service, and it is private to you unless you publish it.',
      '**Public profile (optional)** — if you turn it on, a public page shows your display name, avatar, bio and the books and sections you choose, under the address you pick. Nothing is public by default.',
      '**Payments** — Lemon Squeezy takes payment. We never see card numbers. We store your plan, subscription status, renewal date and a customer-portal link.',
      '**Technical data** — IP address and request logs kept by our hosting and cloud providers, and basic rate-limit counters.',
      '**Analytics and error reports** — only if you accept them in the consent banner: events such as "book added" and error details, tied to a pseudonymous user id (not your email).',
    ] },
    { h: 'How we use it', ul: [
      'To provide and secure the service: showing your library, syncing devices, reminders, exports.',
      'To run AI features you ask for (see below) and to enforce fair-use limits.',
      'To bill you and manage your subscription.',
      'To improve the product, if you accepted analytics.',
      'To comply with the law and to prevent abuse.',
    ] },
    { h: 'AI features and DeepSeek', p: [
      'AI features run only when you press a Generate button. Our server builds the request from your own data for that book — title, author, summary, tags and the highlights, notes and actions you saved (a capped number of them) — or, for profile features, a summary of your library such as titles, authors, genres, a sample of highlights and your reading rhythm. We send that to DeepSeek and return the answer to you.',
      'DeepSeek is operated from China, so this is a transfer of personal data outside your country. We do not send your email, name or user id to DeepSeek. We keep a log of which feature ran and how many tokens it used, not the text. DeepSeek handles the text under its own privacy policy. If you do not want this, do not use the AI features; everything else works without them.',
    ] },
    { h: 'Who processes your data', table: true },
    { h: 'Cookies and local storage', p: [
      'We use your browser\'s local storage and IndexedDB for preferences, your analytics choice, notes kept offline and the active reading timer. We do not use advertising cookies. If you accept analytics, PostHog stores a pseudonymous id in local storage; if you decline or later withdraw (Analytics preferences link in the footer), PostHog and Sentry are not started and nothing is sent.',
    ] },
    { h: 'Sharing', p: ['We do not sell your data. We share it only with the processors above, when you publish a profile, or when the law requires.'] },
    { h: 'How long we keep it', p: [
      'We keep your data until you delete your account. Deleting your account (Settings → Delete account) removes your library, profile, files and sign-in from our systems. Copies may remain in provider backups for a limited period before they are overwritten. Payment records are kept by Lemon Squeezy as the law requires.',
    ] },
    { h: 'Your choices and rights', ul: [
      '**Export** — download your library as JSON or Markdown at any time (Settings).',
      '**Delete** — Settings → Delete account. A copy of your data downloads first. If you have a renewing subscription, cancel it first.',
      '**Access, correction, objection, restriction, portability** — available to you under laws such as the GDPR, UK GDPR, CCPA and PIPL; write to us and we will answer within the period the law gives us. Most of this you can do yourself in the app.',
      '**Analytics** — change your mind any time via "Analytics preferences" in the footer or room settings.',
      'You may also complain to your data-protection authority.',
    ] },
    { h: 'Children', p: [`${c.productName} is not for people under ${c.minimumAge}. If you believe a child has an account, contact us and we will delete it.`] },
    { h: 'International transfers', p: ['Our providers run servers in several countries, including the United States, and DeepSeek in China. Where required, we rely on standard contractual clauses or equivalent safeguards offered by those providers.'] },
    { h: 'Changes', p: ['If we change this policy in a way that matters, we will tell you in the app and update the date above.'] },
  ];
}

export function termsSections(c) {
  return [
    { h: 'Agreement', p: [`These terms are between you and ${c.operatorName} ("we"), the operator of ${c.productName}. By creating an account or using the service you agree to them and to the Privacy Policy. If you do not agree, do not use the service.`] },
    { h: 'The service', p: [`${c.productName} is a personal reading-records tool: you record books, highlights, notes and actions, and can generate AI drafts about them. It is not a reader, a social network or a source of professional advice. We may change or remove features, and will try to give notice of changes that matter.`] },
    { h: 'Your account', ul: [
      `You must be at least ${c.minimumAge} and give accurate information.`,
      'You are responsible for what happens under your account; keep your sign-in secure.',
      'One person per account. Do not share or resell access.',
    ] },
    { h: 'Your content', p: [
      'You own what you put into the service, including your notes and highlights. You give us a limited licence to store, process and display it for you, and for the public pages you choose to publish, only to run the service.',
      'Do not upload content you have no right to use. Highlights you copy from books remain subject to the rights of their authors; keep them to quotation lengths and for personal use.',
    ] },
    { h: 'AI output', p: ['AI features produce drafts. They can be wrong, incomplete or biased, especially about cultural and historical context. Check anything that matters before relying on it. You can edit every AI block; your edit always takes precedence. Usage limits apply and may change.'] },
    { h: 'Acceptable use', ul: [
      'No unlawful, infringing, harassing or hateful content on public profiles.',
      'No attempts to break, overload or scrape the service, or to bypass limits and billing.',
      'No automated access except through features we provide.',
    ] },
    { h: 'Plans and payments', ul: [
      'There is a free plan with usage limits and paid plans (monthly, yearly, lifetime). Prices and limits are shown at checkout and in Settings.',
      'Payments are processed by Lemon Squeezy as merchant of record, under its terms. Subscriptions renew automatically until cancelled; you can cancel any time in the customer portal and keep access until the end of the paid period.',
      '[Refund policy — to be set by the operator.]',
      'A lifetime plan lasts for as long as the service operates ([definition — to be set by the operator]).',
    ] },
    { h: 'Ending your use', p: ['You can delete your account at any time in Settings. We may suspend or end accounts that break these terms or the law. When an account ends your data is deleted as described in the Privacy Policy.'] },
    { h: 'Third-party material', p: ['The service includes 3D models, textures and fonts made by others under their own licences; see the Credits page.'] },
    { h: 'Disclaimers and liability', p: [
      'The service is provided "as is" and "as available". To the extent the law allows, we do not promise it will be uninterrupted or error-free and we are not liable for indirect or consequential loss or for loss of data you did not export. Nothing here limits liability that cannot be limited by law. Export your data regularly.',
    ] },
    { h: 'Governing law', p: [`${c.governingLaw}. Consumer protection rights that you have where you live still apply.`] },
    { h: 'Changes and contact', p: [`We may update these terms; if a change matters we will tell you in the app before it applies. Questions: ${c.contactEmail}.`] },
  ];
}
