/**
 * IvoryCoastJurisdiction — Côte d'Ivoire
 *
 * Implements the Jurisdiction interface for the Republic of Côte d'Ivoire.
 * Member of OHADA and UEMOA (currency: XOF).
 * Accounting framework: SYSCOHADA (Système Comptable OHADA révisé).
 */

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
import { IVORY_COAST_TAX_CONFIG } from './tax-config'
import { IVORY_COAST_PAYROLL_CONFIG } from './payroll-config'

class IvoryCoastTaxEngine extends BaseOhadaTaxEngine {
  get jurisdiction() { return 'CI' as const }
}

class IvoryCoastPayrollEngine extends BaseOhadaPayrollEngine {
  get jurisdiction() { return 'CI' as const }
}

/**
 * Stub FinancialStatementsProvider for Côte d'Ivoire.
 *
 * Les générateurs SYSCOHADA requièrent une dépendance `getAccountBalances`
 * injectée au moment de l'appel — la signature de
 * `FinancialStatementsProvider` ne le permet pas. Les consommateurs
 * doivent appeler directement les fonctions
 * `lib/jurisdictions/ohada/statements/*` avec leurs data providers.
 */
class IvoryCoastStatementsProvider implements FinancialStatementsProvider {
  readonly jurisdiction = 'CI' as const
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

export class IvoryCoastJurisdiction implements Jurisdiction {
  readonly config: JurisdictionConfig = {
    code: 'CI',
    name: 'Ivory Coast',
    nameFr: "Côte d'Ivoire",
    framework: 'SYSCOHADA',
    currency: 'XOF',
    fiscalYearStart: '01-01',
    fiscalYearEnd: '12-31',
    vatRates: IVORY_COAST_TAX_CONFIG.vatRates,
    corporateIncomeTaxRate: IVORY_COAST_TAX_CONFIG.corporateIncomeTaxRate,
    withholdingTaxes: IVORY_COAST_TAX_CONFIG.withholdingTaxes.map(wht => ({
      code: wht.code,
      label: wht.code,
      rate: wht.rate,
      appliesTo: wht.appliesTo,
    })),
    economicZone: 'UEMOA',
  }

  readonly chartOfAccounts = ohadaChartOfAccounts
  readonly taxEngine = new IvoryCoastTaxEngine(IVORY_COAST_TAX_CONFIG)
  readonly payrollEngine = new IvoryCoastPayrollEngine(IVORY_COAST_PAYROLL_CONFIG)
  readonly statementsProvider = new IvoryCoastStatementsProvider()

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
      jurisdictionCode: 'CI',
    }
  }

  isAccountReconcilable(accountNumber: string): boolean {
    const account = this.chartOfAccounts.getAccount(accountNumber)
    return account?.isReconcilable ?? false
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-CI', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(amount) + ' F CFA'
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('fr-CI').format(date)
  }
}

export const ivoryCoastJurisdiction = new IvoryCoastJurisdiction()