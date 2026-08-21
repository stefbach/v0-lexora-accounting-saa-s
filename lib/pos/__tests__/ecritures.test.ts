import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  buildEcrituresEcartCaisse,
  buildEcrituresVentePos,
  createEcrituresForEcartCaisse,
  createEcrituresForVentePos,
  nomComptePos,
  refFolioSession,
  refFolioVente,
  type SessionPourEcritures,
  type VentePourEcritures,
} from '@/lib/pos/ecritures'

const vente = (over: Partial<VentePourEcritures> = {}): VentePourEcritures => ({
  id: 'vte-1',
  societe_id: 'soc-1',
  dossier_id: null,
  numero_ticket: 'TCK-20260821-0001',
  date_vente: '2026-08-21T10:15:00Z',
  montant_tva: 40.5,
  ...over,
})

const lignes = [{ montant_ht: 270, compte_vente: '701' }]
const paiements = [
  { compte_comptable: '530', montant: 110.5 },
  { compte_comptable: '5118', montant: 200 },
]

function sums(l: Array<{ debit_mur: number; credit_mur: number }>) {
  return {
    debit: l.reduce((s, x) => s + x.debit_mur, 0),
    credit: l.reduce((s, x) => s + x.credit_mur, 0),
  }
}

describe('buildEcrituresVentePos', () => {
  it('encaissement multi-moyens — D 530/5118 (TTC), C 701 (HT) + C 4457 (TVA), équilibrée', () => {
    const out = buildEcrituresVentePos(vente(), lignes, paiements)
    expect(out).toHaveLength(4)
    expect(out[0]).toMatchObject({
      numero_compte: '530',
      nom_compte: 'Caisse',
      debit_mur: 110.5,
      credit_mur: 0,
      journal: 'POS',
      ref_folio: 'POS-vte-1',
      date_ecriture: '2026-08-21',
      exercice: '2026',
    })
    expect(out[1]).toMatchObject({ numero_compte: '5118', nom_compte: 'Monétique en transit', debit_mur: 200 })
    expect(out[2]).toMatchObject({ numero_compte: '701', credit_mur: 270 })
    expect(out[3]).toMatchObject({ numero_compte: '4457', nom_compte: 'TVA collectée', credit_mur: 40.5 })
    expect(sums(out)).toEqual({ debit: 310.5, credit: 310.5 })
    expect(out[0].libelle).toContain('TCK-20260821-0001')
  })

  it('regroupe paiements de même compte et lignes de même compte de vente', () => {
    const out = buildEcrituresVentePos(
      vente({ montant_tva: 30 }),
      [
        { montant_ht: 120, compte_vente: '701' },
        { montant_ht: 80, compte_vente: '701' },
      ],
      [
        { compte_comptable: '530', montant: 100 },
        { compte_comptable: '530', montant: 130 },
      ],
    )
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ numero_compte: '530', debit_mur: 230 })
    expect(out[1]).toMatchObject({ numero_compte: '701', credit_mur: 200 })
    expect(sums(out)).toEqual({ debit: 230, credit: 230 })
  })

  it('respecte un compte de vente personnalisé et un ticket sans TVA', () => {
    const out = buildEcrituresVentePos(
      vente({ montant_tva: 0 }),
      [{ montant_ht: 100, compte_vente: '707' }],
      [{ compte_comptable: '530', montant: 100 }],
    )
    expect(out).toHaveLength(2)
    expect(out[1]).toMatchObject({ numero_compte: '707', nom_compte: 'Compte 707', credit_mur: 100 })
    expect(out.some((l) => l.numero_compte === '4457')).toBe(false)
  })

  it('lève R1 sur un ticket déséquilibré', () => {
    expect(() =>
      buildEcrituresVentePos(vente(), lignes, [{ compte_comptable: '530', montant: 100 }]),
    ).toThrow(/R1/)
  })

  it('sans ligne ou sans paiement — aucune écriture', () => {
    expect(buildEcrituresVentePos(vente(), [], paiements)).toEqual([])
    expect(buildEcrituresVentePos(vente(), lignes, [])).toEqual([])
  })
})

describe('buildEcrituresEcartCaisse', () => {
  const session = (ecart: number): SessionPourEcritures => ({
    id: 'ses-12345678',
    societe_id: 'soc-1',
    dossier_id: null,
    ecart_caisse: ecart,
    fermee_at: '2026-08-21T18:00:00Z',
  })

  it('manque (écart < 0) — D 6588 / C 530', () => {
    const out = buildEcrituresEcartCaisse(session(-4.5))
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      numero_compte: '6588',
      debit_mur: 4.5,
      journal: 'POS',
      ref_folio: 'POS-SES-ses-12345678',
      date_ecriture: '2026-08-21',
    })
    expect(out[1]).toMatchObject({ numero_compte: '530', credit_mur: 4.5 })
    expect(out[0].libelle).toContain('manque')
  })

  it('surplus (écart > 0) — D 530 / C 758', () => {
    const out = buildEcrituresEcartCaisse(session(2))
    expect(out[0]).toMatchObject({ numero_compte: '530', debit_mur: 2 })
    expect(out[1]).toMatchObject({
      numero_compte: '758',
      nom_compte: 'Produits divers de gestion courante',
      credit_mur: 2,
    })
    expect(out[0].libelle).toContain('surplus')
  })

  it('écart nul — aucune écriture', () => {
    expect(buildEcrituresEcartCaisse(session(0))).toEqual([])
  })
})

describe('createEcrituresForVentePos', () => {
  it('insère la pièce équilibrée avec dossier_id résolu', async () => {
    const supabase = createMockSupabase()
    supabase._seed('dossiers', [{ id: 'doss-1', societe_id: 'soc-1' }])
    const res = await createEcrituresForVentePos(supabase, vente(), lignes, paiements)
    expect(res).toEqual({ ok: true, nb_entries: 4 })
    const rows = supabase._state.tables['ecritures_comptables_v2']
    expect(rows).toHaveLength(4)
    expect(rows[0].dossier_id).toBe('doss-1')
    expect(rows[0].ref_folio).toBe('POS-vte-1')
    expect(sums(rows)).toEqual({ debit: 310.5, credit: 310.5 })
  })

  it('idempotent — pas de doublon si le ref_folio existe déjà', async () => {
    const supabase = createMockSupabase()
    supabase._seed('ecritures_comptables_v2', [{ id: 'e-1', societe_id: 'soc-1', ref_folio: 'POS-vte-1' }])
    const res = await createEcrituresForVentePos(supabase, vente(), lignes, paiements)
    expect(res).toEqual({ ok: true, nb_entries: 0 })
    expect(supabase._state.tables['ecritures_comptables_v2']).toHaveLength(1)
  })

  it('propage l\'erreur d\'insertion et capture le déséquilibre', async () => {
    const supabase = createMockSupabase({
      errorOn: ({ table, kind }) =>
        table === 'ecritures_comptables_v2' && kind === 'insert' ? { message: 'boom' } : null,
    })
    const res = await createEcrituresForVentePos(supabase, vente(), lignes, paiements)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('boom')

    const res2 = await createEcrituresForVentePos(createMockSupabase(), vente(), lignes, [
      { compte_comptable: '530', montant: 1 },
    ])
    expect(res2.ok).toBe(false)
    expect(res2.error).toContain('R1')
  })
})

describe('createEcrituresForEcartCaisse', () => {
  const session: SessionPourEcritures = {
    id: 'ses-1',
    societe_id: 'soc-1',
    ecart_caisse: -10,
    fermee_at: '2026-08-21T18:00:00Z',
  }

  it('insère l\'écart puis reste idempotent', async () => {
    const supabase = createMockSupabase()
    const first = await createEcrituresForEcartCaisse(supabase, session)
    expect(first).toEqual({ ok: true, nb_entries: 2 })
    const again = await createEcrituresForEcartCaisse(supabase, session)
    expect(again).toEqual({ ok: true, nb_entries: 0 })
    expect(supabase._state.tables['ecritures_comptables_v2']).toHaveLength(2)
  })

  it('écart nul — ok sans écriture', async () => {
    const res = await createEcrituresForEcartCaisse(createMockSupabase(), { ...session, ecart_caisse: 0 })
    expect(res).toEqual({ ok: true, nb_entries: 0 })
  })
})

describe('helpers', () => {
  it('refFolio / nomComptePos', () => {
    expect(refFolioVente('abc')).toBe('POS-abc')
    expect(refFolioSession('abc')).toBe('POS-SES-abc')
    expect(nomComptePos('5118')).toBe('Monétique en transit')
    expect(nomComptePos('9999')).toBe('Compte 9999')
  })
})
