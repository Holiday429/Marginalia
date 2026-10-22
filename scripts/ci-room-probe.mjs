#!/usr/bin/env node
// Measures how the 3D room behaves in headless Chromium under different GL setups, to find why it hangs on a hosted Linux CI
// runner. Usage: start `vite preview` on :4173, then `node scripts/ci-room-probe.mjs`. Prints one line per variant.
import { chromium } from '@playwright/test';

const URL = process.env.PROBE_URL || 'http://localhost:4173/';
const VARIANTS = {
  current: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  'angle-swiftshader-webgl': ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  'swiftshader-no-vsync': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  'no-gpu-compositing': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'],
};
const only = (process.env.PROBE_ONLY || '').split(',').filter(Boolean);

const out = (line) => process.stdout.write(`${line}\n`);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const ms = (n) => `${Math.round(n)}ms`;

async function probe(name, args) {
  const started = Date.now();
  const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', args });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 80)));
    await page.addInitScript(() => { try { localStorage.setItem('marginalia:consent', 'denied'); } catch { /* ignore */ } });

    const gl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return 'NO WEBGL';
      const ext = g.getExtension('WEBGL_debug_renderer_info');
      return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl (no renderer info)';
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#skipBtn', { timeout: 60_000 });
    await page.click('#skipBtn');
    const t0 = Date.now();
    await page.waitForSelector('body[data-view="room"]', { timeout: 60_000 });
    const toRoomView = Date.now() - t0;
    await page.waitForTimeout(8000); // let the models and textures finish

    const fps = await page.evaluate(() => new Promise((resolve) => {
      let n = 0; const t = performance.now();
      const tick = () => { n += 1; if (performance.now() - t < 3000) requestAnimationFrame(tick); else resolve(n / 3); };
      requestAnimationFrame(tick);
    }));
    const roundtrips = [];
    for (let i = 0; i < 10; i++) { const s = Date.now(); await page.evaluate(() => 1); roundtrips.push(Date.now() - s); }
    const resizes = [];
    for (const [w, h] of [[1024, 768], [1440, 900], [880, 1100]]) { const s = Date.now(); await page.setViewportSize({ width: w, height: h }); resizes.push(Date.now() - s); }
    const hashHop = [];
    for (const h of ['#search', '#room', '#library', '#room']) {
      const s = Date.now();
      await page.evaluate((x) => { window.location.hash = x; }, h);
      await page.waitForTimeout(300);
      hashHop.push(Date.now() - s - 300);
    }
    out(`${name.padEnd(26)} gl="${gl}"  fps=${fps.toFixed(1)}  evaluate(median)=${ms(median(roundtrips))} max=${ms(Math.max(...roundtrips))}  setViewport=[${resizes.map(ms).join(', ')}]  hash hops=[${hashHop.map(ms).join(', ')}]  toRoomView=${ms(toRoomView)}  errors=${errors.length}  total=${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    out(`${name.padEnd(26)} FAILED after ${Math.round((Date.now() - started) / 1000)}s: ${String(err).slice(0, 160)}`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

for (const [name, args] of Object.entries(VARIANTS)) {
  if (only.length && !only.includes(name)) continue;
  await Promise.race([probe(name, args), new Promise((r) => setTimeout(() => { out(`${name.padEnd(26)} TIMEOUT (150s)`); r(); }, 150_000))]);
}
process.exit(0);
