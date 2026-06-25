/**
 * lib/comptable/__tests__/equilibre.integration.test.ts
 *
 * Tests d'INTÉGRATION (vitest, en mode `vitest run`) qui vérifient les
 * invariants d'équilibre de la comptabilité Lexora sur la base Supabase
 * pointée par les variables d'environnement `NEXT_PUBLIC_SUPABASE_URL` +
 * `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * INVARIANTS VALIDÉS (cf migrations 291-304) :
 *   I1. Par société : ABS(SUM(debit_mur) - SUM(credit_mur)) <= 0.02 MUR
 *   I2. Par société × journal (BNQ, ACH, VTE, OD-PAIE, SAL, AN, OD…) :
 *       SUM(D) = SUM(C) au centime près (tol 0.02)
 *   I3. Pour chaque `ref_folio` non null : SUM(D) = SUM(C) (tol 0.02)
 *   I4. Aucun solde absurde sur le compte 5800 (transit virements internes) :
 *       |solde 5800| <= 100 000 MUR par société (le 5800 doit se vider).
 *
 * COMPORTEMENT :
 *   - Si les vars d'env Supabase ne sont pas présentes, le `describe` est skip.
 *   - Aucune écriture n'est créée ou modifiée : SELECT only.
 *   - La requête utilise un client admin (service-role) car la vue
 *     `ecritures_comptables_v2` est protégée par RLS.
 *
 * EXÉCUTION :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx vitest run lib/comptable/__tests__/equilibre.integration.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const HAS_ENV = Boolean(SUPABASE_URL && SERVICE_KEY)

const TOLERANCE_MUR = 0.02
const COMPTE_TRANSIT_5800 = '5800'
const SEUIL_TRANSIT_ABSURDE = 100_000

const describeIntegration = HAS_ENV ? describe : describe.skip

type EcritureRow = {
  societe_id: string | null
  journal: string | null
  ref_folio: string | null
  numero_compte: string | null
  debit_mur: number | string | null
  credit_mur: number | string | null
}

function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const x = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(x) ? x : 0
}

async function fetchAllEcritures(
  supabase: SupabaseClient,
): Promise<EcritureRow[]> {
  // Pagination par range — la table peut contenir > 1000 lignes.
  const PAGE = 1000
  const rows: EcritureRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('ecritures_comptables_v2')
      .select('societe_id, journal, ref_folio, numero_compte, debit_mur, credit_mur')
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...(data as EcritureRow[]))
    if (data.length < PAGE) break
  }
  return rows
}

describeIntegration('compta — invariants d\'équilibre (intégration Supabase)', () => {
  let supabase: SupabaseClient
  let allRows: EcritureRow[] = []

  beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    allRows = await fetchAllEcritures(supabase)
    // Indication console (utile en CI)
    // eslint-disable-next-line no-console
    console.warn(`[equilibre.integration] fetched ${allRows.length} ecritures`)
  }, 60_000)

  it('I1 — équilibre global par société (tol 0.02 MUR)', () => {
    const bySoc = new Map<string, { d: number; c: number }>()
    for (const r of allRows) {
      const key = r.societe_id ?? '∅'
      const acc = bySoc.get(key) ?? { d: 0, c: 0 }
      acc.d += n(r.debit_mur)
      acc.c += n(r.credit_mur)
      bySoc.set(key, acc)
    }
    const offenders: Array<{ societe_id: string; diff: number }> = []
    for (const [societe_id, { d, c }] of bySoc) {
      const diff = Math.round((d - c) * 100) / 100
      if (Math.abs(diff) > TOLERANCE_MUR) {
        offenders.push({ societe_id, diff })
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })

  it('I2 — équilibre par (société, journal) pour BNQ/ACH/VTE/OD-PAIE/SAL/AN/OD (tol 0.02 MUR)', () => {
    const byKey = new Map<string, { d: number; c: number }>()
    for (const r of allRows) {
      if (!r.journal) continue
      const key = `${r.societe_id ?? '∅'}::${r.journal}`
      const acc = byKey.get(key) ?? { d: 0, c: 0 }
      acc.d += n(r.debit_mur)
      acc.c += n(r.credit_mur)
      byKey.set(key, acc)
    }
    const offenders: Array<{ key: string; diff: number }> = []
    for (const [key, { d, c }] of byKey) {
      const diff = Math.round((d - c) * 100) / 100
      if (Math.abs(diff) > TOLERANCE_MUR) {
        offenders.push({ key, diff })
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })

  it('I3 — équilibre par ref_folio non null (tol 0.02 MUR)', () => {
    const byFolio = new Map<string, { d: number; c: number }>()
    for (const r of allRows) {
      if (!r.ref_folio) continue
      const key = `${r.societe_id ?? '∅'}::${r.ref_folio}`
      const acc = byFolio.get(key) ?? { d: 0, c: 0 }
      acc.d += n(r.debit_mur)
      acc.c += n(r.credit_mur)
      byFolio.set(key, acc)
    }
    const offenders: Array<{ folio: string; diff: number }> = []
    for (const [folio, { d, c }] of byFolio) {
      const diff = Math.round((d - c) * 100) / 100
      if (Math.abs(diff) > TOLERANCE_MUR) {
        offenders.push({ folio, diff })
      }
    }
    // Tolère un échantillon raisonnable s'il existe d'anciens folios legacy
    // (ne devrait pas, après mig 295). On vérifie 0 offender ici.
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })

  it('I4 — pas de solde absurde sur 5800 (transit virements internes)', () => {
    // Mig 291/293 : le 5800 doit être vidé via reclassement vers 401/451.
    // |solde 5800| par société doit rester < 100 000 MUR.
    const by5800 = new Map<string, number>()
    for (const r of allRows) {
      if ((r.numero_compte ?? '').trim() !== COMPTE_TRANSIT_5800) continue
      const key = r.societe_id ?? '∅'
      const cur = by5800.get(key) ?? 0
      by5800.set(key, cur + n(r.debit_mur) - n(r.credit_mur))
    }
    const offenders: Array<{ societe_id: string; solde_5800: number }> = []
    for (const [societe_id, solde] of by5800) {
      if (Math.abs(solde) > SEUIL_TRANSIT_ABSURDE) {
        offenders.push({ societe_id, solde_5800: Math.round(solde * 100) / 100 })
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })
})

if (!HAS_ENV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[equilibre.integration.test] SKIPPED — set NEXT_PUBLIC_SUPABASE_URL ' +
      'and SUPABASE_SERVICE_ROLE_KEY to run integration tests.',
  )
}
