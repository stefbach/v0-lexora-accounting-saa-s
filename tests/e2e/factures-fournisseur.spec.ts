import { test, expect } from '@playwright/test'
import { isTestDbAvailable, getTestAdminClient, cleanupFactures } from './helpers/db'
import { loginProgrammatic, getCredentialsA } from './helpers/auth'
import { createFactureFournisseurViaApi } from './helpers/factures'

/**
 * Workflow couvert :
 *   Création facture fournisseur EUR avec taux_change → conversion MUR
 *   correcte sur le 401 + écritures 401/607/4456 équilibrées en MUR.
 */
const dbReady = isTestDbAvailable()
const creds = getCredentialsA()
const societeId = process.env.E2E_SOCIETE_A_ID

test.describe('Facture fournisseur EUR → conversion MUR', () => {
  test.skip(
    !dbReady || !creds || !societeId,
    'DATABASE_URL_TEST / E2E_SOCIETE_A_ID absent — spec skipped',
  )

  const createdIds: string[] = []
  test.afterAll(async () => {
    await cleanupFactures(createdIds).catch(() => {})
  })

  test('convertit une facture EUR en MUR et écrit 401/607', async ({
    context,
    request,
  }) => {
    await loginProgrammatic(context, creds!)

    const tauxEur = 46
    const ttcEur = 1200 // 1000 HT + 200 TVA
    const ttcMur = ttcEur * tauxEur

    const facture = await createFactureFournisseurViaApi(request, {
      societe_id: societeId!,
      tiers: 'E2E Fournisseur EUR Ltd',
      date_facture: '2026-04-20',
      montant_ht: 1000,
      montant_tva: 200,
      montant_ttc: 1200,
      devise: 'EUR',
      taux_change: tauxEur,
      montant_mur: ttcMur,
    })
    createdIds.push(facture.id)

    const supa = getTestAdminClient()
    const { data: ecritures } = await supa
      .from('ecritures_comptables_v2')
      .select('numero_compte,debit_mur,credit_mur,journal')
      .eq('facture_id', facture.id)

    expect(ecritures?.length).toBeGreaterThanOrEqual(2)
    const comptes = (ecritures || []).map((e: any) => e.numero_compte)
    expect(comptes.some((c) => c.startsWith('401'))).toBeTruthy()
    expect(comptes).toContain('607')

    // Total débit = total crédit en MUR (équilibre)
    const tot = (ecritures || []).reduce(
      (a: any, e: any) => ({
        d: a.d + Number(e.debit_mur || 0),
        c: a.c + Number(e.credit_mur || 0),
      }),
      { d: 0, c: 0 },
    )
    expect(tot.d).toBeCloseTo(tot.c, 1)
    expect(tot.d).toBeCloseTo(ttcMur, 0)

    // Le 401 fournisseur doit afficher la conversion MUR (pas EUR brut)
    const ligne401 = (ecritures || []).find((e: any) =>
      String(e.numero_compte).startsWith('401'),
    )!
    expect(Number((ligne401 as any).credit_mur)).toBeGreaterThan(ttcEur)
    expect(Number((ligne401 as any).credit_mur)).toBeCloseTo(ttcMur, 0)

    const journaux = new Set((ecritures || []).map((e: any) => e.journal))
    expect(journaux).toEqual(new Set(['ACH']))
  })
})
