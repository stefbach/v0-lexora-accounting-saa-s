import type { Account, AccountClass, JurisdictionCode } from './types'

export interface ChartOfAccountsProvider {
  readonly jurisdiction: JurisdictionCode | 'OHADA'
  readonly framework: string

  getClasses(): AccountClass[]
  getAccountsByClass(classNumber: number): Account[]
  getAccount(accountNumber: string): Account | undefined
  searchAccounts(query: string): Account[]
  getAllAccounts(): Account[]
  isValidAccountNumber(accountNumber: string): boolean
  getDefaultAccountFor(operation: AccountingOperation): string | undefined
}

export type AccountingOperation =
  | 'CLIENT_RECEIVABLE'
  | 'SUPPLIER_PAYABLE'
  | 'BANK_MAIN'
  | 'BANK_TRANSIT'
  | 'CASH'
  | 'VAT_COLLECTED'
  | 'VAT_DEDUCTIBLE'
  | 'PAYROLL_NET'
  | 'PAYROLL_TAX'
  | 'SOCIAL_CONTRIBUTIONS'
  | 'CORPORATE_TAX'
  | 'SALES_REVENUE'
  | 'SERVICE_REVENUE'
  | 'PURCHASES'
  | 'PERSONNEL_EXPENSES'
  | 'FX_GAIN'
  | 'FX_LOSS'
  | 'INTERCOMPANY_TRANSFER'
