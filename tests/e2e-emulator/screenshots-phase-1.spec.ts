import { test } from '@playwright/test';
import { createUser, openView, signIn, skipPreloader } from './helpers';

// Plan rule 8: UI-touching tasks are captured at 390×844, 768×1024 and 1440×900.
const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
] as const;

for (const size of SIZES) {
  test(`1.5 screenshots at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const dir = 'tests/screenshots/phase-1';

    // Demo visitor: Search shelf + Profile.
    await skipPreloader(page);
    await page.waitForTimeout(1500);
    await openView(page, 'Search');
    await page.screenshot({ path: `${dir}/1.5-demo-search-${size.name}.png` });
    // At 390px the top nav only shows the Map icon (known defect, plan task 3.4), so Profile and
    // the other tabs are unreachable by click there; capture Profile at the wider sizes only.
    if (size.width >= 768) {
      await openView(page, 'Profile');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${dir}/1.5-demo-profile-${size.name}.png` });
    }

    // New account: empty Search shelf.
    const email = `shot-${size.name}-${Date.now()}@example.com`;
    await createUser(email, 'correct-horse-1');
    await signIn(page, email, 'correct-horse-1');
    await page.waitForTimeout(1500);
    if (size.width >= 768) await openView(page, 'Search');
    await page.screenshot({ path: `${dir}/1.5-new-account-search-${size.name}.png` });
  });
}
