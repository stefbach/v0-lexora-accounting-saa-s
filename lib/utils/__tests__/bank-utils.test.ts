import { describe, it, expect } from 'vitest'
import { validateAndCleanExtraction, canRerouteToDetectedSociete, areDistinctInvoiceNumbers } from '../bank-utils'

const societes = [
  { id: 'dds', nom: 'Digital Data Solutions Ltd' },
  { id: 'occ', nom: 'Obesity Care Clinic Ltd' },
]

// Facture interco DDS → OCC : même PDF uploadé des deux côtés.
const extraction = () => ({
  emetteur: 'Digital Data Solutions Ltd',
  destinataire: { nom: 'Obesity Care Clinic', brn: 'C22187118' },
})

describe('validateAndCleanExtraction — société propriétaire d\'une facture', () => {
  it('facture client → société émettrice', () => {
    expect(validateAndCleanExtraction(extraction(), 'facture_client', societes).societe_id).toBe('dds')
  })

  it('facture fournisseur → société destinataire', () => {
    expect(validateAndCleanExtraction(extraction(), 'facture_fournisseur', societes).societe_id).toBe('occ')
  })
})

describe('canRerouteToDetectedSociete', () => {
  it('upload fait dans un environnement société → jamais re-routé', () => {
    expect(canRerouteToDetectedSociete({ societeId: 'occ', dossierId: null })).toBe(false)
    expect(canRerouteToDetectedSociete({ societeId: null, dossierId: 'dossier-occ' })).toBe(false)
  })

  it('upload sans société choisie → re-routage autorisé', () => {
    expect(canRerouteToDetectedSociete({ societeId: null, dossierId: null })).toBe(true)
    expect(canRerouteToDetectedSociete({ societeId: '', dossierId: '' })).toBe(true)
  })
})

describe('areDistinctInvoiceNumbers', () => {
  it('numéros différents → factures distinctes', () => {
    expect(areDistinctInvoiceNumbers('QWFA5IR7-0026', 'QWFA5IR7-0025')).toBe(true)
  })

  it('même numéro (casse / séparateurs près) → pas distinctes', () => {
    expect(areDistinctInvoiceNumbers('MI12190', 'mi-12190')).toBe(false)
  })

  it('numéro manquant → on ne peut pas conclure', () => {
    expect(areDistinctInvoiceNumbers(null, 'F4FA8804-0022')).toBe(false)
    expect(areDistinctInvoiceNumbers('', '')).toBe(false)
  })
})
