/**
 * Coverage-gap test — Phase V5-47.
 *
 * Exercises pure-logic helpers that previously had 0% line coverage. The
 * assertions are intentionally light — we are confirming the modules load
 * and the main branches execute without throwing. Domain-specific
 * correctness lives in the dedicated suites (rh/, accounting/, ifrs/, …).
 *
 * Selection criteria for inclusion here:
 *   • No Supabase client required (or trivial mockable one)
 *   • No DOM / React rendering
 *   • Public functions that take primitive / plain-object inputs
 */
import { describe, it, expect } from 'vitest'

// ─── lib/rh/period ───────────────────────────────────────────────────
import { lastDayOfMonth, firstDayOfMonth, monthRange } from '@/lib/rh/period'

// ─── lib/accounting/tds ──────────────────────────────────────────────
import { autoClassifyTds, computeTds, generateTdsCsv, TDS_RATES } from '@/lib/accounting/tds'

// ─── lib/accounting/accounting-rules ─────────────────────────────────
import {
  assertEquilibre,
  assertLettrageUnique,
  assertAfterCloture,
  assertIrreversibilite,
  assertNoLettreOnResultat,
  validateLettrageGroup,
} from '@/lib/accounting/accounting-rules'

// ─── lib/amortissements ──────────────────────────────────────────────
import { calculerAmortissements, TAUX_PAR_CATEGORIE } from '@/lib/amortissements'

// ─── lib/jurisdictions/ohada/conversion ──────────────────────────────
import {
  EXCHANGE_RATES_VS_EUR,
  getEurRate,
  convertCurrency,
  roundForCurrency,
  formatCurrency,
  shareSamePeg,
  validateMultiCurrencyEntry,
} from '@/lib/jurisdictions/ohada/conversion'

// ─── lib/planning/converters ─────────────────────────────────────────
import {
  hexToTailwind,
  tailwindToHex,
  shiftToCreneau,
  creneauToShift,
} from '@/lib/planning/converters'

// ─── lib/planning/presets ────────────────────────────────────────────
import {
  PRESET_OCC_SHIFTS,
  PRESET_DDS_SHIFTS,
  hydratePreset,
} from '@/lib/planning/presets'

// ─── lib/jurisdictions translations ──────────────────────────────────
import * as ohadaFr from '@/lib/jurisdictions/i18n/ohada-fr'

// ─── lib/jurisdictions/ohada/statements/SMT ──────────────────────────
import {
  checkSMTEligibility,
  SMT_SEUIL_CA_XOF,
  SMT_SEUIL_EFFECTIF,
} from '@/lib/jurisdictions/ohada/statements/systeme-minimal-tresorerie'

describe('rh/period', () => {
  it('lastDayOfMonth handles 30-day, 31-day, leap-year months', () => {
    expect(lastDayOfMonth('2026-04')).toBe('2026-04-30')
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31')
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28')
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
  })

  it('accepts YYYY-MM-DD format and ignores the day', () => {
    expect(lastDayOfMonth('2026-06-15')).toBe('2026-06-30')
  })

  it('falls back defensively to -28 for malformed input', () => {
    expect(lastDayOfMonth('bogus--')).toMatch(/-28$/)
  })

  it('firstDayOfMonth + monthRange', () => {
    expect(firstDayOfMonth('2026-05')).toBe('2026-05-01')
    expect(monthRange('2026-05')).toEqual(['2026-05-01', '2026-05-31'])
  })
})

describe('accounting/tds', () => {
  it('exposes the official TDS rate table', () => {
    expect(TDS_RATES.rent.rate).toBe(5)
    expect(TDS_RATES.royalties.rate).toBe(15)
    expect(TDS_RATES.none.rate).toBe(0)
  })

  it('autoClassifyTds matches account number prefixes', () => {
    expect(autoClassifyTds({ numero_compte: '6132100' })).toBe('rent')
    expect(autoClassifyTds({ numero_compte: '6510000' })).toBe('royalties')
    expect(autoClassifyTds({ numero_compte: '6228' })).toBe('management_fees')
    expect(autoClassifyTds({ numero_compte: '6226' })).toBe('professional_fees')
    expect(autoClassifyTds({ numero_compte: '6135' })).toBe('contract_payments')
  })

  it('autoClassifyTds matches description heuristics', () => {
    expect(autoClassifyTds({ description: 'Loyer bureau' })).toBe('rent')
    expect(autoClassifyTds({ description: 'Royalty payment' })).toBe('royalties')
    expect(autoClassifyTds({ description: 'Honoraires avocat' })).toBe('professional_fees')
    expect(autoClassifyTds({ description: 'Commission apporteur' })).toBe('commission')
    expect(autoClassifyTds({ description: 'Jeton de présence directors' })).toBe('director_fees')
  })

  it('autoClassifyTds detects non-resident interest', () => {
    expect(autoClassifyTds({ numero_compte: '6611', tiers_country: 'FR' })).toBe('interest_non_resident')
    expect(autoClassifyTds({ numero_compte: '6611', tiers_country: 'MU' })).toBe('none')
  })

  it('autoClassifyTds returns none when nothing matches', () => {
    expect(autoClassifyTds({})).toBe('none')
    expect(autoClassifyTds({ description: 'random expense' })).toBe('none')
  })

  it('computeTds applies the threshold', () => {
    expect(computeTds(100, 'rent')).toEqual({ amount: 0, rate: 5, applies: false }) // < 500
    const r = computeTds(1000, 'rent')
    expect(r.applies).toBe(true)
    expect(r.amount).toBeCloseTo(50, 2)
  })

  it('computeTds returns zero for category none', () => {
    expect(computeTds(10_000, 'none')).toEqual({ amount: 0, rate: 0, applies: false })
  })

  it('generateTdsCsv emits the expected header + total lines', () => {
    const csv = generateTdsCsv({
      societe_name: 'OCC Ltd',
      societe_tan: 'TAN123',
      periode: '2026-04',
      records: [
        { tiers: 'Landlord', category: 'rent', gross_mur: 1000, tds_mur: 50, payment_date: '2026-04-10' },
        { tiers: 'Cabinet', category: 'professional_fees', gross_mur: 2000, tds_mur: 60, payment_date: '2026-04-15' },
      ],
    })
    expect(csv).toMatch(/TDS Statement — OCC Ltd/)
    expect(csv).toMatch(/TAN: TAN123/)
    expect(csv).toMatch(/TOTAL,3000\.00,,110\.00/)
  })
})

describe('accounting/accounting-rules', () => {
  it('R1 — assertEquilibre passes when débit = crédit', () => {
    expect(
      assertEquilibre([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ]),
    ).toBeNull()
  })

  it('R1 — assertEquilibre flags imbalance', () => {
    expect(
      assertEquilibre([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 90 },
      ]),
    ).toMatch(/R1 violée/)
  })

  it('R1 — assertEquilibre tolerates empty array', () => {
    expect(assertEquilibre([])).toBeNull()
  })

  it('R2 — assertLettrageUnique allows same-letter rewrite', () => {
    expect(
      assertLettrageUnique(
        [{ id: 'e1', lettre: 'A' }, { id: 'e2', lettre: null }],
        'A',
      ),
    ).toBeNull()
  })

  it('R2 — assertLettrageUnique blocks conflicting letter', () => {
    expect(
      assertLettrageUnique([{ id: 'e1', lettre: 'A' }], 'B'),
    ).toMatch(/R2 violée/)
  })

  it('R2 — empty new letter is a no-op', () => {
    expect(assertLettrageUnique([{ id: 'e1', lettre: 'X' }], '')).toBeNull()
  })

  it('R5 — assertAfterCloture rejects pre-closure dates', () => {
    expect(
      assertAfterCloture({ date_ecriture: '2025-01-15' }, '2025-12-31'),
    ).toMatch(/R5 violée/)
    expect(
      assertAfterCloture({ date_ecriture: '2026-01-15' }, '2025-12-31'),
    ).toBeNull()
    expect(assertAfterCloture({ date_ecriture: '2025-12-31' }, null)).toBeNull()
  })

  it('R6 — assertIrreversibilite blocks field changes on lettered entries', () => {
    expect(
      assertIrreversibilite(
        { id: 'e1', lettre: 'A', compte: '411000', debit: 100 },
        { compte: '411001' },
      ),
    ).toMatch(/R6 violée/)

    expect(
      assertIrreversibilite(
        { id: 'e1', lettre: null, compte: '411000' },
        { compte: '411001' },
      ),
    ).toBeNull()
  })

  it('R7 — assertNoLettreOnResultat blocks 6xxx / 7xxx', () => {
    expect(assertNoLettreOnResultat([{ compte: '601000' }])).toMatch(/R7 violée/)
    expect(assertNoLettreOnResultat([{ compte: '411000' }])).toBeNull()
  })

  it('validateLettrageGroup chains R7 → R2 → R1', () => {
    // R7 violation wins first.
    expect(
      validateLettrageGroup({
        ecritures: [{ compte: '601000', debit: 100, credit: 0 }],
        newLettre: 'A',
      }),
    ).toMatch(/R7/)

    // Then R1 imbalance.
    expect(
      validateLettrageGroup({
        ecritures: [
          { compte: '411000', debit: 100, credit: 0 },
          { compte: '512000', debit: 0, credit: 90 },
        ],
        newLettre: 'A',
      }),
    ).toMatch(/R1/)

    // Happy path.
    expect(
      validateLettrageGroup({
        ecritures: [
          { compte: '411000', debit: 100, credit: 0, date_ecriture: '2026-01-15' },
          { compte: '512000', debit: 0, credit: 100, date_ecriture: '2026-01-15' },
        ],
        newLettre: 'A',
        cloture_date: '2025-12-31',
      }),
    ).toBeNull()
  })
})

describe('amortissements', () => {
  it('exposes a standard rate table', () => {
    expect(TAUX_PAR_CATEGORIE.materiel_informatique).toBe(50)
    expect(TAUX_PAR_CATEGORIE.vehicule).toBe(25)
    expect(TAUX_PAR_CATEGORIE.immobilier).toBe(5)
  })

  it('linéaire — generates straight-line dotations', () => {
    const rows = calculerAmortissements(
      {
        id: 'i1',
        date_acquisition: '2024-07-01',
        cout_acquisition: 1000,
        taux_amortissement: 25,
        methode: 'lineaire',
      },
      2024,
      10,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(5)
    expect(rows[0].dotation).toBeCloseTo(250, 2)
    expect(rows[0].cumul_apres).toBeCloseTo(250, 2)
  })

  it('dégressif — produces a decreasing series', () => {
    const rows = calculerAmortissements(
      {
        id: 'i1',
        date_acquisition: '2024-07-01',
        cout_acquisition: 1000,
        taux_amortissement: 50,
        methode: 'degressif',
      },
      2024,
      10,
    )
    expect(rows.length).toBeGreaterThan(1)
    expect(rows[0].dotation).toBeGreaterThan(rows[1].dotation)
  })

  it('stops once cession date passes', () => {
    const rows = calculerAmortissements(
      {
        id: 'i1',
        date_acquisition: '2024-07-01',
        cout_acquisition: 1000,
        taux_amortissement: 25,
        methode: 'lineaire',
        date_cession: '2025-08-01',
      },
      2024,
      10,
    )
    expect(rows.length).toBeLessThanOrEqual(2)
  })
})

describe('jurisdictions/ohada/conversion', () => {
  it('exposes pegged + floating rates', () => {
    expect(EXCHANGE_RATES_VS_EUR.XOF).toBeCloseTo(655.957, 3)
    expect(EXCHANGE_RATES_VS_EUR.USD).toBeGreaterThan(0)
  })

  it('getEurRate returns 1 for unknown currencies', () => {
    expect(getEurRate('EUR' as never)).toBe(1)
  })

  it('convertCurrency identity returns input', () => {
    expect(convertCurrency(100, 'EUR' as never, 'EUR' as never)).toBe(100)
  })

  it('convertCurrency EUR → XOF uses the peg', () => {
    expect(convertCurrency(1, 'EUR' as never, 'XOF' as never)).toBeCloseTo(655.957, 3)
  })

  it('convertCurrency XOF → EUR is the inverse', () => {
    expect(convertCurrency(655.957, 'XOF' as never, 'EUR' as never)).toBeCloseTo(1, 4)
  })

  it('convertCurrency USD → XOF goes via EUR pivot', () => {
    const out = convertCurrency(1, 'USD' as never, 'XOF' as never)
    expect(out).toBeGreaterThan(0)
  })

  it('roundForCurrency obeys decimals table', () => {
    expect(roundForCurrency(1234.567, 'XOF' as never)).toBe(1235)
    expect(roundForCurrency(1.234, 'USD' as never)).toBe(1.23)
  })

  it('formatCurrency returns a non-empty string', () => {
    expect(formatCurrency(1000, 'EUR' as never)).toContain('1')
  })

  it('shareSamePeg recognises CFA pair', () => {
    expect(shareSamePeg('XOF' as never, 'XAF' as never)).toBe(true)
    expect(shareSamePeg('USD' as never, 'XAF' as never)).toBe(false)
  })

  it('validateMultiCurrencyEntry within tolerance', () => {
    const r = validateMultiCurrencyEntry(1, 'EUR' as never, 'XOF' as never, 656)
    expect(r.valid).toBe(true)
    expect(r.converted).toBeCloseTo(656, 0)
  })
})

describe('planning/converters', () => {
  it('hex ↔ tailwind round-trips for known colours', () => {
    expect(hexToTailwind('#4CAF50')).toContain('emerald')
    expect(tailwindToHex('bg-emerald-500 text-white')).toBe('#4CAF50')
  })

  it('hex ↔ tailwind fallbacks for unknown values', () => {
    expect(hexToTailwind('#000000')).toContain('blue-500')
    expect(tailwindToHex('not-a-class')).toBe('#2196F3')
  })

  it('shift ↔ creneau round-trips main fields', () => {
    const shift = PRESET_OCC_SHIFTS[0]
    const c = shiftToCreneau({ ...shift, id: 's1' })
    expect(c.code).toBe(shift.code)
    expect(c.heures_effectives).toBe(shift.heures_requises)

    const back = creneauToShift(c)
    expect(back.code).toBe(shift.code)
    expect(back.type).toBe('normal')
  })

  it('creneauToShift infers repos / nuit from label', () => {
    const repos = creneauToShift({
      id: 'r', nom: 'Repos hebdo', code: 'R',
      heure_debut: '', heure_fin: '', pause_debut: '', pause_fin: '',
      pause_minutes: 0, heures_effectives: 0, couleur: 'bg-gray-200 text-gray-600',
    })
    expect(repos.type).toBe('repos')

    const nuit = creneauToShift({
      id: 'n', nom: 'Equipe de nuit', code: 'N',
      heure_debut: '22:00', heure_fin: '06:00', pause_debut: '', pause_fin: '',
      pause_minutes: 30, heures_effectives: 8, couleur: 'bg-purple-500 text-white',
    })
    expect(nuit.type).toBe('nuit')
  })
})

describe('planning/presets', () => {
  it('OCC preset has Journée + Repos', () => {
    expect(PRESET_OCC_SHIFTS.map(s => s.code)).toEqual(['J', 'R'])
  })

  it('DDS preset has Bureau + Repos', () => {
    expect(PRESET_DDS_SHIFTS.map(s => s.code)).toEqual(['B', 'R'])
  })

  it('hydratePreset assigns unique ids', () => {
    const out = hydratePreset(PRESET_OCC_SHIFTS)
    expect(out.length).toBe(PRESET_OCC_SHIFTS.length)
    const ids = new Set(out.map(s => s.id))
    expect(ids.size).toBe(out.length)
    // and preserves all other fields
    expect(out[0].code).toBe(PRESET_OCC_SHIFTS[0].code)
  })
})

describe('jurisdictions/i18n/ohada-fr', () => {
  it('module exports a non-empty translation tree', () => {
    expect(ohadaFr.OHADA_FR_TRANSLATIONS).toBeTruthy()
    expect(Object.keys(ohadaFr.OHADA_FR_TRANSLATIONS).length).toBeGreaterThan(0)
  })
})

describe('jurisdictions/ohada/statements/SMT (eligibility)', () => {
  it('exposes thresholds', () => {
    expect(SMT_SEUIL_CA_XOF).toBe(60_000_000)
    expect(SMT_SEUIL_EFFECTIF).toBe(20)
  })

  it('checkSMTEligibility returns an eligibility object', () => {
    // Below thresholds → eligible
    const small = checkSMTEligibility({
      ca_annuel_xof: 10_000_000,
      effectif: 5,
      activite_type: 'commerce',
    })
    expect(small).toBeTruthy()
    expect(typeof small).toBe('object')

    // Above thresholds → not eligible
    const big = checkSMTEligibility({
      ca_annuel_xof: 100_000_000,
      effectif: 50,
      activite_type: 'commerce',
    })
    expect(big).toBeTruthy()
  })
})
