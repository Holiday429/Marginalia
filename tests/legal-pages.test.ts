import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildPages, readShippedModels } from '../scripts/build-legal-pages.mjs';
import { PROCESSORS } from '../scripts/legal/content.mjs';

const read = (rel: string) => readFileSync(`public/${rel}/index.html`, 'utf8');

describe('legal pages', () => {
  it('committed pages are exactly what the generator produces (run npm run legal:build)', async () => {
    const pages = await buildPages();
    for (const [rel, html] of Object.entries(pages)) {
      expect(read(rel.replace('/index.html', '')), rel).toBe(html);
    }
  }, 60_000);

  it('Credits lists every model that ships, with author, source and licence', async () => {
    const models = await readShippedModels();
    expect(models.length).toBeGreaterThanOrEqual(14);
    const html = read('credits');
    for (const m of models) {
      expect(html, `title ${m.title}`).toContain(m.title.replace(/&/g, '&amp;'));
      expect(html, `source ${m.source}`).toContain(m.source);
      expect(html, `licence of ${m.title}`).toContain(m.licenceName);
    }
    // Everything we ship is attribution-only: no non-commercial licence may sneak into the app.
    expect(models.filter((m) => /NC/.test(m.licenceName))).toEqual([]);
    expect(models.filter((m) => !m.title || !m.author || !m.source)).toEqual([]);
  }, 60_000);

  it('Privacy names every third-party processor and the account controls', () => {
    const html = read('privacy');
    for (const p of PROCESSORS) expect(html, p.name).toContain(p.name.replace(/&/g, '&amp;'));
    for (const must of ['DeepSeek', 'PostHog', 'Sentry', 'Lemon Squeezy', 'Vercel', 'Firebase', 'Delete account', 'Analytics preferences']) {
      expect(html, must).toContain(must);
    }
  });

  it('every page links to the other two and makes no third-party request', () => {
    for (const rel of ['privacy', 'terms', 'credits']) {
      const html = read(rel);
      for (const other of ['privacy', 'terms', 'credits']) expect(html).toContain(`href="../${other}/"`);
      expect(html).not.toMatch(/<script|<link[^>]+href="https?:|fonts\.googleapis|@import/);
    }
  });
});
