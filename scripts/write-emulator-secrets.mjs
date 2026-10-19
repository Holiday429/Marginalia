// The Functions emulator reads secrets from functions/.secret.local instead of Secret Manager.
// This writes a FAKE model key so the e2e can run the real aiGenerate function against the fake
// model server (tests/support/mock-llm.mjs). Nothing here is a real credential.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = resolve(dirname(fileURLToPath(import.meta.url)), '../functions/.secret.local');
writeFileSync(file, 'AI_API_KEY=fake-key-for-emulator-tests\n');
process.stdout.write(`wrote ${file}\n`);
