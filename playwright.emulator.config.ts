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
  webServer: {
    command: 'npx vite --mode emulator --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
