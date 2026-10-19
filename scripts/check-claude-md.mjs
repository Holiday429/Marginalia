// Fails if CLAUDE.md names a file or directory that does not exist (plan 1.9).
// Checks (1) every entry of the "Project Structure" tree and (2) every backticked token that
// looks like a repo path or a file name. Bare file names are matched anywhere in the repo.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const text = readFileSync('CLAUDE.md', 'utf8');
const tracked = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
const baseNames = new Set(tracked.map((f) => f.split('/').pop()));
const missing = [];

// ---- 1. Project Structure tree
const section = text.split(/^## Project Structure\s*$/m)[1]?.split(/^## /m)[0] ?? '';
const block = /```[a-z]*\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
const stack = [];
for (const raw of block.split('\n')) {
  if (!raw.trim()) continue;
  const m = /^((?:[│ ]{3} |    )*)(?:[├└]── )?(\S+)/.exec(raw);
  if (!m) continue;
  const depth = raw.startsWith('src/') || /^\S+\/\s*$/.test(raw.trim()) && !/[├└]/.test(raw) ? 0 : (m[1].length / 4) + (/[├└]──/.test(raw) ? 1 : 0);
  const name = m[2].replace(/\/$/, '');
  stack.length = Math.max(0, depth);
  const isDir = m[2].endsWith('/');
  stack[depth] = name;
  const path = stack.slice(0, depth + 1).join('/');
  if (!path || path === 'src' && !isDir) continue;
  if (!existsSync(path)) missing.push(`tree: ${path}`);
}

// ---- 2. Backticked path-like tokens (outside code fences)
const prose = text.replace(/```[\s\S]*?```/g, '');
const ROOTS = /^(src|functions|shared|scripts|docs|tests|public|\.github)\//;
for (const [, token] of prose.matchAll(/`([^`\s]+)`/g)) {
  if (/[{}*<>$|=()]/.test(token) || token.includes('...') || token.startsWith('http')) continue;
  const clean = token.replace(/[.,:;]+$/, '').replace(/^\.\//, '');
  const isRooted = ROOTS.test(clean) || /^[\w.-]+\.(md|json|mjs|rules|sh|ya?ml)$/.test(clean) && clean.includes('/') === false && false;
  const fileLike = /^[\w./-]+\.(ts|js|css|html|json|md|mjs|rules|sh|yml)$/.test(clean);
  if (!isRooted && !fileLike) continue;
  if (clean.includes('/')) {
    // `services/db.ts` style references are relative to src/.
    if (!existsSync(clean) && !existsSync(`src/${clean}`)) missing.push(`ref: ${clean}`);
  } else if (!baseNames.has(clean) && !existsSync(clean)) {
    missing.push(`ref: ${clean} (no such file name in the repo)`);
  }
}

if (missing.length) {
  process.stderr.write(`CLAUDE.md names ${missing.length} path(s) that do not exist:\n${[...new Set(missing)].map((m) => `  ${m}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('check:docs ok — every path named in CLAUDE.md exists\n');
