import type {
  Jurisdiction,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../../../core/jurisdiction.interface'
import type { JurisdictionConfig, Account, JournalEntry, FiscalPeriod } from '../../../core/types'
import type {
  FinancialStatementsProvider,
  StatementInput,
  BalanceSheet,
  IncomeStatement,
  CashFlowStatement,
  FinancialNotes,
} from '../../../core/financial-statements.interface'
import { ohadaChartOfAccounts } from '../../chart-of-accounts'
import { BaseOhadaTaxEngine } from '../../tax/base-tax-engine'
import { BaseOhadaPayrollEngine } from '../../payroll/base-payroll-engine'
import { CAMEROON_TAX_CONFIG } from './tax-config'
import { CAMEROON_PAYROLL_CONFIG } from './payroll-config'

class CameroonTaxEngine extends BaseOhadaTaxEngine {
  get jurisdiction() { return 'CM' as const }
}

class CameroonPayrollEngine extends BaseOhadaPayrollEngine {
  get jurisdiction() { return 'CM' as const }
}

/**
 * Stub FinancialStatementsProvider for Cameroon.
 *
 * Les générateurs SYSCOHADA (generateBilan, generateCompteDeResultat,
 * generateTAFIRE, generateNotesAnnexes) requièrent une dépendance
 * `getAccountBalances` / `NotesDataProviders` injectée au moment de
 * l'appel — la signature de `FinancialStatementsProvider` ne le permet
 * pas. Les consommateurs doivent appeler directement les fonctions
 * `lib/jurisdictions/ohada/statements/*` avec leurs data providers.
 */
class CameroonStatementsProvider implements FinancialStatementsProvider {
  readonly jurisdiction = 'CM' as const
  readonly system = 'NORMAL' as const

  async generateBalanceSheet(_input: StatementInput): Promise<BalanceSheet> {
    throw new Error('Use generateBilan(input, getAccountBalances) from lib/jurisdictions/ohada/statements/bilan')
  }

  async generateIncomeStatement(_input: StatementInput): Promise<IncomeStatement> {
    throw new Error('Use generateCompteDeResultat(input, getAccountBalances) from lib/jurisdictions/ohada/statements/compte-resultat')
  }

  async generateCashFlowStatement(_input: StatementInput): Promise<CashFlowStatement> {
    throw new Error('Use generateTAFIRE(input, getBalances, getPriorBalances) from lib/jurisdictions/ohada/statements/tafire')
  }

  async generateNotes(_input: StatementInput): Promise<FinancialNotes> {
    throw new Error('Use generateNotesAnnexes(input, dataProviders) from lib/jurisdictions/ohada/statements/notes-annexes')
  }
}

export class CameroonJurisdiction implements Jurisdiction {
  readonly config: JurisdictionConfig = {
    code: 'CM',
    name: 'Cameroon',
    nameFr: 'Cameroun',
    framework: 'SYSCOHADA',
    currency: 'XAF',
    fiscalYearStart: '01-01',
    fiscalYearEnd: '12-31',
    vatRates: CAMEROON_TAX_CONFIG.vatRates,
    corporateIncomeTaxRate: CAMEROON_TAX_CONFIG.corporateIncomeTaxRate,
    withholdingTaxes: CAMEROON_TAX_CONFIG.withholdingTaxes.map(wht => ({
      code: wht.code,
      label: wht.code,
      rate: wht.rate,
      appliesTo: wht.appliesTo,
    })),
    economicZone: 'CEMAC',
  }

  readonly chartOfAccounts = ohadaChartOfAccounts
  readonly taxEngine = new CameroonTaxEngine(CAMEROON_TAX_CONFIG)
  readonly payrollEngine = new CameroonPayrollEngine(CAMEROON_PAYROLL_CONFIG)
  readonly statementsProvider = new CameroonStatementsProvider()

  validateJournalEntry(entry: JournalEntry): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // R1: Double-entry validation
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      errors.push({ code: 'R1_UNBALANCED', message: `Débit (${totalDebit}) ≠ Crédit (${totalCredit})`, severity: 'ERROR' })
    }

    // Validate all account numbers exist in SYSCOHADA
    for (const line of entry.lines) {
      if (!this.chartOfAccounts.isValidAccountNumber(line.accountNumber)) {
        errors.push({ code: 'INVALID_ACCOUNT', message: `Compte invalide: ${line.accountNumber}`, field: 'accountNumber', severity: 'ERROR' })
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  getAccount(accountNumber: string): Account | undefined {
    return this.chartOfAccounts.getAccount(accountNumber)
  }

  getCurrentFiscalPeriod(asOf?: Date): FiscalPeriod {
    const now = asOf ?? new Date()
    const year = now.getFullYear()
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31),
      status: 'OPEN',
      jurisdictionCode: 'CM',
    }
  }

  isAccountReconcilable(accountNumber: string): boolean {
    const account = this.chartOfAccounts.getAccount(accountNumber)
    return account?.isReconcilable ?? false
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-CM', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(amount) + ' F CFA'
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('fr-CM').format(date)
  }
}

export const cameroonJurisdiction = new CameroonJurisdiction()