import { defineConfig, devices } from '@playwright/test';

// Marginalia · Playwright config for flows that need a signed-in user.
// Runs the app in Vite `emulator` mode against the Firebase Auth + Firestore emulators:
//   npm run test:e2e:emu
export default defineConfig({
  testDir: './tests/e2e-emulator',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: process.env.CI ? undefined : 'chrome', // CI installs Playwright's Chromium
    launchOptions: { args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' } }],
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
