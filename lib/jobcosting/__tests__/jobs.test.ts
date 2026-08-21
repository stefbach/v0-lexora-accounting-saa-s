import { describe, it, expect } from 'vitest'
import { validateJobPayload } from '@/lib/jobcosting/jobs'
import {
  peutTransitionnerJob,
  peutTransitionnerValidation,
} from '@/lib/jobcosting/types'

describe('validateJobPayload', () => {
  it('accepte un job valide et normalise le code en majuscules', () => {
    const r = validateJobPayload({ code: 'job-2026-014', libelle: 'Audit ACME' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.code).toBe('JOB-2026-014')
      expect(r.data.libelle).toBe('Audit ACME')
      expect(r.data.type_facturation).toBe('temps_materiel')
      expect(r.data.devise).toBe('MUR')
    }
  })

  it('code et libelle requis', () => {
    expect(validateJobPayload({ libelle: 'x' }).ok).toBe(false)
    expect(validateJobPayload({ code: 'J1' }).ok).toBe(false)
  })

  it('type_facturation inconnu → temps_materiel', () => {
    const r = validateJobPayload({ code: 'J1', libelle: 'x', type_facturation: 'bidon' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.type_facturation).toBe('temps_materiel')
  })

  it('budgets négatifs → erreur', () => {
    expect(validateJobPayload({ code: 'J1', libelle: 'x', budget_heures: -1 }).ok).toBe(false)
    expect(validateJobPayload({ code: 'J1', libelle: 'x', budget_montant: -1 }).ok).toBe(false)
  })

  it('conserve dossier, contrat, responsable, dates et budgets', () => {
    const r = validateJobPayload({
      code: 'J1',
      libelle: 'x',
      dossier_id: 'd-1',
      contrat_id: 'c-1',
      responsable_id: 'r-1',
      date_debut: '2026-01-01',
      date_fin_prevue: '2026-06-30',
      budget_heures: 120.5,
      budget_montant: 90000,
      type_facturation: 'forfait',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.dossier_id).toBe('d-1')
      expect(r.data.contrat_id).toBe('c-1')
      expect(r.data.responsable_id).toBe('r-1')
      expect(r.data.date_debut).toBe('2026-01-01')
      expect(r.data.budget_heures).toBe(120.5)
      expect(r.data.budget_montant).toBe(90000)
      expect(r.data.type_facturation).toBe('forfait')
    }
  })

  it('date mal formée → null', () => {
    const r = validateJobPayload({ code: 'J1', libelle: 'x', date_debut: '01/01/2026' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.date_debut).toBeNull()
  })
})

describe('transitions de statut', () => {
  it('job : ouvert → en_cours → cloture → facture', () => {
    expect(peutTransitionnerJob('ouvert', 'en_cours')).toBe(true)
    expect(peutTransitionnerJob('en_cours', 'cloture')).toBe(true)
    expect(peutTransitionnerJob('cloture', 'facture')).toBe(true)
  })

  it('job : facturé ou annulé sont terminaux', () => {
    expect(peutTransitionnerJob('facture', 'en_cours')).toBe(false)
    expect(peutTransitionnerJob('annule', 'ouvert')).toBe(false)
  })

  it('validation : brouillon → soumis → valide → facture', () => {
    expect(peutTransitionnerValidation('brouillon', 'soumis')).toBe(true)
    expect(peutTransitionnerValidation('soumis', 'valide')).toBe(true)
    expect(peutTransitionnerValidation('valide', 'facture')).toBe(true)
    expect(peutTransitionnerValidation('facture', 'valide')).toBe(false)
  })

  it('validation : un rejet peut être resoumis', () => {
    expect(peutTransitionnerValidation('soumis', 'rejete')).toBe(true)
    expect(peutTransitionnerValidation('rejete', 'soumis')).toBe(true)
  })
})
