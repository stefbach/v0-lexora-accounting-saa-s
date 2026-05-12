import { describe, it, expect } from 'vitest'
import { validateContactPayload } from './validate'

describe('validateContactPayload', () => {
  it('refuse un nom vide', () => {
    const r = validateContactPayload({ nom: '   ' })
    expect(r.ok).toBe(false)
  })

  it('refuse un nom trop long', () => {
    const r = validateContactPayload({ nom: 'a'.repeat(201) })
    expect(r.ok).toBe(false)
  })

  it('refuse un email invalide', () => {
    const r = validateContactPayload({ nom: 'BobCo', email: 'not-an-email' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/email/)
  })

  it('accepte un email valide', () => {
    const r = validateContactPayload({ nom: 'BobCo', email: 'bob@example.com' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.email).toBe('bob@example.com')
  })

  it('refuse conditions_paiement hors bornes', () => {
    expect(validateContactPayload({ nom: 'x', conditions_paiement: -1 }).ok).toBe(false)
    expect(validateContactPayload({ nom: 'x', conditions_paiement: 366 }).ok).toBe(false)
    expect(validateContactPayload({ nom: 'x', conditions_paiement: 60 }).ok).toBe(true)
  })

  it('applique les défauts', () => {
    const r = validateContactPayload({ nom: '  BobCo  ' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.nom).toBe('BobCo')
      expect(r.data.devise).toBe('MUR')
      expect(r.data.conditions_paiement).toBe(30)
      expect(r.data.offshore).toBe(false)
      expect(r.data.actif).toBe(true)
      expect(r.data.email).toBeNull()
    }
  })

  it('normalise la devise', () => {
    const r = validateContactPayload({ nom: 'x', devise: 'eur' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.devise).toBe('EUR')
  })

  it('tronque les champs textuels longs', () => {
    const r = validateContactPayload({
      nom: 'x',
      entreprise: 'a'.repeat(300),
      adresse: 'b'.repeat(700),
      telephone: 'c'.repeat(100),
      vat_number: 'd'.repeat(100),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.entreprise!.length).toBe(200)
      expect(r.data.adresse!.length).toBe(500)
      expect(r.data.telephone!.length).toBe(50)
      expect(r.data.vat_number!.length).toBe(50)
    }
  })

  it('respecte offshore=true et actif=false', () => {
    const r = validateContactPayload({ nom: 'x', offshore: true, actif: false })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.offshore).toBe(true)
      expect(r.data.actif).toBe(false)
    }
  })
})
