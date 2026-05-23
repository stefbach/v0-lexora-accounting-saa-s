/**
 * lib/comptable/__tests__/rapprochement.integration.test.ts
 *
 * Tests d'INTÉGRATION du module `lib/comptable/inter-societes.ts` —
 * complète les tests unitaires de `inter-societes.test.ts` avec des cas
 * plus larges (jeux de données réels) et, si la base Supabase est
 * accessible, vérifie quelques invariants de cohérence inter-sociétés
 * en lecture seule sur `ecritures_comptables_v2`.
 *
 * INVARIANTS / CAS COUVERTS :
 *   R1. detectInterSociete() — robustesse sur libellés bruyants (refs banque,
 *       majuscules, ponctuation lourde, abréviations LTD/LIMITED).
 *   R2. detectInterSociete() — un libellé qui pourrait matcher plusieurs
 *       sociétés rend UN seul gagnant (le meilleur score).
 *   R3. Aucun match accidentel sur des libellés systémiques courants
 *       (MRA PAYE, Salary, BOM Charges, Standing Order).
 *   R4. [Supabase requis] Solde du compte 451 (Comptes courants — Groupe) :
 *       NET 451 sommé sur TOUTES les sociétés d'un même groupe ≈ 0
 *       (tol 1 MUR). Invariant IAS 24 / mig 302.
 *
 * R1–R3 tournent SANS Supabase. R4 est skip si pas d'env.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  detectInterSociete,
  COMPTE_GROUPE_451,
  type SocieteGroupeRow,
} from '@/lib/comptable/inter-societes'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const HAS_ENV = Boolean(SUPABASE_URL && SERVICE_KEY)

function n(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const x = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(x) ? x : 0
}

const DDS: SocieteGroupeRow = {
  id: 'soc-dds',
  nom: 'DIGITAL DATA SOLUTIONS LTD',
  groupe_id: 'grp-1',
  client_id: 'c-stef',
}
const OCC: SocieteGroupeRow = {
  id: 'soc-occ',
  nom: 'OBESITY CARE CLINIC LTD',
  groupe_id: 'grp-1',
  client_id: 'c-stef',
}
const ZBROS: SocieteGroupeRow = {
  id: 'soc-zbros',
  nom: 'Z BROS HOLDING LIMITED',
  groupe_id: 'grp-1',
  client_id: 'c-stef',
}
const GROUPE: SocieteGroupeRow[] = [DDS, OCC, ZBROS]

describe('rapprochement — detectInterSociete cas étendus (R1-R3)', () => {
  it('R1 — libellé bruyant avec refs banque et ponctuation', () => {
    const samples = [
      'TRF/REF 89012/DIGITAL DATA SOLUTIONS LTD./PAIE MARS',
      'INWARD TT - DIGITAL DATA SOLUTIONS LTD - INV 2025/03',
      'WIRE FROM   DIGITAL DATA SOLUTIONS    LTD',
      'crédit virement DIGITAL-DATA-SOLUTIONS-LTD',
    ]
    for (const lib of samples) {
      const res = detectInterSociete(lib, null, GROUPE)
      expect(res.is_inter, lib).toBe(true)
      expect(res.societe_dest_id, lib).toBe('soc-dds')
      expect(res.score).toBeGreaterThanOrEqual(0.7)
    }
  })

  it('R2 — un seul gagnant quand le libellé pourrait matcher plusieurs', () => {
    const res = detectInterSociete(
      'Transfert OBESITY CARE CLINIC vers DIGITAL DATA SOLUTIONS LTD',
      null,
      GROUPE,
    )
    expect(res.is_inter).toBe(true)
    // un unique societe_dest_id, score >= 0.85
    expect(typeof res.societe_dest_id).toBe('string')
    expect(['soc-dds', 'soc-occ']).toContain(res.societe_dest_id)
    expect(res.score).toBeGreaterThanOrEqual(0.85)
  })

  it('R3 — pas de faux positif sur libellés systémiques courants', () => {
    const noise = [
      'MRA PAYE MAR 2026',
      'NSF/CSG CONTRIBUTIONS APR 2026',
      'SALARY MARCH 2026 — JOHN DOE',
      'STANDING ORDER MAURITIUS TELECOM',
      'BOM CHARGES',
      'CASH DEPOSIT — ATM ROSE-HILL',
    ]
    for (const lib of noise) {
      const res = detectInterSociete(lib, null, GROUPE)
      expect(res.is_inter, `should not match: ${lib}`).toBe(false)
      expect(res.societe_dest_id, lib).toBeNull()
    }
  })

  it('R3bis — groupe vide ou libellé vide → none', () => {
    expect(detectInterSociete('', null, GROUPE).is_inter).toBe(false)
    expect(detectInterSociete('OBESITY', null, []).is_inter).toBe(false)
  })

  it('R3ter — tiers_detecte porte le nom, libellé vide → match', () => {
    const res = detectInterSociete('', 'Z Bros Holding Limited', GROUPE)
    expect(res.is_inter).toBe(true)
    expect(res.societe_dest_id).toBe('soc-zbros')
  })
})

const describeR4 = HAS_ENV ? describe : describe.skip

describeR4('rapprochement — invariant solde 451 par groupe (R4)', () => {
  let supabase: SupabaseClient

  beforeAll(() => {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  it('R4 — pour chaque groupe, SUM(D-C) sur 451 cumulé ≈ 0 (tol 1 MUR)', async () => {
    // Récup sociétés avec leur groupe_id/client_id
    const { data: societes, error: errSoc } = await supabase
      .from('societes')
      .select('id, nom, groupe_id, client_id')
    if (errSoc) throw errSoc
    if (!societes || societes.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[rapprochement.integration] no societes — skipping R4')
      return
    }

    // Récup écritures compte 451 (paginé)
    const PAGE = 1000
    type Row = {
      societe_id: string
      debit_mur: number | string | null
      credit_mur: number | string | null
    }
    const rows451: Row[] = []
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from('ecritures_comptables_v2')
        .select('societe_id, debit_mur, credit_mur')
        .eq('numero_compte', COMPTE_GROUPE_451)
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      rows451.push(...(data as Row[]))
      if (data.length < PAGE) break
    }

    if (rows451.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[rapprochement.integration] no rows 451 — invariant trivial')
      return
    }

    const soldeBySoc = new Map<string, number>()
    for (const r of rows451) {
      const cur = soldeBySoc.get(r.societe_id) ?? 0
      soldeBySoc.set(r.societe_id, cur + n(r.debit_mur) - n(r.credit_mur))
    }

    // Groupes : préfère groupe_id, fallback client_id
    type Soc = { id: string; nom: string; groupe_id: string | null; client_id: string | null }
    const totalByGroupe = new Map<string, number>()
    for (const s of societes as Soc[]) {
      const grpKey = s.groupe_id ?? `client:${s.client_id ?? 'orphan'}`
      const solde = soldeBySoc.get(s.id) ?? 0
      totalByGroupe.set(grpKey, (totalByGroupe.get(grpKey) ?? 0) + solde)
    }

    const offenders: Array<{ groupe: string; total_451_diff: number }> = []
    for (const [grp, total] of totalByGroupe) {
      const rounded = Math.round(total * 100) / 100
      if (Math.abs(rounded) > 1) {
        offenders.push({ groupe: grp, total_451_diff: rounded })
      }
    }
    // Tolère les groupes "solo" (1 société = pas d'inter-société par
    // définition) : un solo qui a un solde 451 != 0 indique une asymétrie
    // mais ce n'est pas un déséquilibre à proprement parler. On signale
    // sans faire échouer si tous les offenders sont des groupes solo.
    if (offenders.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[R4] offenders 451 par groupe', offenders)
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  }, 60_000)
})

if (!HAS_ENV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[rapprochement.integration.test] R4 SKIPPED — set Supabase env vars to run.',
  )
}
