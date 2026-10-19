// Fails if a Firestore path is spelled out anywhere except src/firebase/paths.ts (plan 1.9).
// Flags a collection()/collectionGroup()/doc() call in src/ or functions/src/ whose arguments contain
// a string literal (or a template literal without ${}), e.g. collection(db, 'users', uid) or
// doc(ref, 'notes', 'main'). Every call must take its path from Paths / WsPaths / AuditPaths.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src', 'functions/src'];
const SKIP = ['src/firebase/paths.ts', 'functions/src/_shared'];
const CALL = /(?<![\w.$])(collection|collectionGroup|doc)\(/g;
const problems = [];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.some((s) => p === s || p.startsWith(`${s}/`))) continue;
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|js)$/.test(name)) yield p;
  }
}

function argsOf(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(openIdx + 1, i);
  }
  return '';
}

/** Removes `WsPaths.book(ws, uid, 'x')`-style builder calls: their arguments are ids, not path text. */
function stripBuilderCalls(text) {
  const re = /\b(?:Paths|WsPaths|AuditPaths)\.\w+\(/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const inner = argsOf(text, open);
    out += text.slice(last, m.index) + 'BUILDER';
    last = open + inner.length + 2;
    re.lastIndex = last;
  }
  return out + text.slice(last);
}

// Method calls such as db.collection('x') / admin.firestore().doc('x') are caught too: the lookbehind
// only excludes identifiers that merely END in these words (e.g. `document(`), not member access.
const MEMBER_CALL = /\.(collection|collectionGroup|doc)\(/g;

for (const root of ROOTS) {
  for (const file of files(root)) {
    const text = readFileSync(file, 'utf8');
    for (const re of [CALL, MEMBER_CALL]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const open = m.index + m[0].length - 1;
        const args = stripBuilderCalls(argsOf(text, open).replace(/\/\/.*$/gm, ''));
        const literal = /(['"])(?:(?!\1).)*\1/.test(args) || /`[^`$]*`/.test(args);
        if (literal) {
          const line = text.slice(0, m.index).split('\n').length;
          problems.push(`${relative('.', file)}:${line}  ${m[0]}${args.replace(/\s+/g, ' ').slice(0, 90)})`);
        }
      }
    }
  }
}

// `where('field', ...)` style string args are not paths, but they sit outside these calls, so they never trigger.
if (problems.length) {
  process.stderr.write(`Literal Firestore paths found (use src/firebase/paths.ts):\n${[...new Set(problems)].join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('check:paths ok — no literal Firestore path outside src/firebase/paths.ts\n');
