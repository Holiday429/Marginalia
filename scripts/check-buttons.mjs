#!/usr/bin/env node
// Fails when a <button class="..."> in a template uses neither the shared component (.btn, .chip) nor a class listed in
// scripts/buttons-allowlist.txt. The look of a button lives in src/components/button/button.css; pages choose a level.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allow = new Set(readFileSync(resolve(root, 'scripts/buttons-allowlist.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|ts|html)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

let failures = 0;
for (const file of [...walk(resolve(root, 'src')), resolve(root, 'index.html')]) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/<button\b([^>]*)>/g)) {
    const cls = m[1].match(/class="([^"]*)"/);
    if (!cls) continue; // no class: nothing to style
    const tokens = cls[1].split(/\s+/).map((t) => t.split('${')[0]).filter(Boolean);
    if (tokens.includes('btn') || tokens.includes('chip')) continue;
    if (tokens.some((t) => allow.has(t))) continue;
    const line = text.slice(0, m.index).split('\n').length;
    console.error(`${relative(root, file)}:${line}  <button class="${cls[1].slice(0, 60)}">  use .btn / .chip (docs/design-tokens.md, "Buttons") or list the class in scripts/buttons-allowlist.txt`);
    failures++;
  }
}
if (failures) { console.error(`check:buttons failed: ${failures} button(s) outside the shared component`); process.exit(1); }
process.stdout.write('check:buttons ok: every <button class> uses the shared component or is on the allowlist\n');
