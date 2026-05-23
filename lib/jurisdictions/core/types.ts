/**
 * Core types for the multi-jurisdiction accounting system.
 * Used by all jurisdiction implementations (Mauritius, OHADA, etc.)
 */

export type JurisdictionCode =
  | 'MU'  // Mauritius
  // OHADA UEMOA (Franc CFA Ouest XOF)
  | 'SN' | 'CI' | 'ML' | 'BF' | 'NE' | 'BJ' | 'TG' | 'GW'
  // OHADA CEMAC (Franc CFA Centre XAF)
  | 'CM' | 'GA' | 'CG' | 'TD' | 'CF' | 'GQ'
  // OHADA autres
  | 'KM' | 'CD' | 'GN'

export type CurrencyCode =
  | 'MUR' | 'XOF' | 'XAF' | 'KMF' | 'CDF' | 'GNF'
  | 'EUR' | 'USD' | 'GBP'

export type AccountingFramework =
  | 'PCM'        // Plan Comptable Mauricien
  | 'SYSCOHADA'  // Système Comptable OHADA (AUDCIF)
  | 'IFRS'       // International Financial Reporting Standards
  | 'IFRS_SME'   // IFRS for SMEs

export type AccountingSystem =
  | 'NORMAL'     // Système Normal SYSCOHADA
  | 'MINIMAL'    // Système Minimal de Trésorerie (SMT)
  | 'FULL_IFRS'

export interface JurisdictionConfig {
  code: JurisdictionCode
  name: string
  nameFr: string
  framework: AccountingFramework
  currency: CurrencyCode
  fiscalYearStart: string  // MM-DD format e.g. "01-01"
  fiscalYearEnd: string    // MM-DD format e.g. "12-31"
  vatRates: VatRate[]
  corporateIncomeTaxRate: number  // Decimal e.g. 0.30 for 30%
  withholdingTaxes: WithholdingTax[]
  economicZone?: 'UEMOA' | 'CEMAC' | 'COMESA' | 'EAC' | 'SADC' | 'OHADA'
}

export interface VatRate {
  code: string
  label: string
  rate: number  // Decimal e.g. 0.18 for 18%
  description?: string
}

export interface WithholdingTax {
  code: string
  label: string
  rate: number
  appliesTo: string[]
}

export interface AccountClass {
  number: number  // 1-9 for SYSCOHADA, 1-7 for PCM
  code: string
  label: string
  labelFr: string
  description?: string
  category: AccountCategory
}

export type AccountCategory =
  | 'BALANCE_SHEET_ASSET'
  | 'BALANCE_SHEET_LIABILITY'
  | 'BALANCE_SHEET_EQUITY'
  | 'INCOME_STATEMENT_EXPENSE'
  | 'INCOME_STATEMENT_REVENUE'
  | 'OFF_BALANCE'
  | 'ANALYTICAL'  // Class 9 SYSCOHADA

export interface Account {
  number: string  // Account number (e.g. "411" or "6011")
  label?: string
  labelFr: string
  classNumber: number
  category: AccountCategory
  isAuxiliary: boolean  // True for tiers (clients, fournisseurs)
  normalBalance: 'DEBIT' | 'CREDIT'
  isReconcilable: boolean  // True if account supports lettrage
  taxCode?: string
  parentAccount?: string
  jurisdiction: JurisdictionCode | 'OHADA' | 'COMMON'
}

export interface JournalEntry {
  id?: string
  date: Date
  reference: string
  description: string
  lines: JournalLine[]
  journalCode: string  // VTE, ACH, BNQ, SAL, OD
  jurisdictionCode: JurisdictionCode
  societeId: string
  createdBy?: string
  approvedBy?: string
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'POSTED' | 'REVERSED'
}

export interface JournalLine {
  accountNumber: string
  debit: number
  credit: number
  description?: string
  auxiliaryAccount?: string  // Tiers reference
  analyticalCode?: string    // Class 9 SYSCOHADA
  taxCode?: string
  reconciliationCode?: string  // For lettrage
}

export interface FiscalPeriod {
  start: Date
  end: Date
  status: 'OPEN' | 'CLOSING' | 'CLOSED' | 'ARCHIVED'
  jurisdictionCode: JurisdictionCode
}
