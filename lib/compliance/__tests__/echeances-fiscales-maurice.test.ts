import { describe, it, expect } from 'vitest'
import {
  genererEcheancesFiscales,
  statutEcheance,
  finDeMois,
  type ProfilConformite,
} from '@/lib/compliance/echeances-fiscales-maurice'

const base: ProfilConformite = {
  tva_assujetti: false,
  tva_frequence: 'trimestrielle',
  a_salaries: false,
  applique_tds: false,
  date_fin_exercice: null,
}

describe('finDeMois', () => {
  it('dernier jour du mois (années bissextiles incluses)', () => {
    expect(finDeMois(2026, 0)).toBe('2026-01-31')
    expect(finDeMois(2026, 1)).toBe('2026-02-28')
    expect(finDeMois(2024, 1)).toBe('2024-02-29') // bissextile
    expect(finDeMois(2026, 3)).toBe('2026-04-30')
  })
})

describe('statutEcheance', () => {
  it('classe en retard / proche / à venir', () => {
    expect(statutEcheance('2026-08-01', '2026-08-15')).toBe('en_retard')
    expect(statutEcheance('2026-08-20', '2026-08-15')).toBe('proche') // ≤14j
    expect(statutEcheance('2026-09-30', '2026-08-15')).toBe('a_venir')
  })
})

describe('genererEcheancesFiscales — profil vide', () => {
  it('aucune obligation si rien n\'est activé', () => {
    expect(genererEcheancesFiscales(base, { from: '2026-08-15' })).toEqual([])
  })
})

describe('TVA', () => {
  it('mensuelle : échéance fin du mois suivant la période', () => {
    const ech = genererEcheancesFiscales(
      { ...base, tva_assujetti: true, tva_frequence: 'mensuelle' },
      { from: '2026-08-15', horizonMois: 1, lookbackMois: 0 },
    ).filter(e => e.type === 'tva')
    // période juillet → échéance 31 août ; période août → 30 sept
    const aout = ech.find(e => e.date_echeance === '2026-08-31')
    expect(aout).toBeTruthy()
    expect(aout!.periode).toBe('juillet 2026')
    expect(ech.some(e => e.date_echeance === '2026-09-30' && e.periode === 'août 2026')).toBe(true)
  })

  it('trimestrielle : une échéance par fin de trimestre', () => {
    const ech = genererEcheancesFiscales(
      { ...base, tva_assujetti: true, tva_frequence: 'trimestrielle' },
      { from: '2026-09-01', horizonMois: 2, lookbackMois: 0 },
    ).filter(e => e.type === 'tva')
    // T3 (juil-sept) clôt fin sept → échéance 31 octobre
    const t3 = ech.find(e => e.periode === 'T3 2026')
    expect(t3).toBeTruthy()
    expect(t3!.date_echeance).toBe('2026-10-31')
    expect(t3!.frequence).toBe('trimestrielle')
  })
})

describe('Paie MRA', () => {
  it('mensuelle si salariés : PAYE + CSG + NSF', () => {
    const ech = genererEcheancesFiscales(
      { ...base, a_salaries: true },
      { from: '2026-08-15', horizonMois: 1, lookbackMois: 0 },
    ).filter(e => e.type === 'paie')
    expect(ech.length).toBeGreaterThan(0)
    expect(ech[0].titre).toContain('PAYE')
    expect(ech.some(e => e.date_echeance === '2026-08-31')).toBe(true)
  })
})

describe('Overdue (lookback)', () => {
  it('remonte une échéance passée récente en retard', () => {
    const ech = genererEcheancesFiscales(
      { ...base, a_salaries: true },
      { from: '2026-08-15', horizonMois: 0, lookbackMois: 1 },
    )
    const passee = ech.find(e => e.date_echeance === '2026-07-31')
    expect(passee).toBeTruthy()
    expect(statutEcheance(passee!.date_echeance, '2026-08-15')).toBe('en_retard')
  })
})

describe('CIT (impôt sociétés)', () => {
  it('6 mois après la clôture', () => {
    const ech = genererEcheancesFiscales(
      { ...base, date_fin_exercice: '2026-06-30' },
      { from: '2026-11-01', horizonMois: 3, lookbackMois: 0 },
    ).filter(e => e.type === 'cit')
    // clôture juin → +6 mois → 31 décembre
    expect(ech.some(e => e.date_echeance === '2026-12-31')).toBe(true)
  })
})

describe('IT Form 3', () => {
  it('30 septembre si TDS appliqué', () => {
    const ech = genererEcheancesFiscales(
      { ...base, applique_tds: true },
      { from: '2026-09-01', horizonMois: 1, lookbackMois: 0 },
    ).filter(e => e.type === 'it_form3')
    expect(ech.some(e => e.date_echeance === '2026-09-30')).toBe(true)
  })
})

describe('tri + dédoublonnage', () => {
  it('échéances triées par date croissante, ids uniques', () => {
    const ech = genererEcheancesFiscales(
      { tva_assujetti: true, tva_frequence: 'mensuelle', a_salaries: true, applique_tds: true, date_fin_exercice: '2026-06-30' },
      { from: '2026-08-15', horizonMois: 4, lookbackMois: 2 },
    )
    const dates = ech.map(e => e.date_echeance)
    expect([...dates]).toEqual([...dates].sort())
    expect(new Set(ech.map(e => e.id)).size).toBe(ech.length)
  })
})
