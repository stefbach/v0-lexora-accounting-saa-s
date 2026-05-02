import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Lexora E2E tests (Sprint 10).
 *
 * Conventions :
 *   • Specs are located under `tests/e2e/`.
 *   • baseURL is the local dev server (http://localhost:3000).
 *     Override via env var BASE_URL when running against a staging instance.
 *   • Tests requiring a real DB will detect `DATABASE_URL_TEST` and
 *     `test.skip()` if absent — keeps CI green even without a test DB.
 *   • One retry on CI (the dev server can be slow on first hit), 0 in local
 *     to surface flakiness instantly.
 *   • 30 s test timeout — enough for our heaviest workflows (clôture
 *     mensuelle traverses several RPC calls).
 *
 * NOTE : we do NOT auto-start the Next.js dev server here. CI is responsible
 * for starting/seeding it; locally the dev runs `npm run dev` in another
 * terminal. See README / .github/workflows/test.yml.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Only Playwright specs — never collect vitest unit tests.
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
