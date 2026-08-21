import { describe, it, expect } from 'vitest'
import {
  validateImputationPayload,
  heuresPointage,
  controleHeuresJournee,
} from '@/lib/jobcosting/imputations'

describe('validateImputationPayload', () => {
  const base = { employe_id: 'emp-1', job_id: 'job-1', heures: 7.5 }

  it('accepte une imputation job valide', () => {
    const r = validateImputationPayload(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.job_id).toBe('job-1')
      expect(r.data.ordre_fabrication_id).toBeNull()
      expect(r.data.heures).toBe(7.5)
      expect(r.data.facturable).toBe(true)
      expect(r.data.type_heures).toBe('normale')
    }
  })

  it('exige exactement un rattachement (job XOR OF)', () => {
    expect(validateImputationPayload({ ...base, ordre_fabrication_id: 'of-1' }).ok).toBe(false)
    const sansCible = validateImputationPayload({ employe_id: 'emp-1', heures: 3 })
    expect(sansCible.ok).toBe(false)
  })

  it('accepte un rattachement OF seul', () => {
    const r = validateImputationPayload({ employe_id: 'emp-1', ordre_fabrication_id: 'of-9', heures: 4 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.ordre_fabrication_id).toBe('of-9')
  })

  it('employe_id requis', () => {
    expect(validateImputationPayload({ job_id: 'job-1', heures: 2 }).ok).toBe(false)
  })

  it('heures strictement positives et ≤ 24', () => {
    expect(validateImputationPayload({ ...base, heures: 0 }).ok).toBe(false)
    expect(validateImputationPayload({ ...base, heures: -1 }).ok).toBe(false)
    expect(validateImputationPayload({ ...base, heures: 25 }).ok).toBe(false)
  })

  it('valide taux et coût horaire, arrondit le coût à 4 dp', () => {
    const r = validateImputationPayload({
      ...base,
      taux_horaire_facture: 500,
      cout_horaire_charge: 173.84619,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.taux_horaire_facture).toBe(500)
      expect(r.data.cout_horaire_charge).toBe(173.8462)
    }
  })

  it('rejette taux/coût négatifs', () => {
    expect(validateImputationPayload({ ...base, taux_horaire_facture: -1 }).ok).toBe(false)
    expect(validateImputationPayload({ ...base, cout_horaire_charge: -5 }).ok).toBe(false)
  })

  it('facturable=false et type_heures personnalisé', () => {
    const r = validateImputationPayload({ ...base, facturable: false, type_heures: 'heures_sup' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.facturable).toBe(false)
      expect(r.data.type_heures).toBe('heures_sup')
    }
  })

  it('date invalide → date du jour (format ISO)', () => {
    const r = validateImputationPayload({ ...base, date_prestation: 'nope' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.date_prestation).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('heuresPointage', () => {
  it('durée = sortie − entrée − pause', () => {
    expect(
      heuresPointage({
        heure_entree: '08:00',
        heure_sortie: '17:00',
        heure_pause_debut: '12:00',
        heure_pause_fin: '13:00',
      }),
    ).toBe(8) // 9h − 1h pause
  })

  it('sans pause → durée brute', () => {
    expect(heuresPointage({ heure_entree: '09:00', heure_sortie: '17:30' })).toBe(8.5)
  })

  it('accepte HH:MM:SS', () => {
    expect(heuresPointage({ heure_entree: '08:00:00', heure_sortie: '12:30:00' })).toBe(4.5)
  })

  it('pointage incomplet ou incohérent → 0', () => {
    expect(heuresPointage({ heure_entree: '08:00' })).toBe(0)
    expect(heuresPointage({ heure_entree: '17:00', heure_sortie: '08:00' })).toBe(0)
    expect(heuresPointage({})).toBe(0)
  })
})

describe('controleHeuresJournee', () => {
  it('ok quand total ≤ heures pointées', () => {
    const r = controleHeuresJournee(4, 3, 8)
    expect(r.ok).toBe(true)
    expect(r.heures_totales).toBe(7)
    expect(r.depassement).toBe(0)
  })

  it('dépassement quand total > pointées (sans tolérance)', () => {
    const r = controleHeuresJournee(6, 4, 8)
    expect(r.ok).toBe(false)
    expect(r.heures_totales).toBe(10)
    expect(r.depassement).toBe(2)
  })

  it('tolérance absorbe un léger dépassement', () => {
    const r = controleHeuresJournee(6, 3, 8, 1)
    expect(r.ok).toBe(true)
    expect(r.depassement).toBe(0)
  })

  it('heures pointées null (hors pointeuse) → toujours ok', () => {
    const r = controleHeuresJournee(6, 6, null)
    expect(r.ok).toBe(true)
    expect(r.heures_pointees).toBeNull()
  })
})
