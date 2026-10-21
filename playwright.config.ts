import { defineConfig, devices } from '@playwright/test';

// Marginalia · Playwright e2e config
// P0 smoke suite runs against a production build served by `vite preview`,
// unauthenticated demo path only (see docs/refactor-plan.md Phase 0).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // software-GL Chrome tests are heavy; run them one at a time
  timeout: 90_000, // the navigation tests resize and route the 3D room several times; on a CI runner that is slow, not broken
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Locally use the installed Chrome (no browser download needed); CI installs Playwright's Chromium.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome', launchOptions: { args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
