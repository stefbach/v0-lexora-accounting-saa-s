import { describe, it, expect } from 'vitest'
import {
  buildLignesConsommation,
  coutUnitaireRevient,
  ecartConsommation,
  numeroOF,
  quantiteTheorique,
  validateLancementPayload,
  validateOrdrePayload,
  validateProductionPayload,
} from '@/lib/manufacturing/ordres'
import { peutTransitionner, TRANSITIONS_OF } from '@/lib/manufacturing/types'

describe('quantiteTheorique', () => {
  it('proratise sur le lot BOM et majore du taux de perte', () => {
    // ligne 2 / BOM pour 1 / produire 10 / perte 5% → 2 × 10 × 1.05 = 21
    expect(quantiteTheorique(2, 5, 10, 1)).toBe(21)
  })

  it('BOM par lot : ligne 25 pour 10 unités, produire 4 → 10', () => {
    expect(quantiteTheorique(25, 0, 4, 10)).toBe(10)
  })

  it('arrondit à 3 décimales (précision NUMERIC(15,3) du stock)', () => {
    // 1 × (1/3) = 0.3333… → 0.333
    expect(quantiteTheorique(1, 0, 1, 3)).toBe(0.333)
  })

  it('rejette lot BOM ou quantité à produire non positifs', () => {
    expect(() => quantiteTheorique(1, 0, 1, 0)).toThrow('QUANTITE_INVALIDE')
    expect(() => quantiteTheorique(1, 0, 0, 1)).toThrow('QUANTITE_INVALIDE')
  })
})

describe('buildLignesConsommation', () => {
  it('explose la BOM en lignes théoriques', () => {
    const lignes = buildLignesConsommation(
      [
        { produit_composant_id: 'c-bois', quantite: 2, taux_perte_pct: 5 },
        { produit_composant_id: 'c-vis', quantite: 12, taux_perte_pct: 0 },
      ],
      10,
      1,
    )
    expect(lignes).toEqual([
      { produit_id: 'c-bois', quantite_theorique: 21 },
      { produit_id: 'c-vis', quantite_theorique: 120 },
    ])
  })
})

describe('validateOrdrePayload', () => {
  it('accepte et normalise', () => {
    const res = validateOrdrePayload({
      nomenclature_id: 'bom-1',
      quantite_a_produire: '5',
      date_planifiee: '2026-09-01',
      notes: '  lot urgent  ',
    })
    expect(res).toEqual({
      ok: true,
      data: {
        nomenclature_id: 'bom-1',
        quantite_a_produire: 5,
        depot_id: null,
        date_planifiee: '2026-09-01',
        notes: 'lot urgent',
      },
    })
  })

  it.each([
    [null, 'Body JSON requis'],
    [{ quantite_a_produire: 5 }, 'nomenclature_id requis'],
    [{ nomenclature_id: 'b', quantite_a_produire: 0 }, 'quantite_a_produire'],
    [{ nomenclature_id: 'b', quantite_a_produire: 'abc' }, 'quantite_a_produire'],
  ])('rejette %#', (body, fragment) => {
    const res = validateOrdrePayload(body)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain(fragment)
  })

  it('ignore une date mal formée', () => {
    const res = validateOrdrePayload({ nomenclature_id: 'b', quantite_a_produire: 1, date_planifiee: '01/09/2026' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.date_planifiee).toBeNull()
  })
})

describe('validateLancementPayload', () => {
  it('accepte des lignes, réel par défaut = théorique fourni séparément', () => {
    const res = validateLancementPayload({
      date: '2026-08-20',
      lignes: [
        { produit_id: 'c-1', quantite_theorique: 21, quantite_reelle: 22.5 },
        { produit_id: 'c-2', quantite_reelle: 120 },
      ],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.date).toBe('2026-08-20')
    expect(res.data.lignes).toEqual([
      { produit_id: 'c-1', quantite_theorique: 21, quantite_reelle: 22.5 },
      { produit_id: 'c-2', quantite_theorique: 120, quantite_reelle: 120 },
    ])
  })

  it('date absente → aujourd\'hui (format ISO)', () => {
    const res = validateLancementPayload({ lignes: [{ produit_id: 'c-1', quantite_reelle: 1 }] })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it.each([
    [{}, 'Au moins une ligne'],
    [{ lignes: [{ produit_id: 'c-1', quantite_reelle: 0 }] }, 'quantite_reelle'],
    [{ lignes: [{ quantite_reelle: 1 }] }, 'produit_id'],
    [{ lignes: [{ produit_id: 'c-1', quantite_reelle: 1, quantite_theorique: -2 }] }, 'quantite_theorique'],
    [
      { lignes: [{ produit_id: 'c-1', quantite_reelle: 1 }, { produit_id: 'c-1', quantite_reelle: 2 }] },
      'double',
    ],
  ])('rejette %#', (body, fragment) => {
    const res = validateLancementPayload(body)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain(fragment)
  })
})

describe('validateProductionPayload', () => {
  it('accepte une quantité positive', () => {
    const res = validateProductionPayload({ quantite_produite: 9.5, date: '2026-08-21' })
    expect(res).toEqual({ ok: true, data: { quantite_produite: 9.5, date: '2026-08-21' } })
  })

  it('rejette quantité nulle ou négative', () => {
    expect(validateProductionPayload({ quantite_produite: 0 }).ok).toBe(false)
    expect(validateProductionPayload({ quantite_produite: -3 }).ok).toBe(false)
  })
})

describe('coutUnitaireRevient', () => {
  it('divise matières + main d\'œuvre par la quantité, 4 décimales', () => {
    expect(coutUnitaireRevient(975, 0, 10)).toBe(97.5)
    expect(coutUnitaireRevient(100, 0, 7)).toBe(14.2857)
    expect(coutUnitaireRevient(100, 40, 7)).toBe(20)
  })

  it('précision Decimal — pas de dérive float', () => {
    // 0.1 + 0.2 = 0.3 exactement, pas 0.30000000000000004
    expect(coutUnitaireRevient(0.1, 0.2, 1)).toBe(0.3)
  })

  it('quantité non positive → erreur', () => {
    expect(() => coutUnitaireRevient(100, 0, 0)).toThrow('QUANTITE_INVALIDE')
  })
})

describe('ecartConsommation / numeroOF / transitions', () => {
  it('écart = réel − théorique, arrondi au centime', () => {
    expect(ecartConsommation(945, 967.5)).toBe(22.5)
    expect(ecartConsommation(945, 900)).toBe(-45)
    expect(ecartConsommation(10.005, 10.005)).toBe(0)
  })

  it('numéro OF formaté', () => {
    expect(numeroOF(2026, 7)).toBe('OF-2026-0007')
    expect(numeroOF('2026', 12345)).toBe('OF-2026-12345')
  })

  it('transitions d\'état MVP', () => {
    expect(peutTransitionner('planifie', 'en_cours')).toBe(true)
    expect(peutTransitionner('planifie', 'annule')).toBe(true)
    expect(peutTransitionner('en_cours', 'cloture')).toBe(true)
    expect(peutTransitionner('planifie', 'cloture')).toBe(false)
    expect(peutTransitionner('cloture', 'en_cours')).toBe(false)
    expect(TRANSITIONS_OF.cloture).toEqual([])
    expect(TRANSITIONS_OF.annule).toEqual([])
  })
})
