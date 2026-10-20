import { expect, type Page } from '@playwright/test';

const PROJECT = 'demo-marginalia';
export const WS = 'default';

/**
 * Creates an Auth-emulator user and returns its uid. The first-run guide (plan 2.9) is switched off for the
 * new account unless `guide: true`, so that it does not sit over the screen in tests about something else.
 */
export async function createUser(email: string, password: string, opts: { guide?: boolean } = {}): Promise<string> {
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = (await res.json()) as { localId?: string };
  if (!json.localId) throw new Error(`signUp failed: ${JSON.stringify(json)}`);
  if (!opts.guide) {
    const body = { fields: { settings: { mapValue: { fields: { onboarding: { mapValue: { fields: { state: { stringValue: 'skipped' } } } } } } } } };
    await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/users/${json.localId}?updateMask.fieldPaths=settings.onboarding`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify(body),
    });
  }
  return json.localId;
}

/** Lists documents of a collection through the Firestore emulator REST API (bypasses rules). */
export async function listDocs(path: string): Promise<Array<{ id: string; fields: Record<string, any> }>> {
  const out: Array<{ id: string; fields: Record<string, any> }> = [];
  let pageToken = '';
  do {
    const res = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, {
      headers: { Authorization: 'Bearer owner' },
    });
    const json = (await res.json()) as { documents?: Array<{ name: string; fields: Record<string, any> }>; nextPageToken?: string };
    for (const d of json.documents ?? []) out.push({ id: d.name.split('/').pop()!, fields: d.fields });
    pageToken = json.nextPageToken ?? '';
  } while (pageToken);
  return out;
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
  // Generous: on a long serial run of software-GL Chrome the 3D room can keep the page busy for a while.
  await expect(page.locator('#authUserMeta')).toContainText(email, { timeout: 45_000 });
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

/**
 * Opens a page through the top nav, as a reader would. Since 2.8 the nav is Library · Map · Graph · Profile and Library has two modes:
 * 'Search' means Library in Browse mode (what the nav opens), 'Library' means Library in Arrange mode (the Arrange switch after it).
 */
export async function openView(page: Page, name: 'Search' | 'Library' | 'Map' | 'Graph' | 'Profile') {
  const label = name === 'Search' ? 'Library' : name;
  // A panel that is still animating in can cover the nav for a moment, so poll instead of trying once.
  await expect.poll(() => page.evaluate((text) => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
      .filter((el) => (el.textContent || '').trim() === text);
    for (const el of buttons) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && (el === top || el.contains(top))) { el.click(); return true; }
    }
    return false;
  }, label), { message: `nav button "${label}" is reachable`, timeout: 8000, intervals: [250] }).toBe(true);
  await page.waitForTimeout(1800);
  if (name === 'Library') {
    await page.locator('.lib-mode__btn[data-view="library"]:visible').click({ timeout: 15_000 });
    await page.waitForTimeout(1800);
  }
}

/** Moves the room camera the way a reader now does: Settings → Camera. */
export async function goToPose(page: Page, pose: 'front' | 'approach' | 'shelf' | 'notes') {
  await page.locator('#roomSettingsTrigger').click();
  await page.locator(`#roomCameraControls [data-room-pose="${pose}"]`).click();
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

/** Adds a book through the real Add Book dialog; the app then shows that book's page. Returns its Firestore id. */
export async function addBookViaUi(page: Page, uid: string, title: string, author = 'Test Author'): Promise<string> {
  await openView(page, 'Search');
  await page.locator('#searchNewEntryBtn').click();
  await page.locator('#neTitle').fill(title);
  await page.locator('#neAuthor').fill(author);
  await page.locator('#neStatus').selectOption('reading');
  await page.locator('#neSubmitBtn').click();
  await expect(page.locator('#neForm')).toBeHidden({ timeout: 15_000 });
  let id = '';
  await expect.poll(async () => {
    const docs = await listDocs(`workspaces/${WS}/users/${uid}/books`);
    id = docs.find((d) => d.fields?.title?.stringValue === title || d.fields?.meta?.mapValue?.fields?.title?.stringValue === title)?.id ?? docs[docs.length - 1]?.id ?? '';
    return id;
  }, { timeout: 15_000 }).not.toBe('');
  return id;
}

/** Highlights of a user as plain { id, bookId, quote, source }. */
export async function listHighlights(uid: string) {
  const docs = await listDocs(`workspaces/${WS}/users/${uid}/highlights`);
  return docs.map((d) => ({
    id: d.id,
    bookId: d.fields.bookId?.stringValue ?? '',
    quote: d.fields.quote?.stringValue ?? '',
    source: d.fields.source?.stringValue ?? '',
  }));
}

/** Writes (merges) integer/string fields into a Firestore emulator document, bypassing rules. */
export async function writeDoc(path: string, fields: Record<string, number | string | boolean>): Promise<void> {
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v }])),
  };
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-marginalia/databases/(default)/documents/${path}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`writeDoc ${path} failed: ${res.status} ${await res.text()}`);
}

export const currentMonthKey = () => new Date().toISOString().slice(0, 7);

/** Plain values of a Firestore REST document (integers, strings, booleans only). */
export function plain(fields: Record<string, any> | undefined): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('stringValue' in v) out[k] = v.stringValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
  }
  return out;
}

/** Seeds a highlight whose first review moment is already due. */
export async function seedDueHighlight(uid: string, id: string, bookId: string, quote: string, over: Record<string, number | string | boolean> = {}): Promise<void> {
  const DAY = 86_400_000;
  const now = Date.now();
  await writeDoc(`workspaces/${WS}/users/${uid}/highlights/${id}`, {
    bookId, quote, source: 'manual', createdAt: now - 8 * DAY, updatedAt: now - 8 * DAY,
    resurface7At: now - DAY, resurface30At: now + 22 * DAY, resurface90At: now + 82 * DAY,
    resurfaced7: false, resurfaced30: false, resurfaced90: false, ...over,
  });
}
