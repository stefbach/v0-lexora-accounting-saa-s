import { describe, it, expect } from 'vitest'
import { construireSynthese, type SyntheseInput } from '@/lib/reporting/synthese-mensuelle'

const base: SyntheseInput = {
  mois_label: 'juillet 2026',
  revenus: 0, depenses: 0, tva_nette: 0,
  creances: 0, dettes_fournisseurs: 0, dettes_fiscales: 0, dettes_sociales: 0,
  tresorerie: 0,
}

function carte(s: ReturnType<typeof construireSynthese>, cle: string) {
  const c = s.cartes.find(x => x.cle === cle)
  if (!c) throw new Error(`carte ${cle} absente`)
  return c
}

describe('construireSynthese', () => {
  it('mois bénéficiaire, trésorerie positive, dettes maîtrisées → verdict positif', () => {
    const s = construireSynthese({ ...base, revenus: 100000, depenses: 60000, tresorerie: 80000, dettes_fournisseurs: 10000 })
    expect(s.resultat).toBe(40000)
    expect(s.verdict.ton).toBe('positif')
    expect(carte(s, 'resultat').ton).toBe('positif')
  })

  it('dépenses > recettes → résultat négatif et verdict négatif', () => {
    const s = construireSynthese({ ...base, revenus: 30000, depenses: 50000, tresorerie: 5000 })
    expect(s.resultat).toBe(-20000)
    expect(s.verdict.ton).toBe('negatif')
    expect(carte(s, 'resultat').ton).toBe('negatif')
  })

  it('bénéfice mais trésorerie à zéro → verdict attention (bénéfices immobilisés)', () => {
    const s = construireSynthese({ ...base, revenus: 50000, depenses: 20000, tresorerie: 0, creances: 30000 })
    expect(s.verdict.ton).toBe('attention')
  })

  it('bénéfice, trésorerie ok mais dettes > trésorerie → verdict attention', () => {
    const s = construireSynthese({ ...base, revenus: 50000, depenses: 20000, tresorerie: 10000, dettes_fournisseurs: 40000 })
    expect(s.verdict.ton).toBe('attention')
  })

  it('TVA nette positive → carte « à reverser », ton attention', () => {
    const s = construireSynthese({ ...base, revenus: 100000, depenses: 60000, tva_nette: 12000, tresorerie: 50000 })
    const c = carte(s, 'tva')
    expect(c.titre).toMatch(/reverser/i)
    expect(c.montant).toBe(12000)
    expect(c.ton).toBe('attention')
  })

  it('TVA nette négative → carte « crédit de TVA », montant absolu, ton neutre', () => {
    const s = construireSynthese({ ...base, revenus: 10000, depenses: 8000, tva_nette: -3000, tresorerie: 5000 })
    const c = carte(s, 'tva')
    expect(c.titre).toMatch(/crédit/i)
    expect(c.montant).toBe(3000)
    expect(c.ton).toBe('neutre')
  })

  it('agrège les 3 dettes (fournisseurs + fiscales + sociales)', () => {
    const s = construireSynthese({ ...base, revenus: 1, dettes_fournisseurs: 1000, dettes_fiscales: 500, dettes_sociales: 250 })
    expect(s.total_dettes).toBe(1750)
    expect(carte(s, 'dettes').montant).toBe(1750)
  })

  it('aucune créance → ton positif et phrase rassurante', () => {
    const s = construireSynthese({ ...base, revenus: 5000, depenses: 1000, tresorerie: 4000, creances: 0 })
    expect(carte(s, 'creances').ton).toBe('positif')
  })

  it('tendance CA en hausse quand mois précédent fourni', () => {
    const s = construireSynthese({ ...base, revenus: 12000, depenses: 5000, tresorerie: 7000, revenus_mois_precedent: 10000 })
    expect(carte(s, 'revenus').phrase).toMatch(/hausse de 20%/)
  })

  it('produit toujours 7 cartes', () => {
    expect(construireSynthese(base).cartes).toHaveLength(7)
  })

  it('arrondit à 2 décimales (pas de flottant)', () => {
    const s = construireSynthese({ ...base, revenus: 100.1, depenses: 33.33, tresorerie: 10 })
    expect(s.resultat).toBe(66.77)
  })
})
