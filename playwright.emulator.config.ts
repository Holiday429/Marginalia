import { readdirSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// One project per spec file. Playwright starts a fresh worker (and so a fresh Chrome) for each project, and that is the point:
// in one long-lived worker every test got slower than the one before (reading-session: 15 s on a fresh worker, 43 s after
// eleven tests, 1.4 min after thirty-nine) until a page was too busy to answer within a test's own waits. Restarting the
// worker restores the speed. Workers still run one at a time, in file order.
const specs = readdirSync('./tests/e2e-emulator').filter((f) => f.endsWith('.spec.ts')).sort();

// Marginalia · Playwright config for flows that need a signed-in user.
// Runs the app in Vite `emulator` mode against the Firebase Auth + Firestore emulators:
//   npm run test:e2e:emu
export default defineConfig({
  testDir: './tests/e2e-emulator',
  // Loads every Cloud Function once before the first test, so no test pays the Functions
  // emulator's cold start inside its own timeout. See the file header for the full reason.
  globalSetup: './tests/e2e-emulator/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 150_000, // software-GL Chrome on a long serial run: slow is not the same as broken
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: process.env.CI ? undefined : 'chrome', // CI installs Playwright's Chromium
    launchOptions: { args: process.env.CI ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'] }, // CI: see playwright.config.ts
  },
  projects: specs.map((file) => ({
    name: file.replace(/\.spec\.ts$/, ''),
    testMatch: file,
    use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' },
  })),
  webServer: [
    {
      // Fake model for the real aiGenerate function running in the Functions emulator (see tests/support/mock-llm.mjs).
      command: 'node tests/support/mock-llm.mjs',
      url: 'http://127.0.0.1:5180/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx vite --mode emulator --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Production build with FAKE analytics keys: lets consent.spec.ts prove nothing is sent before
      // consent (Sentry only initialises in production builds). No real keys, no real traffic.
      command: 'VITE_POSTHOG_KEY=phc_consent_test VITE_POSTHOG_HOST=https://eu.i.posthog.com VITE_SENTRY_DSN=https://abc123@o1.ingest.sentry.io/1 npx vite build --mode emulator --outDir dist-consent && npx vite preview --outDir dist-consent --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
