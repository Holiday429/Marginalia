import { test, expect } from '@playwright/test';
import { WS, authEmulatorUsers, createUser, listDocs, openProfileSettings, openView, signIn, skipPreloader, trackPageErrors } from './helpers';

// Plan 1.8: Settings → Delete account → JSON downloads automatically → type DELETE → the callable
// removes the user's Firestore data and Auth user, and the app returns to the landing page.
test('delete account: export downloads, confirmation required, data and Auth user are gone', async ({ page }) => {
  const errors = trackPageErrors(page);
  const email = `leaver-${Date.now()}@example.com`;
  const uid = await createUser(email, 'correct-horse-1');
  await skipPreloader(page);
  await signIn(page, email, 'correct-horse-1');
  await page.waitForTimeout(1500);

  // Give the account some data first.
  await openView(page, 'Search');
  await page.locator('#searchNewEntryBtn').click();
  await page.locator('#neTitle').fill('A book to forget');
  await page.locator('#neAuthor').fill('Nobody');
  await page.locator('#neSubmitBtn').click();
  await expect(page.locator('#neForm')).toBeHidden({ timeout: 15_000 });
  await expect.poll(async () => (await listDocs(`workspaces/${WS}/users/${uid}/books`)).length, { timeout: 15_000 }).toBe(1);

  await openView(page, 'Profile');
  await openProfileSettings(page);

  // 1. Clicking Delete downloads a JSON copy right away and shows the confirmation.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#profDeleteOpen').click()]);
  expect(download.suggestedFilename()).toMatch(/^marginalia-export-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator('#profDeleteDialog')).toBeVisible();
  await expect(page.locator('#profDeleteDownloaded')).toContainText('was downloaded');

  // 2. Not confirmable until DELETE is typed.
  const confirm = page.locator('#profDeleteConfirm');
  await expect(confirm).toBeDisabled();
  await page.locator('#profDeleteInput').fill('delete me');
  await expect(confirm).toBeDisabled();
  await page.locator('#profDeleteInput').fill('DELETE');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // 3. Back on the landing page; everything is gone server-side.
  await expect(page.locator('#skipBtn')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await authEmulatorUsers()).some((u) => u.localId === uid), { timeout: 20_000 }).toBe(false);
  expect(await listDocs(`workspaces/${WS}/users/${uid}/books`)).toEqual([]);
  expect(await listDocs(`users`)).not.toContainEqual(expect.objectContaining({ id: uid }));
  expect(errors.filter((e) => !/FirebaseError|functions\//.test(e))).toEqual([]);
});
