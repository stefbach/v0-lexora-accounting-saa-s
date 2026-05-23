import type { JurisdictionCode, AccountingSystem } from './types'

export interface FinancialStatementsProvider {
  readonly jurisdiction: JurisdictionCode
  readonly system: AccountingSystem

  generateBalanceSheet(input: StatementInput): Promise<BalanceSheet>
  generateIncomeStatement(input: StatementInput): Promise<IncomeStatement>
  generateCashFlowStatement(input: StatementInput): Promise<CashFlowStatement>
  generateTAFIRE?(input: StatementInput): Promise<TAFIRE>
  generateNotes(input: StatementInput): Promise<FinancialNotes>
}

export interface StatementInput {
  societeId: string
  periodStart: Date
  periodEnd: Date
  comparativePeriodStart?: Date
  comparativePeriodEnd?: Date
  currency?: string
}

export interface BalanceSheet {
  periodEnd: Date
  comparative?: Date
  assets: BalanceSheetSection
  liabilities: BalanceSheetSection
  equity: BalanceSheetSection
  totalAssets: number
  totalLiabilitiesAndEquity: number
  balanced: boolean
}

export interface BalanceSheetSection {
  label: string
  total: number
  comparativeTotal?: number
  groups: BalanceSheetGroup[]
}

export interface BalanceSheetGroup {
  code: string
  label: string
  amount: number
  comparativeAmount?: number
  lines: BalanceSheetLine[]
}

export interface BalanceSheetLine {
  accountCode: string
  label: string
  amount: number
  comparativeAmount?: number
}

export interface IncomeStatement {
  periodStart: Date
  periodEnd: Date
  revenue: number
  expenses: number
  operatingIncome: number
  financialIncome: number
  financialExpenses: number
  exceptionalItems: number
  incomeBeforeTax: number
  incomeTax: number
  netIncome: number
  lines: IncomeStatementLine[]
}

export interface IncomeStatementLine {
  code: string
  label: string
  amount: number
  comparativeAmount?: number
  type: 'REVENUE' | 'EXPENSE' | 'SUBTOTAL' | 'TOTAL'
}

export interface CashFlowStatement {
  periodStart: Date
  periodEnd: Date
  operatingCashFlow: number
  investingCashFlow: number
  financingCashFlow: number
  netChange: number
  beginningCash: number
  endingCash: number
}

/** Tableau Financier des Ressources et des Emplois - OHADA specific */
export interface TAFIRE {
  periodStart: Date
  periodEnd: Date
  capacityForSelfFinancing: number
  workingCapitalChange: number
  freeCashFlow: number
  investmentActivities: TAFIRELine[]
  financingActivities: TAFIRELine[]
  netVariationOfTreasury: number
}

export interface TAFIRELine {
  code: string
  label: string
  resources: number
  uses: number
  netVariation: number
}

export interface FinancialNotes {
  noteCount: number
  notes: FinancialNote[]
}

export interface FinancialNote {
  number: number
  title: string
  content: string
  tables?: Array<Record<string, unknown>>
}
