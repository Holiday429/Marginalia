// Copies code shared by the web client and Cloud Functions into functions/src/_shared.
// Run automatically by `npm --prefix functions run build` (prebuild). The copy is git-ignored.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = resolve(root, 'functions/src/_shared');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(resolve(root, 'shared'), dest, { recursive: true });
cpSync(resolve(root, 'src/firebase/paths.ts'), resolve(dest, 'paths.ts'));
process.stdout.write('synced shared/ and paths.ts -> functions/src/_shared\n');
