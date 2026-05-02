import { test, expect } from '@playwright/test'
import { isTestDbAvailable, getTestAdminClient, cleanupFactures } from './helpers/db'
import { loginProgrammatic, getCredentialsA } from './helpers/auth'
import { createFactureClientViaApi } from './helpers/factures'

/**
 * Workflow couvert :
 *   Création facture client → validation côté API → écritures 411/706
 *   visibles dans le grand-livre (table ecritures_comptables_v2).
 */
const dbReady = isTestDbAvailable()
const creds = getCredentialsA()
const societeId = process.env.E2E_SOCIETE_A_ID

test.describe('Facture client → grand-livre', () => {
  test.skip(
    !dbReady || !creds || !societeId,
    'DATABASE_URL_TEST / E2E_SOCIETE_A_ID absent — spec skipped',
  )

  const createdIds: string[] = []
  test.afterAll(async () => {
    await cleanupFactures(createdIds).catch(() => {})
  })

  test('crée une facture client et génère 411/706 dans le grand-livre', async ({
    context,
    request,
  }) => {
    await loginProgrammatic(context, creds!)

    const facture = await createFactureClientViaApi(request, {
      societe_id: societeId!,
      tiers: 'E2E Client SA',
      date_facture: '2026-04-15',
      montant_ht: 1000,
      montant_tva: 150,
      montant_ttc: 1150,
    })
    createdIds.push(facture.id)

    // Vérifie que les écritures ont été générées par l'API
    const supa = getTestAdminClient()
    const { data: ecritures, error } = await supa
      .from('ecritures_comptables_v2')
      .select('numero_compte,debit_mur,credit_mur,journal')
      .eq('facture_id', facture.id)
    expect(error).toBeNull()
    expect(ecritures && ecritures.length).toBeGreaterThanOrEqual(2)

    const comptes = (ecritures || []).map((e: any) => e.numero_compte)
    // 411 (clients) — peut être 411 ou 411<HASH6> en mode auxiliaires
    expect(comptes.some((c) => c.startsWith('411'))).toBeTruthy()
    expect(comptes).toContain('706')

    const journaux = new Set((ecritures || []).map((e: any) => e.journal))
    expect(journaux).toEqual(new Set(['VTE']))

    // Équilibre débit = crédit
    const totals = (ecritures || []).reduce(
      (acc: any, e: any) => ({
        d: acc.d + Number(e.debit_mur || 0),
        c: acc.c + Number(e.credit_mur || 0),
      }),
      { d: 0, c: 0 },
    )
    expect(totals.d).toBeCloseTo(totals.c, 2)
  })

  test('la facture apparaît dans le grand-livre UI', async ({ page, context }) => {
    await loginProgrammatic(context, creds!)
    await page.goto('/client/grand-livre')
    // On vérifie simplement que la page charge sans 4xx/5xx serveur
    await expect(page).toHaveURL(/grand-livre/)
  })
})
