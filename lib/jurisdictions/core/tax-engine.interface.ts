import type { JurisdictionCode, VatRate } from './types'

export interface TaxEngine {
  readonly jurisdiction: JurisdictionCode

  // VAT operations
  getVatRates(): VatRate[]
  calculateVat(amount: number, vatCode: string): VatCalculation
  getVatReturn(periodStart: Date, periodEnd: Date, societeId: string): Promise<VatReturn>

  // Corporate income tax
  calculateCorporateIncomeTax(taxableIncome: number, fiscalYear: number): TaxCalculation

  // Withholding taxes
  calculateWithholdingTax(amount: number, beneficiaryType: string, country?: string): TaxCalculation

  // Declarations
  getRequiredDeclarations(periodStart: Date, periodEnd: Date): TaxDeclaration[]
}

export interface VatCalculation {
  netAmount: number
  vatAmount: number
  grossAmount: number
  vatRate: number
  vatCode: string
}

export interface TaxCalculation {
  baseAmount: number
  taxAmount: number
  effectiveRate: number
  breakdown: TaxBracket[]
}

export interface TaxBracket {
  from: number
  to: number | null
  rate: number
  amount: number
}

export interface VatReturn {
  periodStart: Date
  periodEnd: Date
  vatCollected: number
  vatDeductible: number
  vatToPay: number
  vatCredit: number
  details: VatReturnLine[]
}

export interface VatReturnLine {
  vatCode: string
  rate: number
  baseAmount: number
  vatAmount: number
  type: 'COLLECTED' | 'DEDUCTIBLE'
}

export interface TaxDeclaration {
  code: string
  label: string
  dueDate: Date
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
  required: boolean
}
