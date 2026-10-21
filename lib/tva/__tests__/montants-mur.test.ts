import { describe, it, expect } from 'vitest'
import { htMur, tvaMur, ttcMur } from '../montants-mur'

describe('montants-mur', () => {
  it('facture MUR : montants inchangés', () => {
    const f = { montant_ht: 1400, montant_tva: 210, montant_ttc: 1610, montant_mur: 1610 }
    expect(htMur(f)).toBe(1400)
    expect(tvaMur(f)).toBe(210)
    expect(ttcMur(f)).toBe(1610)
  })

  it('facture USD : ventile montant_mur au prorata HT/TVA', () => {
    // Vercel 99 USD HT + 19.80 TVA étrangère, 5 568.48 MUR TTC
    const f = { montant_ht: 99, montant_tva: 19.8, montant_ttc: 118.8, montant_mur: 5568.48 }
    expect(htMur(f)).toBe(4640.4)
    expect(tvaMur(f)).toBe(928.08)
    expect(ttcMur(f)).toBe(5568.48)
  })

  it('sans montant_mur : utilise taux_change', () => {
    const f = { montant_ht: 100, montant_tva: 0, montant_ttc: 100, taux_change: 54.8 }
    expect(htMur(f)).toBe(5480)
    expect(ttcMur(f)).toBe(5480)
  })

  it('accepte les numeric Postgres renvoyés en string', () => {
    const f = { montant_ht: '640000.00', montant_tva: '96000.00', montant_ttc: '736000.00', montant_mur: '736000.00' }
    expect(htMur(f)).toBe(640000)
    expect(tvaMur(f)).toBe(96000)
  })

  it('montants absents : 0', () => {
    expect(htMur({})).toBe(0)
    expect(tvaMur({})).toBe(0)
    expect(ttcMur({})).toBe(0)
  })
})
