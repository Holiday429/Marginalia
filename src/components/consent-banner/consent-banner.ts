// Marginalia · analytics consent banner.
// Shown until the visitor chooses; "Analytics preferences" in the footer reopens it.

import { getConsent, setConsent } from '../../services/consent.ts';
import { asset } from '../../core/asset.ts';
import './consent-banner.css';

const ID = 'consentBanner';

function close(): void {
  document.getElementById(ID)?.remove();
}

export function openConsentBanner(): void {
  if (document.getElementById(ID)) return;
  const bar = document.createElement('section');
  bar.id = ID;
  bar.className = 'consent-banner';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Analytics consent');
  bar.innerHTML = `
    <p class="consent-banner__text">
      Marginalia can use PostHog (product analytics) and Sentry (error reports) to improve the app.
      Nothing is sent unless you accept. <a href="${asset('privacy/')}">Privacy policy</a>
    </p>
    <div class="consent-banner__actions">
      <button class="consent-banner__btn" type="button" data-consent="denied">Decline</button>
      <button class="consent-banner__btn consent-banner__btn--primary" type="button" data-consent="granted">Accept</button>
    </div>`;
  bar.addEventListener('click', (event) => {
    const choice = (event.target as HTMLElement).closest<HTMLElement>('[data-consent]')?.dataset.consent;
    if (choice === 'granted' || choice === 'denied') {
      setConsent(choice);
      close();
    }
  });
  document.body.appendChild(bar);
}

/** Call once at startup: asks if the visitor has not chosen yet, and wires every "Analytics preferences" link. */
export function mountConsentBanner(): void {
  document.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-consent-open]')) openConsentBanner();
  });
  if (getConsent() === null) openConsentBanner();
}
