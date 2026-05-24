import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest configuration for Lexora (Next.js 14 + Supabase).
 *
 * - Environment: node by default. Tests that need DOM should opt-in
 *   via the `// @vitest-environment jsdom` directive at the top of the file.
 * - Paths alias `@/…` → project root, to mirror tsconfig.json.
 * - E2E directories are excluded (this project has none yet, but we keep
 *   the `e2e/` and `playwright/` exclusions for forward compatibility).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['**/*.component.test.{ts,tsx}', 'jsdom'],
      ['**/components/**/*.test.{ts,tsx}', 'jsdom'],
    ],
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
    ],
    exclude: [
      'node_modules',
      '.next',
      'e2e',
      'playwright',
      'tests/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['lib/**/*.ts'],
      exclude: [
        'lib/**/*.test.ts',
        'lib/**/*.d.ts',
        'node_modules',
        '.next',
      ],
    },
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
