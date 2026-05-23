/**
 * Main interface that every jurisdiction must implement.
 * This is the contract for the multi-jurisdiction accounting system.
 */

import type {
  JurisdictionConfig,
  Account,
  JournalEntry,
  FiscalPeriod,
} from './types'

import type { ChartOfAccountsProvider } from './chart-of-accounts.interface'
import type { TaxEngine } from './tax-engine.interface'
import type { PayrollEngine } from './payroll-engine.interface'
import type { FinancialStatementsProvider } from './financial-statements.interface'

export interface Jurisdiction {
  readonly config: JurisdictionConfig
  readonly chartOfAccounts: ChartOfAccountsProvider
  readonly taxEngine: TaxEngine
  readonly payrollEngine: PayrollEngine
  readonly statementsProvider: FinancialStatementsProvider

  validateJournalEntry(entry: JournalEntry): ValidationResult
  getAccount(accountNumber: string): Account | undefined
  getCurrentFiscalPeriod(asOf?: Date): FiscalPeriod
  isAccountReconcilable(accountNumber: string): boolean
  formatAmount(amount: number): string
  formatDate(date: Date): string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  code: string
  message: string
  field?: string
  severity: 'ERROR'
}

export interface ValidationWarning {
  code: string
  message: string
  field?: string
  severity: 'WARNING'
}
