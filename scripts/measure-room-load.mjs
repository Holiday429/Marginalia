// Measures what loading the room costs: every response byte from "open the landing page" until the
// room has settled, plus uncaught page errors. Plan 1.6 budget: <= 12 MB, 0 pageerrors.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/measure-room-load.mjs [--url http://localhost:4173] [--throttle fast4g] [--json]
//
// Bytes are the sizes the server sent (CDP encodedDataLength), i.e. what the network carries.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const { chromium } = require('playwright-core');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const url = arg('url', 'http://localhost:4173');
const throttle = arg('throttle', 'none');
const asJson = process.argv.includes('--json');

const THROTTLES = {
  none: null,
  // Chrome DevTools "Fast 4G" preset
  fast4g: { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8 * 0.9, uploadThroughput: (750 * 1024) / 8 * 0.9 },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
if (THROTTLES[throttle]) await cdp.send('Network.emulateNetworkConditions', THROTTLES[throttle]);

const requests = new Map();
cdp.on('Network.requestWillBeSent', (e) => requests.set(e.requestId, { url: e.request.url, bytes: 0 }));
cdp.on('Network.loadingFinished', (e) => { const r = requests.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

const t0 = Date.now();
await page.goto(url);
await page.waitForSelector('#skipBtn', { timeout: 30_000 });
const tClick = Date.now();
await page.click('#skipBtn');
// Poster = the still of the room shown while the 3D scene loads; time from the click until it is painted.
await page.waitForFunction(() => {
  const img = document.querySelector('.room-poster');
  return Boolean(img && img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().width > 0);
}, null, { timeout: 60_000 }).catch(() => undefined);
const msToPoster = Date.now() - tClick;
await page.waitForSelector('body[data-view="room"]', { timeout: 60_000 });
const tRoom = Date.now() - t0;
await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => undefined);
await page.waitForTimeout(4000);
await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);

const rows = [...requests.values()].filter((r) => r.bytes > 0).sort((a, b) => b.bytes - a.bytes);
const total = rows.reduce((s, r) => s + r.bytes, 0);
const result = {
  url, throttle,
  totalBytes: total,
  totalMB: Number((total / 1024 / 1024).toFixed(1)),
  requests: rows.length,
  msToRoomView: tRoom,
  msClickToPoster: msToPoster,
  pageErrors: errors,
  top: rows.slice(0, 15).map((r) => ({ mb: Number((r.bytes / 1024 / 1024).toFixed(2)), url: r.url.replace(url, '') })),
};
await browser.close();

if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  process.stdout.write(`Room load: ${result.totalMB} MB in ${result.requests} responses, poster ${msToPoster} ms after the click, room view after ${tRoom} ms, ${errors.length} pageerror(s)\n`);
  result.top.forEach((r) => process.stdout.write(`  ${String(r.mb).padStart(7)} MB  ${r.url}\n`));
  errors.forEach((e) => process.stdout.write(`  pageerror: ${e}\n`));
}
