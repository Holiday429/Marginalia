// Marginalia · legal links (footer).
// Privacy, Terms and Credits are static pages under public/ (built by scripts/build-legal-pages.mjs).

import { asset } from '../../core/asset.ts';

export function legalLinksHTML(extraClass = ''): string {
  return `
    <nav class="legal-links ${extraClass}" aria-label="Legal">
      <a class="legal-links__link" href="${asset('privacy/')}">Privacy</a>
      <a class="legal-links__link" href="${asset('terms/')}">Terms</a>
      <a class="legal-links__link" href="${asset('credits/')}">Credits</a>
      <button class="btn btn--quiet btn--sm legal-links__link legal-links__btn" type="button" data-consent-open>Analytics preferences</button>
    </nav>`;
}
