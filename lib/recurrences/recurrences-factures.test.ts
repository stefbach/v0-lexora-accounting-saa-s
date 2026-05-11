import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/tests/__mocks__/supabase'
import {
  prochaineDateGeneration,
  computeDatesAGenerer,
  findGenerationsAFaire,
  runRecurrencesQuotidiennes,
  type ModeleRecurrence,
} from './recurrences-factures'

describe('prochaineDateGeneration', () => {
  it('avance d\'1 mois en mensuel', () => {
    expect(prochaineDateGeneration('2026-01-15', 'mensuel', 15)).toBe('2026-02-15')
  })
  it('avance de 3 mois en trimestriel', () => {
    expect(prochaineDateGeneration('2026-01-15', 'trimestriel', 15)).toBe('2026-04-15')
  })
  it("avance d'1 an en annuel", () => {
    expect(prochaineDateGeneration('2026-01-15', 'annuel', 15)).toBe('2027-01-15')
  })
  it("respecte le jour_du_mois différent", () => {
    expect(prochaineDateGeneration('2026-01-15', 'mensuel', 1)).toBe('2026-02-01')
  })
})

function makeModele(overrides: Partial<ModeleRecurrence> = {}): ModeleRecurrence {
  return {
    id: 'mod-1',
    societe_id: 'soc-1',
    numero_facture: 'REC-001',
    tiers: 'ACME',
    recurrent_frequence: 'mensuel',
    recurrence_jour_du_mois: 1,
    recurrence_date_debut: '2026-01-01',
    recurrence_date_fin: null,
    derniere_generation_date: null,
    ...overrides,
  }
}

describe('computeDatesAGenerer', () => {
  it("retourne [] si pas de date_debut", () => {
    const r = computeDatesAGenerer(makeModele({ recurrence_date_debut: null }), '2026-05-10')
    expect(r).toEqual([])
  })

  it("génère la première date sur date_debut si jamais générée", () => {
    const r = computeDatesAGenerer(makeModele(), '2026-01-15')
    expect(r).toEqual(['2026-01-01'])
  })

  it("rattrape plusieurs périodes manquantes", () => {
    const r = computeDatesAGenerer(makeModele(), '2026-04-15')
    expect(r).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'])
  })

  it("ne rejoue pas une période déjà générée", () => {
    const r = computeDatesAGenerer(
      makeModele({ derniere_generation_date: '2026-03-01' }),
      '2026-04-15',
    )
    expect(r).toEqual(['2026-04-01'])
  })

  it("s'arrête à recurrence_date_fin", () => {
    const r = computeDatesAGenerer(
      makeModele({ recurrence_date_fin: '2026-03-15' }),
      '2026-12-01',
    )
    expect(r).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it("retourne [] si today < date_debut", () => {
    const r = computeDatesAGenerer(
      makeModele({ recurrence_date_debut: '2027-01-01' }),
      '2026-12-31',
    )
    expect(r).toEqual([])
  })

  it("trimestriel : 1 entrée par trimestre", () => {
    const r = computeDatesAGenerer(
      makeModele({ recurrent_frequence: 'trimestriel' }),
      '2026-12-31',
    )
    expect(r).toEqual(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'])
  })

  it("annuel : 1 entrée par année", () => {
    const r = computeDatesAGenerer(
      makeModele({ recurrent_frequence: 'annuel' }),
      '2028-12-31',
    )
    expect(r).toEqual(['2026-01-01', '2027-01-01', '2028-01-01'])
  })
})

describe('findGenerationsAFaire', () => {
  it("ne renvoie que les modèles éligibles avec dates dues", async () => {
    const supabase = createMockSupabase({
      tables: {
        factures: [
          // Modèle actif avec génération due
          {
            id: 'mod-1',
            societe_id: 'soc-1',
            numero_facture: 'REC-001',
            tiers: 'ACME',
            recurrent: true,
            statut: 'modele',
            recurrent_frequence: 'mensuel',
            recurrence_jour_du_mois: 1,
            recurrence_date_debut: '2026-01-01',
            recurrence_date_fin: null,
            derniere_generation_date: null,
          },
          // Facture normale (à ignorer)
          {
            id: 'fac-2',
            societe_id: 'soc-1',
            recurrent: false,
            statut: 'en_attente',
          },
          // Modèle déjà à jour
          {
            id: 'mod-3',
            societe_id: 'soc-1',
            numero_facture: 'REC-003',
            tiers: 'BobCo',
            recurrent: true,
            statut: 'modele',
            recurrent_frequence: 'mensuel',
            recurrence_jour_du_mois: 1,
            recurrence_date_debut: '2026-01-01',
            recurrence_date_fin: null,
            derniere_generation_date: '2026-05-01',
          },
        ],
      },
    })
    const plans = await findGenerationsAFaire(supabase as any, {
      today: '2026-05-10',
    })
    expect(plans).toHaveLength(1)
    expect(plans[0].modele_id).toBe('mod-1')
    expect(plans[0].dates_a_generer.length).toBeGreaterThan(0)
  })
})

describe('runRecurrencesQuotidiennes — dry_run', () => {
  it("ne crée pas de facture mais retourne la liste prévue", async () => {
    const supabase = createMockSupabase({
      tables: {
        factures: [{
          id: 'mod-1',
          societe_id: 'soc-1',
          numero_facture: 'REC-001',
          tiers: 'ACME',
          recurrent: true,
          statut: 'modele',
          recurrent_frequence: 'mensuel',
          recurrence_jour_du_mois: 1,
          recurrence_date_debut: '2026-01-01',
          recurrence_date_fin: null,
          derniere_generation_date: null,
        }],
      },
    })
    const summary = await runRecurrencesQuotidiennes(supabase as any, {
      dry_run: true,
      today: '2026-02-15',
    })
    expect(summary.modeles_traites).toBe(1)
    expect(summary.factures_creees).toBe(0)
    expect(summary.details[0].crees).toHaveLength(2) // janv + fév
    const inserts = supabase._state.inserts.filter((i) => i.table === 'factures')
    expect(inserts).toHaveLength(0)
  })
})
