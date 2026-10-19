import { expect, type Page } from '@playwright/test';

const PROJECT = 'demo-marginalia';
export const WS = 'default';

/** Creates an Auth-emulator user and returns its uid. */
export async function createUser(email: string, password: string): Promise<string> {
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = (await res.json()) as { localId?: string };
  if (!json.localId) throw new Error(`signUp failed: ${JSON.stringify(json)}`);
  return json.localId;
}

/** Lists documents of a collection through the Firestore emulator REST API (bypasses rules). */
export async function listDocs(path: string): Promise<Array<{ id: string; fields: Record<string, any> }>> {
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  const json = (await res.json()) as { documents?: Array<{ name: string; fields: Record<string, any> }> };
  return (json.documents ?? []).map((d) => ({ id: d.name.split('/').pop()!, fields: d.fields }));
}

export async function skipPreloader(page: Page) {
  await page.goto('/');
  await page.click('#skipBtn');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'room', { timeout: 15_000 });
}

/** Signs in through the real login form (email path). */
export async function signIn(page: Page, email: string, password: string) {
  await page.evaluate(({ email, password }) => {
    (document.getElementById('authIdentityInput') as HTMLInputElement).value = email;
    (document.getElementById('authPasswordInput') as HTMLInputElement).value = password;
    (document.getElementById('authForm') as HTMLFormElement).requestSubmit();
  }, { email, password });
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 15_000 });
}

export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}
