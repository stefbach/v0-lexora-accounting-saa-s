import { describe, it, expect } from 'vitest'
import { validateAndCleanExtraction } from '../bank-utils'

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
