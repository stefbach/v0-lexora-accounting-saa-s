import { describe, it, expect } from 'vitest'
import { estimerImpot, tauxISPct, type EstimationInput } from '@/lib/reporting/estimation-impot'

const base: EstimationInput = {
  resultat_exercice: 0, regime: 'domestic', tva_nette: 0, tva_assujetti: true,
}

function ligne(r: ReturnType<typeof estimerImpot>, cle: 'is' | 'tva') {
  const l = r.lignes.find(x => x.cle === cle)
  if (!l) throw new Error(`ligne ${cle} absente`)
  return l
}

describe('tauxISPct', () => {
  it('domestic → 15 %, GBC1 → 3 %, authorised_company → 3 %', () => {
    expect(tauxISPct('domestic')).toBe(15)
    expect(tauxISPct(undefined)).toBe(15)
    expect(tauxISPct('gbc1')).toBe(3)
    expect(tauxISPct('authorised_company')).toBe(3)
  })
})

describe('estimerImpot', () => {
  it('IS = 15 % du résultat positif (domestic)', () => {
    const r = estimerImpot({ ...base, resultat_exercice: 100000 })
    const is = ligne(r, 'is')
    expect(is.base).toBe(100000)
    expect(is.taux_pct).toBe(15)
    expect(is.montant).toBe(15000)
    expect(r.total_a_provisionner).toBe(15000)
  })

  it('IS = 3 % pour un GBC1', () => {
    const r = estimerImpot({ ...base, resultat_exercice: 100000, regime: 'gbc1', tva_assujetti: false })
    expect(ligne(r, 'is').montant).toBe(3000)
    expect(r.taux_is_pct).toBe(3)
  })

  it('résultat déficitaire → IS estimé à 0', () => {
    const r = estimerImpot({ ...base, resultat_exercice: -50000, tva_assujetti: false })
    expect(ligne(r, 'is').montant).toBe(0)
    expect(r.total_a_provisionner).toBe(0)
  })

  it('TVA nette positive → ligne à reverser, comptée dans le total', () => {
    const r = estimerImpot({ ...base, resultat_exercice: 100000, tva_nette: 12000 })
    const tva = ligne(r, 'tva')
    expect(tva.credit).toBe(false)
    expect(tva.montant).toBe(12000)
    expect(r.total_a_provisionner).toBe(15000 + 12000)
  })

  it('TVA nette négative → crédit, exclu du total à provisionner', () => {
    const r = estimerImpot({ ...base, resultat_exercice: 100000, tva_nette: -4000 })
    const tva = ligne(r, 'tva')
    expect(tva.credit).toBe(true)
    expect(tva.montant).toBe(4000)
    expect(r.total_a_provisionner).toBe(15000) // le crédit ne s'ajoute pas
  })

  it('non assujetti TVA → pas de ligne TVA', () => {
    const r = estimerImpot({ ...base, resultat_exercice: 10000, tva_assujetti: false, tva_nette: 9999 })
    expect(r.lignes.find(l => l.cle === 'tva')).toBeUndefined()
    expect(r.lignes).toHaveLength(1)
  })

  it('arrondit correctement (pas de flottant)', () => {
    const r = estimerImpot({ ...base, resultat_exercice: 33333.33, tva_assujetti: false })
    expect(ligne(r, 'is').montant).toBe(5000) // 33333.33 * 0.15 = 4999.9995 → 5000.00
  })
})
