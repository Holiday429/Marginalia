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
  // Analytics consent is asked on first visit; decline so the banner is out of the way.
  const decline = page.locator('[data-consent="denied"]');
  if (await decline.isVisible().catch(() => false)) await decline.click();
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

/** Titles from the demo library; none of them may ever appear for a real (signed-in) user. */
export const DEMO_TITLES = ['Sapiens', 'Dune', '活山', '红楼梦', 'Gatsby', 'Beloved'];

export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

/** Clicks the nav button of `name` that is actually on top (each panel renders its own nav copy). */
export async function openView(page: Page, name: 'Search' | 'Library' | 'Map' | 'Graph' | 'Profile') {
  // A panel that is still animating in can cover the nav for a moment, so poll instead of trying once.
  await expect.poll(() => page.evaluate((label) => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
      .filter((el) => (el.textContent || '').trim() === label);
    for (const el of buttons) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && (el === top || el.contains(top))) { el.click(); return true; }
    }
    return false;
  }, name), { message: `nav button "${name}" is reachable`, timeout: 8000, intervals: [250] }).toBe(true);
  await page.waitForTimeout(1800);
}

/** Every visible <img> in the page has loaded (naturalWidth > 0). Returns the broken srcs. */
export async function brokenImages(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.getBoundingClientRect().width > 0 && img.src && !img.src.startsWith('data:image/svg'))
      .filter((img) => !(img.complete && img.naturalWidth > 0))
      .map((img) => img.src));
}

/** Auth-emulator accounts (REST), to prove a user really is gone. */
export async function authEmulatorUsers(): Promise<Array<{ localId: string; email?: string }>> {
  const res = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-marginalia/accounts');
  const json = (await res.json()) as { users?: Array<{ localId: string; email?: string }> };
  return json.users ?? [];
}

/** Opens the Profile settings panel ("Edit Profile"). */
export async function openProfileSettings(page: Page) {
  await page.locator('#profileHeaderSettingsBtn').click();
  await page.locator('#profDeleteOpen').waitFor({ state: 'attached', timeout: 15_000 });
}
