/**
 * lib/comptable/__tests__/onboarding.integration.test.ts
 *
 * Tests d'INTÉGRATION de la RPC Supabase `enregistrer_soldes_ouverture`
 * (migration 301). Vérifie que la saisie des soldes d'ouverture génère un
 * journal AN équilibré au centime près, et que l'idempotence est correcte.
 *
 * INVARIANTS COUVERTS :
 *   O1. dry_run : la RPC retourne un total débit = total crédit (par
 *       construction — pas d'écritures créées).
 *   O2. création réelle : nb_ecritures = 2 × nb lignes non vides,
 *       total_debit = total_credit = somme des montants, et toutes les
 *       écritures écrites ont SUM(D) = SUM(C) au centime près.
 *   O3. idempotence : second appel avec les mêmes paramètres renvoie
 *       status='deja_saisi' et NE crée PAS de nouvelles écritures.
 *
 * COMPORTEMENT :
 *   - Skip propre si pas de variables d'env Supabase.
 *   - Crée une société de test, exécute, vérifie, NETTOIE (delete cascade
 *     supprime les écritures via la FK).
 *   - Toutes les écritures de cette société de test sont supprimées en
 *     `afterAll`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const HAS_ENV = Boolean(SUPABASE_URL && SERVICE_KEY)

const describeIntegration = HAS_ENV ? describe : describe.skip

function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const x = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(x) ? x : 0
}

describeIntegration('onboarding — RPC enregistrer_soldes_ouverture (mig 301)', () => {
  let supabase: SupabaseClient
  let societeId: string | null = null
  const exercice = '2099-2100' // exercice futur pour isolation
  const dateDebut = '2099-07-01'

  // Lignes d'exemple : actif (banques + clients) + passif (fournisseurs)
  const lignes = [
    { compte: '512',  nom_tiers: 'MCB main account', montant_mur: 250_000.55, section: 'banque' },
    { compte: '411',  nom_tiers: 'ABC Client Ltd',   montant_mur:  72_500.10, section: 'client' },
    { compte: '2183', nom_tiers: 'IT Equipment',     montant_mur:  40_000.00, section: 'immobilisation' },
    { compte: '401',  nom_tiers: 'Mauritius Telecom',montant_mur:  12_345.67, section: 'fournisseur' },
    { compte: '401',  nom_tiers: 'CEB',              montant_mur:   8_900.00, section: 'fournisseur' },
    // ligne vide à skip côté RPC
    { compte: '',     nom_tiers: 'ignore',           montant_mur:       0,    section: 'autre' },
  ]
  const totalAttendu =
    250_000.55 + 72_500.10 + 40_000.00 + 12_345.67 + 8_900.00 // 383 746.32

  beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Crée une société de test (insère le minimum requis + date_debut_exercice)
    const nom = `__TEST_ONBOARDING_${Date.now()}__`
    const { data, error } = await supabase
      .from('societes')
      .insert({
        nom,
        date_debut_exercice: dateDebut,
      })
      .select('id')
      .single()
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[onboarding.integration] cannot insert test societe', error)
      throw error
    }
    societeId = data!.id as string
  }, 60_000)

  afterAll(async () => {
    if (!societeId) return
    // Nettoyage : delete écritures puis soldes_ouverture_saisie puis société.
    // ON DELETE CASCADE est censé tout supprimer via FK ; on fait quand
    // même delete explicite pour robustesse.
    await supabase.from('ecritures_comptables_v2').delete().eq('societe_id', societeId)
    await supabase.from('soldes_ouverture_saisie').delete().eq('societe_id', societeId)
    await supabase.from('societes').delete().eq('id', societeId)
  }, 60_000)

  it('O1 — dry_run renvoie débit = crédit (équilibre par construction)', async () => {
    if (!societeId) throw new Error('societeId missing')
    const { data, error } = await supabase.rpc('enregistrer_soldes_ouverture', {
      p_societe_id: societeId,
      p_exercice: exercice,
      p_lignes: lignes,
      p_user_id: null,
      p_compte_contrepartie: '110',
      p_dry_run: true,
    })
    expect(error).toBeNull()
    const res = data as Record<string, unknown>
    expect(res.status).toBe('dry_run_ok')
    expect(n(res.total_debit as number)).toBeCloseTo(totalAttendu, 2)
    expect(n(res.total_credit as number)).toBeCloseTo(totalAttendu, 2)
    expect(n(res.total_debit as number)).toBeCloseTo(n(res.total_credit as number), 2)
  }, 60_000)

  it('O2 — création réelle : journal AN équilibré + écritures écrites équilibrées', async () => {
    if (!societeId) throw new Error('societeId missing')
    const { data, error } = await supabase.rpc('enregistrer_soldes_ouverture', {
      p_societe_id: societeId,
      p_exercice: exercice,
      p_lignes: lignes,
      p_user_id: null,
      p_compte_contrepartie: '110',
      p_dry_run: false,
    })
    expect(error).toBeNull()
    const res = data as Record<string, unknown>
    expect(res.status).toBe('created')
    // 5 lignes non vides → 5 × 2 = 10 écritures
    expect(res.nb_ecritures).toBe(10)
    expect(n(res.total_debit as number)).toBeCloseTo(totalAttendu, 2)
    expect(n(res.total_credit as number)).toBeCloseTo(totalAttendu, 2)
    expect(res.journal).toBe('AN')

    // Vérif côté DB : SUM(D)=SUM(C) sur la société de test
    const { data: ecr, error: errEcr } = await supabase
      .from('ecritures_comptables_v2')
      .select('debit_mur, credit_mur, journal, ref_folio')
      .eq('societe_id', societeId)
    if (errEcr) throw errEcr
    const list = (ecr ?? []) as Array<{
      debit_mur: number | string | null
      credit_mur: number | string | null
      journal: string | null
      ref_folio: string | null
    }>
    expect(list.length).toBe(10)
    const totalD = list.reduce((s, r) => s + n(r.debit_mur), 0)
    const totalC = list.reduce((s, r) => s + n(r.credit_mur), 0)
    expect(Math.abs(totalD - totalC)).toBeLessThanOrEqual(0.02)
    // Toutes en journal AN
    for (const r of list) {
      expect(r.journal).toBe('AN')
      expect(r.ref_folio).toBeTruthy()
    }
    // Équilibre par folio
    const byFolio = new Map<string, { d: number; c: number }>()
    for (const r of list) {
      const k = r.ref_folio ?? ''
      const acc = byFolio.get(k) ?? { d: 0, c: 0 }
      acc.d += n(r.debit_mur)
      acc.c += n(r.credit_mur)
      byFolio.set(k, acc)
    }
    for (const [, { d, c }] of byFolio) {
      expect(Math.abs(d - c)).toBeLessThanOrEqual(0.02)
    }
  }, 60_000)

  it('O3 — idempotence : second appel renvoie deja_saisi + pas de doublon', async () => {
    if (!societeId) throw new Error('societeId missing')
    // Snapshot du nombre d'écritures avant
    const { count: beforeCount } = await supabase
      .from('ecritures_comptables_v2')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societeId)

    const { data, error } = await supabase.rpc('enregistrer_soldes_ouverture', {
      p_societe_id: societeId,
      p_exercice: exercice,
      p_lignes: lignes,
      p_user_id: null,
      p_compte_contrepartie: '110',
      p_dry_run: false,
    })
    expect(error).toBeNull()
    const res = data as Record<string, unknown>
    expect(res.status).toBe('deja_saisi')
    expect(res.deja_existante).toBe(true)

    const { count: afterCount } = await supabase
      .from('ecritures_comptables_v2')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societeId)
    expect(afterCount).toBe(beforeCount)
  }, 60_000)
})

if (!HAS_ENV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[onboarding.integration.test] SKIPPED — set NEXT_PUBLIC_SUPABASE_URL ' +
      'and SUPABASE_SERVICE_ROLE_KEY to run integration tests.',
  )
}
