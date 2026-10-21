#!/usr/bin/env node
// Fails when a migrated CSS file uses a colour literal or a font-size literal (docs/design-tokens.md).
// The list of migrated files is scripts/colors-migrated.txt: a page is added in the commit that migrates it,
// so the rule tightens page by page and never blocks pages that are not migrated yet.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const list = readFileSync(resolve(root, 'scripts/colors-migrated.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(|\b(?:white|black)\b/;
// Absolute sizes only: a relative size (1.4em, 90%) follows its parent and is fine.
const FONT_SIZE_LITERAL = /^[\d.]+(?:px|rem)$/;
// The type scale (docs/design-tokens.md); the other --fs-N steps are legacy.
const SCALE = new Set(['11', '12', '14', '16', '20', '28', '40', '48', '72']);

let failures = 0;
for (const rel of list) {
  const file = resolve(root, rel);
  if (!existsSync(file)) { console.error(`check:colors: ${rel} is listed but does not exist`); failures++; continue; }
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  css.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)) {
      const [, prop, rawValue] = m;
      const value = rawValue.replace(/url\([^)]*\)/g, '');
      const legacy = prop === 'font-size' ? value.match(/var\(--fs-(\d+)\)/) : null;
      if (legacy && !SCALE.has(legacy[1])) {
        console.error(`${rel}:${i + 1}  legacy size token --fs-${legacy[1]}  use 11 / 12 / 14 / 16 / 20 / 28 / 40`);
        failures++;
      } else if (prop === 'font-size' && FONT_SIZE_LITERAL.test(value.trim())) {
        console.error(`${rel}:${i + 1}  font-size literal "${value.trim()}"  use a var(--fs-*) token`);
        failures++;
      } else if (COLOR.test(value)) {
        console.error(`${rel}:${i + 1}  colour literal in "${prop}: ${value.trim().slice(0, 70)}"  use a token`);
        failures++;
      }
    }
  });
}
if (failures) { console.error(`check:colors failed: ${failures} literal(s) in migrated files`); process.exit(1); }
process.stdout.write(`check:colors ok: ${list.length} migrated file(s), no colour or font-size literals\n`);
