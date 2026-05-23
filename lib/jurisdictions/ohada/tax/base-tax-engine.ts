/**
 * Base tax engine for OHADA jurisdictions.
 * All per-country OHADA tax engines extend this class.
 *
 * OHADA covers 17 member states across UEMOA (XOF), CEMAC (XAF), and others.
 * Common fiscal obligations: TVA (VAT), IS (corporate income tax), IUTS/IRPP
 * (income tax withholding), and various withholding taxes on payments.
 */

import type {
  TaxEngine,
  VatCalculation,
  TaxCalculation,
  TaxBracket,
  VatReturn,
  VatReturnLine,
  TaxDeclaration,
} from '../../core/tax-engine.interface'
import type { JurisdictionCode, VatRate } from '../../core/types'

// ─── Configuration ───────────────────────────────────────────────────────────

export interface OhadaTaxConfig {
  jurisdiction: JurisdictionCode
  vatRates: VatRate[]
  corporateIncomeTaxRate: number
  withholdingTaxes: Array<{ code: string; rate: number; appliesTo: string[] }>
  /** IUTS / IRPP progressive brackets (monthly or annual income) */
  iuts?: { brackets: Array<{ from: number; to: number | null; rate: number }> }
  minimumCorporateTax?: { rate: number; minAmount: number }
}

// ─── Common OHADA declaration codes ─────────────────────────────────────────

/**
 * Standard recurring tax declarations required in all OHADA member states.
 * Country engines may extend or override this list.
 *
 * Due dates are set relative to a given period; the `dueDate` field here
 * acts as a placeholder (day-of-month / end-of-period semantics) and should
 * be recomputed by `getRequiredDeclarations()` with real calendar dates.
 */
export const OHADA_STANDARD_DECLARATIONS = [
  {
    code: 'TVA_M',
    label: 'Déclaration mensuelle de TVA',
    frequency: 'MONTHLY' as const,
    required: true,
  },
  {
    code: 'IS_A',
    label: "Impôt sur les Sociétés (déclaration annuelle)",
    frequency: 'ANNUAL' as const,
    required: true,
  },
  {
    code: 'IUTS_M',
    label: "Impôt Unique sur les Traitements et Salaires (mensuel)",
    frequency: 'MONTHLY' as const,
    required: true,
  },
  {
    code: 'RAS_M',
    label: 'Retenues à la source sur paiements (mensuel)',
    frequency: 'MONTHLY' as const,
    required: false,
  },
] as const

// ─── Utility: progressive tax calculation ────────────────────────────────────

/**
 * Compute a progressive (bracketed) tax on `income` using `brackets`.
 *
 * Each bracket specifies:
 *   - `from`  : lower bound (inclusive)
 *   - `to`    : upper bound (inclusive, null = no ceiling)
 *   - `rate`  : marginal rate as a decimal (e.g. 0.25 for 25 %)
 *   - `amount`: filled in by this function (tax in that slice)
 *
 * @example
 *   calculateProgressiveTax(1_500_000, iutsBrackets)
 *   // => { baseAmount: 1500000, taxAmount: 187500, effectiveRate: 0.125, breakdown: [...] }
 */
export function calculateProgressiveTax(
  income: number,
  brackets: Array<{ from: number; to: number | null; rate: number }>
): TaxCalculation {
  if (income <= 0) {
    return { baseAmount: 0, taxAmount: 0, effectiveRate: 0, breakdown: [] }
  }

  let totalTax = 0
  const breakdown: TaxBracket[] = []

  for (const bracket of brackets) {
    if (income <= bracket.from) break

    const sliceTop = bracket.to !== null ? Math.min(income, bracket.to) : income
    const slice = sliceTop - bracket.from
    const taxInSlice = slice * bracket.rate

    breakdown.push({
      from: bracket.from,
      to: bracket.to,
      rate: bracket.rate,
      amount: taxInSlice,
    })

    totalTax += taxInSlice
  }

  const effectiveRate = income > 0 ? totalTax / income : 0

  return {
    baseAmount: income,
    taxAmount: totalTax,
    effectiveRate,
    breakdown,
  }
}

// ─── Abstract base engine ─────────────────────────────────────────────────────

export abstract class BaseOhadaTaxEngine implements TaxEngine {
  protected config: OhadaTaxConfig

  constructor(config: OhadaTaxConfig) {
    this.config = config
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  abstract get jurisdiction(): JurisdictionCode

  // ── VAT ───────────────────────────────────────────────────────────────────

  getVatRates(): VatRate[] {
    return this.config.vatRates
  }

  /**
   * Calculate VAT for a given amount and VAT code.
   * `amount` is treated as the **tax-exclusive** (HT) base.
   */
  calculateVat(amount: number, vatCode: string): VatCalculation {
    const rate = this.getRateForVatCode(vatCode)
    const vatAmount = amount * rate
    const grossAmount = amount + vatAmount

    return {
      netAmount: amount,
      vatAmount,
      grossAmount,
      vatRate: rate,
      vatCode,
    }
  }

  /**
   * Real VAT return requires database access (journal entries, factures).
   * Implemented in the application layer; subclasses may override if they
   * bundle their own data source.
   */
  async getVatReturn(
    _periodStart: Date,
    _periodEnd: Date,
    _societeId: string
  ): Promise<VatReturn> {
    throw new Error(
      'getVatReturn must be implemented with DB access in the application layer'
    )
  }

  // ── Corporate income tax ──────────────────────────────────────────────────

  /**
   * Calculate IS (Impôt sur les Sociétés) for `taxableIncome`.
   *
   * Applies the flat corporate income tax rate configured for the jurisdiction.
   * If `minimumCorporateTax` is configured, the higher of (computed IS) and
   * (minimum corporate tax) is returned, as required by most OHADA states.
   */
  calculateCorporateIncomeTax(
    taxableIncome: number,
    _fiscalYear: number
  ): TaxCalculation {
    const grossTax = Math.max(0, taxableIncome) * this.config.corporateIncomeTaxRate

    let finalTax = grossTax

    if (this.config.minimumCorporateTax) {
      const { rate, minAmount } = this.config.minimumCorporateTax
      const minimumTax = Math.max(
        minAmount,
        Math.max(0, taxableIncome) * rate
      )
      finalTax = Math.max(grossTax, minimumTax)
    }

    const effectiveRate = taxableIncome > 0 ? finalTax / taxableIncome : 0

    return {
      baseAmount: taxableIncome,
      taxAmount: finalTax,
      effectiveRate,
      breakdown: [
        {
          from: 0,
          to: null,
          rate: this.config.corporateIncomeTaxRate,
          amount: finalTax,
        },
      ],
    }
  }

  // ── Withholding taxes ─────────────────────────────────────────────────────

  /**
   * Calculate withholding tax (retenue à la source) on a payment.
   *
   * Looks up the first WHT rule whose `appliesTo` list includes
   * `beneficiaryType`. Falls back to 0 % if no rule matches (no WHT).
   *
   * `country` is accepted for cross-border treaty override in subclasses.
   */
  calculateWithholdingTax(
    amount: number,
    beneficiaryType: string,
    _country?: string
  ): TaxCalculation {
    const rule = this.config.withholdingTaxes.find(wht =>
      wht.appliesTo.some(
        t => t.toLowerCase() === beneficiaryType.toLowerCase()
      )
    )

    const rate = rule?.rate ?? 0
    const taxAmount = amount * rate

    return {
      baseAmount: amount,
      taxAmount,
      effectiveRate: rate,
      breakdown: [
        {
          from: 0,
          to: null,
          rate,
          amount: taxAmount,
        },
      ],
    }
  }

  // ── Declarations ──────────────────────────────────────────────────────────

  /**
   * Return the list of required tax declarations for the given period.
   *
   * Generates concrete due dates based on the period:
   *   - Monthly declarations are due on the 15th of the following month.
   *   - The annual IS declaration is due 3 months after period end.
   *
   * Subclasses can call `super.getRequiredDeclarations()` and extend the result.
   */
  getRequiredDeclarations(
    periodStart: Date,
    periodEnd: Date
  ): TaxDeclaration[] {
    const declarations: TaxDeclaration[] = []

    for (const decl of OHADA_STANDARD_DECLARATIONS) {
      let dueDate: Date

      const freq = decl.frequency as TaxDeclaration['frequency']
      if (freq === 'MONTHLY' || freq === 'QUARTERLY') {
        // Monthly / quarterly: due on the 15th of the month following period end
        const d = new Date(periodEnd)
        d.setMonth(d.getMonth() + 1)
        d.setDate(15)
        dueDate = d
      } else {
        // ANNUAL: due 3 months after period end
        const d = new Date(periodEnd)
        d.setMonth(d.getMonth() + 3)
        dueDate = d
      }

      declarations.push({
        code: decl.code,
        label: decl.label,
        dueDate,
        frequency: decl.frequency,
        required: decl.required,
      })
    }

    return declarations
  }

  // ── Protected helpers ─────────────────────────────────────────────────────

  /**
   * Retrieve the decimal rate for a VAT code, throwing if not found.
   */
  protected getRateForVatCode(code: string): number {
    const rate = this.config.vatRates.find(r => r.code === code)
    if (!rate) {
      throw new Error(
        `Unknown VAT code "${code}" for jurisdiction ${this.config.jurisdiction}`
      )
    }
    return rate.rate
  }

  /**
   * Convenience: calculate IUTS / IRPP using the progressive brackets
   * defined in `config.iuts`, if present.
   */
  protected calculateIuts(grossSalary: number): TaxCalculation {
    if (!this.config.iuts) {
      throw new Error(
        `IUTS brackets not configured for jurisdiction ${this.config.jurisdiction}`
      )
    }
    return calculateProgressiveTax(grossSalary, this.config.iuts.brackets)
  }
}
