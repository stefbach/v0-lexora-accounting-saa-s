import { describe, it, expect } from 'vitest'
import {
  classifyAccount,
  getTranslationRate,
  translateToMUR,
  isMultiCurrencyEntity,
  buildMultiCurrencyEcriture,
} from './functional-currency'

describe('classifyAccount — IAS 21 §23', () => {
  it('classe les comptes de trésorerie (5x) en monétaire', () => {
    expect(classifyAccount('512')).toBe('monetary')
    expect(classifyAccount('531')).toBe('monetary')
    expect(classifyAccount('58')).toBe('monetary')
  })

  it('classe les créances clients (411) en monétaire', () => {
    expect(classifyAccount('411')).toBe('monetary')
    expect(classifyAccount('41120')).toBe('monetary')
  })

  it('classe les dettes fournisseurs (401), fiscales (44), sociales (43) en monétaire', () => {
    expect(classifyAccount('401')).toBe('monetary')
    expect(classifyAccount('4330')).toBe('monetary')
    expect(classifyAccount('4471')).toBe('monetary')
  })

  it('classe les emprunts (16, 17) et CCA (46) en monétaire', () => {
    expect(classifyAccount('164')).toBe('monetary')
    expect(classifyAccount('17')).toBe('monetary')
    expect(classifyAccount('455')).toBe('monetary')
  })

  it('classe les immobilisations (2x) en non monétaire', () => {
    expect(classifyAccount('215')).toBe('non_monetary')
    expect(classifyAccount('281')).toBe('non_monetary')
  })

  it('classe les stocks (3x) en non monétaire', () => {
    expect(classifyAccount('31')).toBe('non_monetary')
    expect(classifyAccount('370')).toBe('non_monetary')
  })

  it('classe les capitaux propres (1x) en equity', () => {
    expect(classifyAccount('101')).toBe('equity')
    expect(classifyAccount('1061')).toBe('equity')
    expect(classifyAccount('12')).toBe('equity')
  })

  it('classe le compte 1078 (CTA) en equity_cta (cas spécial)', () => {
    expect(classifyAccount('1078')).toBe('equity_cta')
  })

  it('classe les charges (6x) et produits (7x) en P&L', () => {
    expect(classifyAccount('6411')).toBe('pnl')
    expect(classifyAccount('706')).toBe('pnl')
    expect(classifyAccount('66')).toBe('pnl')
  })

  it('retourne other pour compte vide / inconnu', () => {
    expect(classifyAccount('')).toBe('other')
    expect(classifyAccount('9999')).toBe('other')
  })
})

describe('getTranslationRate — IAS 21 §23', () => {
  const rates = {
    closing: 47.5,                // USD/MUR au 30/06/2026
    historical: { '215': 42.0, '101': 38.0 },  // taux d'acquisition
    average: 46.0,                // taux moyen période pour P&L
  }

  it('applique le closing rate aux items monétaires', () => {
    expect(getTranslationRate('512', rates)).toBe(47.5)
    expect(getTranslationRate('411', rates)).toBe(47.5)
    expect(getTranslationRate('401', rates)).toBe(47.5)
  })

  it('applique le taux historique aux non-monétaires (si dispo)', () => {
    expect(getTranslationRate('215', rates)).toBe(42.0)
  })

  it('fallback closing rate si pas de taux historique pour le compte', () => {
    expect(getTranslationRate('216', rates)).toBe(47.5)  // pas dans historical
  })

  it('applique le taux moyen aux items P&L', () => {
    expect(getTranslationRate('6411', rates)).toBe(46.0)
    expect(getTranslationRate('706', rates)).toBe(46.0)
  })

  it('applique le taux historique aux capitaux propres', () => {
    expect(getTranslationRate('101', rates)).toBe(38.0)
  })

  it('retourne 1 pour le CTA (1078) — pas re-translaté', () => {
    expect(getTranslationRate('1078', rates)).toBe(1)
  })
})

describe('translateToMUR', () => {
  const rates = { closing: 47.5, average: 46.0, historical: { '215': 42.0 } }

  it('translate un montant USD en MUR avec arrondi 2 décimales', () => {
    const r = translateToMUR(1000, '512', rates)
    expect(r.amount_mur).toBe(47500)
    expect(r.rate_used).toBe(47.5)
    expect(r.classification).toBe('monetary')
  })

  it('utilise le taux historique pour une immobilisation', () => {
    const r = translateToMUR(50000, '215', rates)
    expect(r.amount_mur).toBe(2100000)
    expect(r.rate_used).toBe(42.0)
    expect(r.classification).toBe('non_monetary')
  })

  it('utilise le taux moyen pour une charge P&L', () => {
    const r = translateToMUR(2500, '6411', rates)
    expect(r.amount_mur).toBe(115000)
    expect(r.rate_used).toBe(46.0)
    expect(r.classification).toBe('pnl')
  })
})

describe('isMultiCurrencyEntity', () => {
  it('retourne false pour MUR / null / undefined', () => {
    expect(isMultiCurrencyEntity('MUR')).toBe(false)
    expect(isMultiCurrencyEntity(null)).toBe(false)
    expect(isMultiCurrencyEntity(undefined)).toBe(false)
  })

  it('retourne true pour USD, EUR, GBP, etc.', () => {
    expect(isMultiCurrencyEntity('USD')).toBe(true)
    expect(isMultiCurrencyEntity('EUR')).toBe(true)
    expect(isMultiCurrencyEntity('GBP')).toBe(true)
  })

  it('est case-insensitive', () => {
    expect(isMultiCurrencyEntity('usd')).toBe(true)
    expect(isMultiCurrencyEntity('mur')).toBe(false)
  })
})

describe('buildMultiCurrencyEcriture', () => {
  const rates = { closing: 47.5, average: 46.0 }

  it('construit une écriture débit avec translation MUR', () => {
    const e = buildMultiCurrencyEcriture(
      { numero_compte: '512', debit_fonctionnelle: 1000 },
      rates, 'USD',
    )
    expect(e.debit_fonctionnelle).toBe(1000)
    expect(e.credit_fonctionnelle).toBe(0)
    expect(e.debit_mur).toBe(47500)
    expect(e.credit_mur).toBe(0)
    expect(e.devise_origine).toBe('USD')
    expect(e.taux_fonct_vers_mur).toBe(47.5)
  })

  it('construit une écriture crédit P&L avec taux moyen', () => {
    const e = buildMultiCurrencyEcriture(
      { numero_compte: '706', credit_fonctionnelle: 5000 },
      rates, 'USD',
    )
    expect(e.credit_fonctionnelle).toBe(5000)
    expect(e.credit_mur).toBe(230000)  // 5000 × 46 (taux moyen P&L)
    expect(e.taux_fonct_vers_mur).toBe(46.0)
  })

  it('utilise devise_origine explicite si fournie (≠ fonctionnelle)', () => {
    const e = buildMultiCurrencyEcriture(
      { numero_compte: '512', debit_fonctionnelle: 850, devise_origine: 'EUR' },
      rates, 'USD',
    )
    expect(e.devise_origine).toBe('EUR')
  })
})
