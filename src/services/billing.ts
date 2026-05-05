/* Marginalia · Billing service
   Client-side only. Calls the createCheckout Cloud Function to get a Lemon
   Squeezy checkout URL, then opens it in a new tab.
   No API key ever touches the client.
*/

import { ENV } from '../core/env.ts';
import { logEvent } from './analytics.ts';

declare const firebase: {
  auth(): { currentUser: { getIdToken(): Promise<string> } | null };
};

async function getIdToken(): Promise<string | null> {
  try {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Creates a Lemon Squeezy checkout session via Cloud Function and returns the URL.
 * Throws if the user is not signed in or the function call fails.
 */
export async function getCheckoutUrl(plan: 'pro_monthly' | 'pro_yearly' | 'lifetime'): Promise<string> {
  const checkoutFnUrl = ENV.CHECKOUT_URL;
  if (!checkoutFnUrl) {
    throw new Error('Checkout URL not configured. Set VITE_CHECKOUT_URL in your .env file.');
  }

  const token = await getIdToken();
  if (!token) {
    throw new Error('Not signed in. Please log in to upgrade.');
  }

  const res = await fetch(checkoutFnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ plan }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let message = `Checkout error ${res.status}`;
    try { message = (JSON.parse(body) as { error?: string }).error || message; } catch { /* raw */ }
    throw new Error(message);
  }

  const { url } = (await res.json()) as { url: string };
  if (!url) throw new Error('No checkout URL returned');

  logEvent('checkout_initiated', { plan });
  return url;
}

/**
 * Opens a checkout tab for the given plan.
 * Shows an error note via the provided callback if anything fails.
 */
export async function openCheckout(
  plan: 'pro_monthly' | 'pro_yearly' | 'lifetime',
  onError: (msg: string) => void
): Promise<void> {
  try {
    const url = await getCheckoutUrl(plan);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to open checkout. Try again.';
    onError(msg);
  }
}
