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
 *
 * ─── Coverage scope (V5-47) ─────────────────────────────────────────
 * `coverage.exclude` is intentionally aggressive. We exclude four
 * categories of files that are either fundamentally untestable in a
 * node unit-test context or owned by dedicated integration suites:
 *
 *   1. Infrastructure adapters (Supabase clients, middleware, storage,
 *      email/google/telegram/scrapers/PDF). These require live network
 *      / browser globals and are exercised by E2E tests instead.
 *
 *   2. Static dictionaries (i18n chunks, help content, jurisdictions/
 *      countries). They have no runtime branches; lifting them into the
 *      metric only inflates the denominator without expressing real
 *      assurance. Smoke-imported in `tests/coverage-gap-i18n.spec.ts`
 *      and `coverage-gap-help.spec.ts`.
 *
 *   3. UI-agent helpers (lib/contrats, lib/factures, lib/juridique, …)
 *      that orchestrate React/Next server actions — covered by component
 *      / page tests rather than unit tests.
 *
 *   4. Heavy DB-coupled RH/accounting orchestrators (declarations-mra,
 *      ias19-provisions, severance, eoy-bonus, etc.) with their own
 *      targeted integration suites under `tests/rh/` and
 *      `tests/accounting/` that mock Supabase end-to-end. Pulling them
 *      into the unit-coverage scope would penalise the metric without
 *      reflecting actual test gaps.
 *
 * The 80% threshold enforced by `code-quality.yml` applies to this
 * focused scope (≈11k LOC of pure logic), giving the metric meaningful
 * signal. Adding any module back into scope should be matched by a
 * corresponding unit-test contribution.
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
        // Test files themselves
        'lib/**/*.test.ts',
        'lib/**/*.d.ts',
        'node_modules',
        '.next',

        // ─── 1. Infrastructure (network / browser / framework) ──────
        'lib/supabase/**',
        'lib/storage/**',
        'lib/email/**',
        'lib/google/**',
        'lib/connectors/**',
        'lib/banks/scraper.ts',
        'lib/banks/adapters/**',
        'lib/banks/utils/**',
        'lib/notifications.ts',
        'lib/telegram/**',
        'lib/admin/**',
        'lib/credentials/**',
        'lib/ai/**',
        'lib/agent-auth.ts',
        'lib/lexora-internal-auth.ts',
        'lib/process-document.ts',
        'lib/claude.ts',
        'lib/banque/**',
        'lib/expenses/**',
        'lib/audit/intercompany-export.ts',
        'lib/audit/query-builder.ts',
        'lib/audit/log-entry.ts',
        '**/*-pdf*.ts',
        '**/pdf-*.ts',
        '**/pdf/**',
        'lib/**/client.ts',
        'lib/**/server.ts',
        'lib/**/middleware.ts',
        'lib/utils/bank-utils.ts',
        'lib/utils/toast.ts',
        'lib/types/**',

        // ─── 2. Static dictionaries (covered via smoke imports) ─────
        'lib/help/**',
        'lib/i18n/**',
        'lib/i18n.ts',
        'lib/jurisdictions/i18n/**',
        'lib/jurisdictions/ohada/countries/**',

        // ─── 3. UI-agent helpers (covered by component/page tests) ──
        'lib/contrats/**',
        'lib/factures/**',
        'lib/juridique/**',
        'lib/lexora-billing/**',

        // ─── 4. Heavy DB-coupled orchestrators (own integration suites) ─
        'lib/recurrences/**',
        'lib/relances/**',
        'lib/forex/**',
        'lib/bank/**',
        'lib/taux-change.ts',
        'lib/mra-ifp.ts',
        'lib/tiers-annuaire.ts',
        'lib/tokens.ts',
        'lib/bankFormats.ts',
        'lib/tresorerie.ts',
        'lib/rh/access.ts',
        'lib/rh/import-primes.ts',
        'lib/rh/expertRH.ts',
        'lib/rh/jours-ouvrables.ts',
        'lib/rh/eoy-bonus.ts',
        'lib/rh/eoy-bonus-bulletin.ts',
        'lib/rh/documents-rh.ts',
        'lib/rh/declarations-mra.ts',
        'lib/rh/declarations-mra-paco.ts',
        'lib/rh/declarations-mra-prgf.ts',
        'lib/rh/ias19-provisions.ts',
        'lib/rh/ias19-eoy-provisions.ts',
        'lib/rh/severance.ts',
        'lib/rh/soldes-conges.ts',
        'lib/rh/protection-maternite.ts',
        'lib/rh/banques-mauritius.ts',
        'lib/rh/banques-mauritius-db.ts',
        'lib/rh/types-conges.ts',
        'lib/rh/sanctions-conges.ts',
        'lib/rh/registres-s116.ts',
        'lib/rh/restitution-sessions.ts',
        'lib/rh/transport-allowance.ts',
        'lib/rh/cash-in-lieu.ts',
        'lib/rh/calendarWorkingDays.ts',
        'lib/rh/contractsTemplates.ts',
        'lib/rh/overtime.ts',
        // 'lib/rh/paie.ts' — RÉINTÉGRÉ au gate de couverture : moteur de paie
        // critique désormais couvert à ≥ 94% par lib/rh/paie.test.ts.
        'lib/rh/accrual-mensuel.ts',
        'lib/rh/periode-paie.ts',
        'lib/rh/ownership.ts',
        'lib/rh/unpaid.ts',
        'lib/rh/ot-aggregate.ts',
        'lib/accounting/rapprochement/post-processing.ts',
        // 'lib/accounting/rapprochement/lettrage.ts' — RÉINTÉGRÉ (couvert ~100%).
        'lib/accounting/rapprochement/matching-engine.ts',
        'lib/accounting/intelligent-rapprochement.ts',
        'lib/accounting/semantic-rapprochement.ts',
        'lib/accounting/lettrage.ts',
        // 'lib/accounting/historical-rates.ts' — RÉINTÉGRÉ (couvert par test).
        // 'lib/accounting/comptes-bancaires.ts' — RÉINTÉGRÉ (pur, couvert).
        'lib/accounting/period-lock.ts',
        // classification-engine.ts & validate-bank-currency.ts — RÉINTÉGRÉS au
        // gate (purs, couverts par leurs *.test.ts).
        'lib/audit/intercompany-reconciliation.ts',
        'lib/jurisdictions/ohada/payroll/**',
        'lib/jurisdictions/ohada/statements/notes-annexes.ts',
        'lib/jurisdictions/ohada/statements/systeme-minimal-tresorerie.ts',
        'lib/jurisdictions/mauritius/jurisdiction.ts',
      ],
      // Fail the test run if coverage falls below 80% on the focused
      // scope defined above. Enforced in CI by code-quality.yml.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 70,
        branches: 70,
      },
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
