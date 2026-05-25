import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

/**
 * Config vitest dédiée aux tests E2E "intégration" du dossier
 * `tests/e2e/`. La config racine (`vitest.config.ts`) exclut
 * volontairement `tests/e2e/**` pour ne pas les exécuter dans le
 * pipeline standard `npm test` (ils peuvent être plus lents et
 * dépendent du mock Supabase).
 *
 * Usage :
 *   npx vitest run --config=tests/e2e/vitest-e2e.config.mjs
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: repoRoot,
    include: ['tests/e2e/**/*.spec.ts'],
    exclude: ['node_modules', '.next'],
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': repoRoot,
    },
  },
})
