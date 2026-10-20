import { test, expect } from '@playwright/test';
import { trackPageErrors } from './helpers';

// amCharts starts its render loop inside `Root.new(<id>)` before it has looked the element up. If the element is no longer in the page
// (the Profile was re-rendered or left while amCharts was still loading), the lookup finds null, the constructor throws, the app catches
// that, and the loop it started keeps running and fails on the next animation frame with "getComputedStyle … parameter 1 is not of type
// 'Element'". It showed up as an intermittent page error in reading-session.spec.ts. ProfileMap must neither throw nor leave a loop behind.
test('a profile map whose element left the page while amCharts loaded leaves no stray render loop', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/profile/profile-map.ts';
    const { ProfileMap } = await import(/* @vite-ignore */ path);
    const element = document.createElement('div'); // never attached to the document
    await new ProfileMap(element, null, null, null, []).mount();
  });
  await page.waitForTimeout(1500); // many animation frames
  expect(errors).toEqual([]);
});
