import { defineConfig, devices } from '@playwright/test'

/**
 * Configuration Playwright (E2E navigateur) — cf. claudecode.md Étape 3.
 *
 * Isolation vis-à-vis de Vitest :
 *   - testDir dédié `tests/playwright/` (exclu de vitest.config.ts).
 *   - Vitest garde les `tests/**\/*.spec.ts` unitaires ; Playwright ne lit que
 *     ce dossier.
 *
 * Navigateur : Chromium est pré-installé dans l'environnement
 * (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers) — NE PAS lancer `playwright install`.
 * En cas de skew de version, surcharger via PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const CHROMIUM_EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {},
      },
    },
  ],
  // Démarre l'app Next.js pour les tests. En CI, le workflow playwright.yml a
  // déjà fait `npm run build` → on lance `npm run start` (prod, rapide). En local,
  // `npm run dev` et on réutilise un serveur déjà lancé s'il y en a un.
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
