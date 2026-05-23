import type { Jurisdiction, ValidationResult } from '../core/jurisdiction.interface'
import type { JurisdictionConfig, Account, JournalEntry, FiscalPeriod, AccountClass } from '../core/types'
import type { ChartOfAccountsProvider, AccountingOperation } from '../core/chart-of-accounts.interface'
import type { TaxEngine, VatCalculation, TaxCalculation, VatReturn, TaxDeclaration } from '../core/tax-engine.interface'
import type { PayrollEngine, PayslipInput, Payslip, SocialContributionRates, IncomeTaxBracket, SeveranceInput, SeveranceCalculation } from '../core/payroll-engine.interface'
import type { FinancialStatementsProvider, StatementInput, BalanceSheet, IncomeStatement, CashFlowStatement, FinancialNotes } from '../core/financial-statements.interface'

// Minimal PCM chart of accounts (uses existing Mauritius accounting code by reference)
class MauritiusChartOfAccounts implements ChartOfAccountsProvider {
  jurisdiction = 'MU' as const
  framework = 'PCM'

  getClasses(): AccountClass[] {
    return [
      { number: 1, code: '1', label: 'Capital and reserves', labelFr: 'Capitaux et réserves', category: 'BALANCE_SHEET_EQUITY' },
      { number: 2, code: '2', label: 'Fixed assets', labelFr: 'Immobilisations', category: 'BALANCE_SHEET_ASSET' },
      { number: 3, code: '3', label: 'Inventory', labelFr: 'Stocks', category: 'BALANCE_SHEET_ASSET' },
      { number: 4, code: '4', label: 'Third parties', labelFr: 'Tiers', category: 'BALANCE_SHEET_ASSET' },
      { number: 5, code: '5', label: 'Financial', labelFr: 'Financier', category: 'BALANCE_SHEET_ASSET' },
      { number: 6, code: '6', label: 'Expenses', labelFr: 'Charges', category: 'INCOME_STATEMENT_EXPENSE' },
      { number: 7, code: '7', label: 'Revenue', labelFr: 'Produits', category: 'INCOME_STATEMENT_REVENUE' },
    ]
  }

  getAccountsByClass(_n: number): Account[] { return [] /* Defer to existing PCM code */ }
  getAccount(_num: string): Account | undefined { return undefined }
  searchAccounts(_q: string): Account[] { return [] }
  getAllAccounts(): Account[] { return [] }
  isValidAccountNumber(num: string): boolean { return /^[1-7]\d{2,5}$/.test(num) }

  getDefaultAccountFor(op: AccountingOperation): string | undefined {
    const map: Record<AccountingOperation, string> = {
      'CLIENT_RECEIVABLE': '411',
      'SUPPLIER_PAYABLE': '401',
      'BANK_MAIN': '512',
      'BANK_TRANSIT': '5800',
      'CASH': '531',
      'VAT_COLLECTED': '4443',
      'VAT_DEDUCTIBLE': '4452',
      'PAYROLL_NET': '4210',
      'PAYROLL_TAX': '4421',
      'SOCIAL_CONTRIBUTIONS': '4310',
      'CORPORATE_TAX': '4441',
      'SALES_REVENUE': '701',
      'SERVICE_REVENUE': '706',
      'PURCHASES': '601',
      'PERSONNEL_EXPENSES': '6200',
      'FX_GAIN': '7660',
      'FX_LOSS': '6660',
      'INTERCOMPANY_TRANSFER': '5800',
    }
    return map[op]
  }
}

// Stub tax engine - delegates to existing Mauritius MRA code
class MauritiusTaxEngine implements TaxEngine {
  jurisdiction = 'MU' as const

  getVatRates() {
    return [
      { code: 'STD', label: 'Standard 15%', rate: 0.15 },
      { code: 'RED', label: 'Reduced 8%', rate: 0.08 },
      { code: 'ZERO', label: 'Zero-rated', rate: 0 },
      { code: 'EXEMPT', label: 'Exempt', rate: 0 },
    ]
  }

  calculateVat(amount: number, vatCode: string): VatCalculation {
    const rate = this.getVatRates().find(r => r.code === vatCode)?.rate ?? 0
    return {
      netAmount: amount,
      vatAmount: amount * rate,
      grossAmount: amount * (1 + rate),
      vatRate: rate,
      vatCode,
    }
  }

  calculateCorporateIncomeTax(taxable: number, _fiscalYear: number): TaxCalculation {
    const rate = 0.15  // Mauritius standard rate
    return {
      baseAmount: taxable,
      taxAmount: taxable * rate,
      effectiveRate: rate,
      breakdown: [{ from: 0, to: null, rate, amount: taxable * rate }],
    }
  }

  calculateWithholdingTax(amount: number, _beneficiaryType: string, _country?: string): TaxCalculation {
    return {
      baseAmount: amount,
      taxAmount: 0,
      effectiveRate: 0,
      breakdown: [],
    }
  }

  async getVatReturn(_periodStart: Date, _periodEnd: Date, _societeId: string): Promise<VatReturn> {
    throw new Error('Mauritius VAT return: use existing MRA endpoints')
  }

  getRequiredDeclarations(_periodStart: Date, _periodEnd: Date): TaxDeclaration[] {
    return []  // Defer to existing MRA module
  }
}

// Stub payroll - delegates to existing /app/rh module
class MauritiusPayrollEngine implements PayrollEngine {
  jurisdiction = 'MU' as const

  calculatePayslip(_input: PayslipInput): Payslip {
    throw new Error('Mauritius payslip: use existing /app/rh module')
  }

  getSocialContributionRates(_asOf: Date): SocialContributionRates {
    return {
      cnss: { employee: 0.03, employer: 0.06 },   // CSG
      pension: { employee: 0.015, employer: 0.025 },  // NSF
    }
  }

  getIncomeTaxBrackets(_fiscalYear: number): IncomeTaxBracket[] {
    return [
      { from: 0, to: 390000, rate: 0 },
      { from: 390000, to: 700000, rate: 0.10 },
      { from: 700000, to: null, rate: 0.15 },
    ]
  }

  calculateSeverancePay(_input: SeveranceInput): SeveranceCalculation {
    throw new Error('Mauritius severance: use existing /app/rh/severance module')
  }

  getMinimumWage(_asOf: Date): number {
    return 16500  // Mauritius minimum wage MUR (2024)
  }
}

// Stub financial statements - delegates to existing Mauritius IFRS reports
class MauritiusStatementsProvider implements FinancialStatementsProvider {
  jurisdiction = 'MU' as const
  system = 'FULL_IFRS' as const

  async generateBalanceSheet(_input: StatementInput): Promise<BalanceSheet> {
    throw new Error('Use existing Mauritius IFRS reports')
  }

  async generateIncomeStatement(_input: StatementInput): Promise<IncomeStatement> {
    throw new Error('Use existing Mauritius IFRS reports')
  }

  async generateCashFlowStatement(_input: StatementInput): Promise<CashFlowStatement> {
    throw new Error('Use existing Mauritius IFRS reports')
  }

  async generateNotes(_input: StatementInput): Promise<FinancialNotes> {
    throw new Error('Use existing Mauritius IFRS reports')
  }
}

export class MauritiusJurisdiction implements Jurisdiction {
  readonly config: JurisdictionConfig = {
    code: 'MU',
    name: 'Mauritius',
    nameFr: 'Maurice',
    framework: 'PCM',
    currency: 'MUR',
    fiscalYearStart: '07-01',  // Mauritius fiscal year July-June
    fiscalYearEnd: '06-30',
    vatRates: [
      { code: 'STD', label: 'Standard 15%', rate: 0.15 },
      { code: 'RED', label: 'Reduced 8%', rate: 0.08 },
      { code: 'ZERO', label: 'Zero', rate: 0 },
    ],
    corporateIncomeTaxRate: 0.15,
    withholdingTaxes: [],
  }

  readonly chartOfAccounts = new MauritiusChartOfAccounts()
  readonly taxEngine = new MauritiusTaxEngine()
  readonly payrollEngine = new MauritiusPayrollEngine()
  readonly statementsProvider = new MauritiusStatementsProvider()

  validateJournalEntry(entry: JournalEntry): ValidationResult {
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)
    const errors: ValidationResult['errors'] = []
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      errors.push({ code: 'R1_UNBALANCED', message: `Debit (${totalDebit}) ≠ Credit (${totalCredit})`, severity: 'ERROR' })
    }
    return { valid: errors.length === 0, errors, warnings: [] }
  }

  getAccount(num: string): Account | undefined { return this.chartOfAccounts.getAccount(num) }

  getCurrentFiscalPeriod(asOf?: Date): FiscalPeriod {
    const d = asOf ?? new Date()
    const year = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
    return {
      start: new Date(year, 6, 1),        // July 1
      end: new Date(year + 1, 5, 30),     // June 30 next year
      status: 'OPEN',
      jurisdictionCode: 'MU',
    }
  }

  isAccountReconcilable(num: string): boolean {
    return ['411', '401', '512', '4210', '5800'].some(p => num.startsWith(p))
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-MU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + ' MUR'
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-MU').format(date)
  }
}

export const mauritiusJurisdiction = new MauritiusJurisdiction()
