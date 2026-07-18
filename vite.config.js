import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Marginalia/' : './',
  build: {
    outDir: 'dist',
  },
  test: {
    // tests/e2e/** are Playwright specs, run via `npm run test:e2e` — keep them
    // out of vitest's collection so the two runners never fight over the same files.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});
