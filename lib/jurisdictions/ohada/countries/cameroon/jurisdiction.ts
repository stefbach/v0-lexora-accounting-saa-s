// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import type { Jurisdiction, ValidationResult } from '../../../core/jurisdiction.interface'
import type { JurisdictionConfig, Account, JournalEntry, FiscalPeriod } from '../../../core/types'
import type { StatementInput, CashFlowStatement } from '../../../core/financial-statements.interface'
import { ohadaChartOfAccounts } from '../../chart-of-accounts'
import { BaseOhadaTaxEngine } from '../../tax/base-tax-engine'
import { BaseOhadaPayrollEngine } from '../../payroll/base-payroll-engine'
import { CAMEROON_TAX_CONFIG } from './tax-config'
import { CAMEROON_PAYROLL_CONFIG } from './payroll-config'
import { generateBilan } from '../../statements/bilan'
import { generateCompteDeResultat } from '../../statements/compte-resultat'
import { generateTAFIRE } from '../../statements/tafire'
import { generateNotesAnnexes } from '../../statements/notes-annexes'

class CameroonTaxEngine extends BaseOhadaTaxEngine {
  get jurisdiction() { return 'CM' as const }
}

class CameroonPayrollEngine extends BaseOhadaPayrollEngine {
  get jurisdiction() { return 'CM' as const }
}

class CameroonStatementsProvider {
  readonly jurisdiction = 'CM' as const
  readonly system = 'NORMAL' as const

  generateBalanceSheet = generateBilan
  generateIncomeStatement = generateCompteDeResultat
  generateTAFIRE = generateTAFIRE
  generateNotes = generateNotesAnnexes

  /**
   * Maps TAFIRE (OHADA cash-flow statement) to the generic CashFlowStatement interface.
   * The TAFIRE is the SYSCOHADA equivalent of IAS 7 cash flow statement.
   */
  async generateCashFlowStatement(input: StatementInput): Promise<CashFlowStatement> {
    const tafire = await generateTAFIRE(input)
    return {
      periodStart: tafire.periodStart,
      periodEnd: tafire.periodEnd,
      operatingCashFlow: tafire.capacityForSelfFinancing,
      investingCashFlow: tafire.investmentActivities.reduce((s, l) => s + l.netVariation, 0),
      financingCashFlow: tafire.financingActivities.reduce((s, l) => s + l.netVariation, 0),
      netChange: tafire.netVariationOfTreasury,
      beginningCash: 0,
      endingCash: tafire.netVariationOfTreasury,
    }
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
    const errors: any[] = []
    const warnings: any[] = []

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