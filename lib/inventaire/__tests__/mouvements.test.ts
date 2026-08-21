import { describe, it, expect } from 'vitest'
import { validateMouvementPayload, previewMouvement } from '@/lib/inventaire/mouvements'

describe('validateMouvementPayload', () => {
  const base = { produit_id: 'p-1', type_mouvement: 'entree_achat', quantite: 5, cout_unitaire: 100 }

  it('refuse body invalide, produit manquant, type inconnu', () => {
    expect(validateMouvementPayload(null)).toMatchObject({ ok: false })
    expect(validateMouvementPayload({ ...base, produit_id: '' })).toMatchObject({ ok: false, error: 'produit_id requis' })
    expect(validateMouvementPayload({ ...base, type_mouvement: 'vol' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('type_mouvement invalide'),
    })
  })

  it('refuse les transferts (phase ultérieure)', () => {
    expect(validateMouvementPayload({ ...base, type_mouvement: 'transfert_sortie' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('transferts'),
    })
  })

  it('exige une quantité strictement positive', () => {
    expect(validateMouvementPayload({ ...base, quantite: 0 })).toMatchObject({ ok: false })
    expect(validateMouvementPayload({ ...base, quantite: -3 })).toMatchObject({ ok: false })
    expect(validateMouvementPayload({ ...base, quantite: 'abc' })).toMatchObject({ ok: false })
  })

  it('exige le coût réel pour une entrée d\'achat', () => {
    expect(validateMouvementPayload({ ...base, cout_unitaire: undefined })).toMatchObject({
      ok: false,
      error: expect.stringContaining('cout_unitaire requis'),
    })
    expect(validateMouvementPayload({ ...base, cout_unitaire: -5 })).toMatchObject({ ok: false })
  })

  it('ignore le coût fourni sur une sortie (valorisation CUMP forcée)', () => {
    const res = validateMouvementPayload({ ...base, type_mouvement: 'sortie_vente', cout_unitaire: 999 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.cout_unitaire).toBeNull()
    expect(res.data.sens).toBe('S')
  })

  it('normalise quantité (3 décimales), date et motif', () => {
    const res = validateMouvementPayload({
      ...base,
      quantite: 1.23456,
      date_mouvement: '2026-08-15',
      motif: '  Réception BL 42  ',
      depot_id: ' d-1 ',
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.quantite).toBe(1.235)
    expect(res.data.date_mouvement).toBe('2026-08-15')
    expect(res.data.motif).toBe('Réception BL 42')
    expect(res.data.depot_id).toBe('d-1')
    expect(res.data.sens).toBe('E')
  })

  it('date absente ou mal formée — remplacée par aujourd\'hui', () => {
    const res = validateMouvementPayload({ ...base, date_mouvement: '15/08/2026' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.date_mouvement).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('previewMouvement', () => {
  const etat = { quantite_depot: 10, quantite_totale: 10, cout_unitaire_moyen: 100 }

  it('entrée — recalcule le CUMP pondéré et la valeur', () => {
    const res = previewMouvement(etat, { type_mouvement: 'entree_achat', quantite: 10, cout_unitaire: 200 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toEqual({
      sens: 'E',
      cout_unitaire: 200,
      valeur_mouvement: 2000,
      quantite_apres: 20,
      cout_unitaire_moyen_apres: 150,
    })
  })

  it('entrée sans coût fourni — valorisée au CUMP courant', () => {
    const res = previewMouvement(etat, { type_mouvement: 'ajustement_inventaire_plus', quantite: 2, cout_unitaire: null })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.cout_unitaire).toBe(100)
    expect(res.data.cout_unitaire_moyen_apres).toBe(100)
  })

  it('sortie — CUMP inchangé, valeur au CUMP courant', () => {
    const res = previewMouvement(etat, { type_mouvement: 'sortie_vente', quantite: 4, cout_unitaire: null })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toEqual({
      sens: 'S',
      cout_unitaire: 100,
      valeur_mouvement: 400,
      quantite_apres: 6,
      cout_unitaire_moyen_apres: 100,
    })
  })

  it('sortie au-delà du stock dépôt — STOCK_INSUFFISANT', () => {
    const res = previewMouvement(etat, { type_mouvement: 'perte_casse', quantite: 11, cout_unitaire: null })
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining('STOCK_INSUFFISANT') })
  })

  it('quantité ou type invalides — refusés', () => {
    expect(previewMouvement(etat, { type_mouvement: 'sortie_vente', quantite: 0, cout_unitaire: null }))
      .toMatchObject({ ok: false, error: expect.stringContaining('QUANTITE_INVALIDE') })
    expect(previewMouvement(etat, { type_mouvement: 'x' as never, quantite: 1, cout_unitaire: null }))
      .toMatchObject({ ok: false, error: expect.stringContaining('TYPE_MOUVEMENT_INVALIDE') })
  })
})
