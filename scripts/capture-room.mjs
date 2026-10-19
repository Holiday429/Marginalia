// Captures the room from each camera pose for before/after comparison (plan 1.6).
//   node scripts/capture-room.mjs --tag=before|after [--url=http://localhost:4173]
//   node scripts/capture-room.mjs --poster=1 --out=poster.png   (then: cwebp -q 72 poster.png -o public/room-poster.webp)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const { chromium } = require('playwright-core');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const tag = arg('tag', 'after');
const url = arg('url', 'http://localhost:4173');
const dir = 'tests/screenshots/phase-1';
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.click('#skipBtn');
await page.waitForSelector('body[data-view="room"]', { timeout: 60_000 });
await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => undefined);
await page.waitForTimeout(6000);
if (arg('poster', '') === '1') {
  // Stage-only still of the default (front) camera, used as the load-time poster: hide every
  // piece of UI chrome so the poster is just the room (the real nav sits on top of it later).
  await page.addStyleTag({ content: '#view-room > :not(.room-shell), .room-sidebar, .room-top-tabs, .room-settings-trigger, .room-settings-panel, .room-focus-dock, [data-room-pose], .room-pose-bar { display: none !important; }' });
  await page.evaluate(() => {
    document.querySelectorAll('body *').forEach((el) => {
      const t = (el.firstChild && el.firstChild.nodeType === 3 ? el.textContent : '') || '';
      if (/^\s*(⚠\s*)?LIVE:/.test(t) || /^\s*Reading\s*$/.test(t)) el.style.display = 'none';
    });
    document.querySelectorAll('[data-room-pose]').forEach((b) => b.parentElement && (b.parentElement.style.display = 'none'));
  });
  await page.waitForTimeout(500);
  await page.locator('#roomExperienceStage').screenshot({ path: arg('out', 'room-poster.png') });
  await browser.close();
  process.stdout.write('captured poster\n');
  process.exit(0);
}
for (const pose of ['front', 'approach', 'shelf', 'notes']) {
  await page.locator(`[data-room-pose="${pose}"]`).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${dir}/room-${tag}-${pose}.png` });
}
await browser.close();
process.stdout.write(`captured ${tag}\n`);
