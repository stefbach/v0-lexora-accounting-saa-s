import { describe, it, expect } from 'vitest'
import { construirePrevision, ajouterJours, type FluxTresorerie } from '@/lib/reporting/prevision-tresorerie'

const REF = '2026-01-01'

describe('ajouterJours', () => {
  it('ajoute des jours en franchissant les mois', () => {
    expect(ajouterJours('2026-01-20', 15)).toBe('2026-02-04')
    expect(ajouterJours('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('construirePrevision', () => {
  it('sans flux → solde constant, pas de risque', () => {
    const p = construirePrevision(50000, [], REF)
    expect(p.points).toHaveLength(3)
    expect(p.points.every(pt => pt.solde_projete === 50000)).toBe(true)
    expect(p.risque_decouvert).toBe(false)
    expect(p.premier_jour_negatif).toBeNull()
  })

  it('encaissements et décaissements cumulés aux bons horizons', () => {
    const flux: FluxTresorerie[] = [
      { date: '2026-01-15', montant: 20000, libelle: 'Facture A', categorie: 'client' },
      { date: '2026-02-10', montant: -12000, libelle: 'Fournisseur X', categorie: 'fournisseur' },
      { date: '2026-03-20', montant: -5000, libelle: 'TVA', categorie: 'tva' },
    ]
    const p = construirePrevision(10000, flux, REF)
    // 30j (2026-01-31) : +20000 → 30000
    expect(p.points[0].solde_projete).toBe(30000)
    expect(p.points[0].entrees_cumul).toBe(20000)
    // 60j (2026-03-02) : -12000 → 18000
    expect(p.points[1].solde_projete).toBe(18000)
    // 90j (2026-03-31) : -5000 → 13000
    expect(p.points[2].solde_projete).toBe(13000)
    expect(p.points[2].sorties_cumul).toBe(17000)
  })

  it('détecte un risque de découvert et le premier jour négatif', () => {
    const flux: FluxTresorerie[] = [
      { date: '2026-01-20', montant: -8000, libelle: 'Loyer', categorie: 'autre' },
      { date: '2026-02-15', montant: 30000, libelle: 'Gros client', categorie: 'client' },
    ]
    const p = construirePrevision(5000, flux, REF)
    expect(p.risque_decouvert).toBe(true)
    expect(p.premier_jour_negatif).toBe('2026-01-20') // 5000 - 8000 = -3000
    expect(p.solde_min).toBe(-3000)
    // à 60j le gros client renfloue : 30000 - 3000 = 27000
    expect(p.points[1].solde_projete).toBe(27000)
  })

  it('un flux en retard (avant la référence) est ramené à aujourd’hui', () => {
    const flux: FluxTresorerie[] = [
      { date: '2025-12-01', montant: 15000, libelle: 'Créance en retard', categorie: 'client' },
    ]
    const p = construirePrevision(1000, flux, REF)
    expect(p.points[0].solde_projete).toBe(16000)
    expect(p.points[0].entrees_cumul).toBe(15000)
  })

  it('ignore les flux au-delà de l’horizon max', () => {
    const flux: FluxTresorerie[] = [
      { date: '2026-06-01', montant: -100000, libelle: 'Hors horizon', categorie: 'autre' },
    ]
    const p = construirePrevision(2000, flux, REF)
    expect(p.risque_decouvert).toBe(false)
    expect(p.points[2].solde_projete).toBe(2000)
  })

  it('respecte des horizons personnalisés', () => {
    const p = construirePrevision(0, [], REF, [7, 14])
    expect(p.points.map(pt => pt.horizon_jours)).toEqual([7, 14])
    expect(p.points[1].date).toBe('2026-01-15')
  })
})
