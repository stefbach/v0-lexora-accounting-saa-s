/**
 * BaseOhadaPayrollEngine
 *
 * Abstract base class for all OHADA-zone country payroll engines.
 * Implements the generic OHADA payroll logic (CNSS, IUTS/IRPP, indemnité de licenciement)
 * and delegates country-specific configurations via OhadaPayrollConfig.
 *
 * Countries covered: SN, CI, ML, BF, NE, BJ, TG, GW (UEMOA/XOF)
 *                    CM, GA, CG, TD, CF, GQ (CEMAC/XAF)
 *                    KM, CD, GN (OHADA autres)
 */

import type {
  PayrollEngine,
  PayslipInput,
  Payslip,
  ContributionBreakdown,
  SocialContributionRates,
  IncomeTaxBracket,
  SeveranceInput,
  SeveranceCalculation,
} from '../../core/payroll-engine.interface'

import type { JurisdictionCode } from '../../core/types'

// ---------------------------------------------------------------------------
// Configuration interface
// ---------------------------------------------------------------------------

export interface OhadaPayrollConfig {
  jurisdiction: JurisdictionCode

  /** CNSS (Caisse Nationale de Sécurité Sociale) rates */
  cnss: {
    employeeRate: number
    employerRate: number
    /** Plafond mensuel en monnaie locale (XOF / XAF).  Undefined = no cap. */
    cap?: number
  }

  /** Caisse de retraite complémentaire / IPRES / CIPRES */
  pensionFund?: {
    employeeRate: number
    employerRate: number
    cap?: number
  }

  /** Prestations familiales — employeur uniquement */
  familyAllowances?: {
    rate: number // Employer only
    cap?: number
  }

  /** Accident du travail / maladie professionnelle — taux variable selon secteur */
  workAccident?: {
    rate: number
  }

  /** Formation professionnelle / FDFP / FNE */
  professionalTraining?: {
    rate: number
  }

  /** Barème IUTS (UEMOA) ou IRPP (CEMAC) */
  incomeTaxBrackets: IncomeTaxBracket[]

  /** Règles de calcul du revenu imposable */
  taxableIncomeRules: {
    /** Abattement forfaitaire sur salaire brut (ex. 0.30 = 30 %) */
    abatementSalaire: number
    /** Réduction par personne à charge (montant fixe en monnaie locale) */
    chargeDeFamilleAllowance: number
    /** Nombre maximum de personnes à charge déductibles */
    maxDependents: number
  }

  /** SMIG mensuel en monnaie locale */
  minimumWage: number
}

// ---------------------------------------------------------------------------
// Abstract base class
// ---------------------------------------------------------------------------

export abstract class BaseOhadaPayrollEngine implements PayrollEngine {
  protected config: OhadaPayrollConfig

  constructor(config: OhadaPayrollConfig) {
    this.config = config
  }

  // ---------------------------------------------------------------------------
  // Abstract accessor — each country engine declares its own jurisdiction code
  // ---------------------------------------------------------------------------

  abstract get jurisdiction(): JurisdictionCode

  // ---------------------------------------------------------------------------
  // calculatePayslip
  // ---------------------------------------------------------------------------

  calculatePayslip(input: PayslipInput): Payslip {
    // ------------------------------------------------------------------
    // 1. Salaire brut total (fixe + avantages en nature + primes + heures sup)
    // ------------------------------------------------------------------
    const overtimePay =
      input.overtimeHours > 0 && input.hourlyRate != null
        ? input.overtimeHours * input.hourlyRate * 1.5 // majoration 50 % par défaut
        : 0

    const grossSalary = input.grossSalary + input.benefits + input.bonuses + overtimePay

    // ------------------------------------------------------------------
    // 2. Cotisations salariales (CNSS, retraite complémentaire)
    // ------------------------------------------------------------------
    const employeeContribs = this.calculateEmployeeContributions(grossSalary)
    const totalEmployeeContribs = employeeContribs.reduce((sum, c) => sum + c.amount, 0)

    // ------------------------------------------------------------------
    // 3. Revenu net imposable
    //    = (brut − cotisations salariales)
    //      × (1 − abattement forfaitaire)
    //      − réduction personnes à charge
    // ------------------------------------------------------------------
    const taxableGross = grossSalary - totalEmployeeContribs
    const cappedDependents = Math.min(
      input.familyDependents,
      this.config.taxableIncomeRules.maxDependents
    )
    const familyAbatement =
      cappedDependents * this.config.taxableIncomeRules.chargeDeFamilleAllowance

    const netTaxableIncome = Math.max(
      0,
      taxableGross * (1 - this.config.taxableIncomeRules.abatementSalaire) - familyAbatement
    )

    // ------------------------------------------------------------------
    // 4. IUTS / IRPP (impôt progressif par tranches)
    // ------------------------------------------------------------------
    const incomeTax = this.calculateIncomeTaxFromBrackets(netTaxableIncome)

    // ------------------------------------------------------------------
    // 5. Cotisations patronales (CNSS, PF, AT, FP, retraite complémentaire)
    // ------------------------------------------------------------------
    const employerContribs = this.calculateEmployerContributions(grossSalary)
    const totalEmployerContribs = employerContribs.reduce((sum, c) => sum + c.amount, 0)

    // ------------------------------------------------------------------
    // 6. Salaire net à payer
    // ------------------------------------------------------------------
    const totalEmployeeDeductions = totalEmployeeContribs + incomeTax
    const netSalary = grossSalary - totalEmployeeDeductions

    // ------------------------------------------------------------------
    // 7. Coût total employeur
    // ------------------------------------------------------------------
    const totalEmployerCost = grossSalary + totalEmployerContribs

    return {
      grossSalary,
      taxableGross,
      employeeContributions: employeeContribs,
      employerContributions: employerContribs,
      incomeTax,
      netTaxableIncome,
      netSalary,
      totalEmployerCost,
    }
  }

  // ---------------------------------------------------------------------------
  // Cotisations salariales
  // ---------------------------------------------------------------------------

  protected calculateEmployeeContributions(gross: number): ContributionBreakdown[] {
    const contribs: ContributionBreakdown[] = []

    // --- CNSS part salariale ---
    if (this.config.cnss) {
      const base = this.config.cnss.cap != null ? Math.min(gross, this.config.cnss.cap) : gross
      contribs.push({
        code: 'CNSS_SAL',
        label: 'CNSS (salarié)',
        base,
        rate: this.config.cnss.employeeRate,
        amount: this.roundCfa(base * this.config.cnss.employeeRate),
        cap: this.config.cnss.cap,
      })
    }

    // --- Caisse de retraite complémentaire / IPRES / CIPRES ---
    if (this.config.pensionFund) {
      const base =
        this.config.pensionFund.cap != null
          ? Math.min(gross, this.config.pensionFund.cap)
          : gross
      contribs.push({
        code: 'PENSION_SAL',
        label: 'Retraite complémentaire (salarié)',
        base,
        rate: this.config.pensionFund.employeeRate,
        amount: this.roundCfa(base * this.config.pensionFund.employeeRate),
        cap: this.config.pensionFund.cap,
      })
    }

    return contribs
  }

  // ---------------------------------------------------------------------------
  // Cotisations patronales
  // ---------------------------------------------------------------------------

  protected calculateEmployerContributions(gross: number): ContributionBreakdown[] {
    const contribs: ContributionBreakdown[] = []

    // --- CNSS part patronale ---
    if (this.config.cnss) {
      const base = this.config.cnss.cap != null ? Math.min(gross, this.config.cnss.cap) : gross
      contribs.push({
        code: 'CNSS_PAT',
        label: 'CNSS (employeur)',
        base,
        rate: this.config.cnss.employerRate,
        amount: this.roundCfa(base * this.config.cnss.employerRate),
        cap: this.config.cnss.cap,
      })
    }

    // --- Retraite complémentaire part patronale ---
    if (this.config.pensionFund) {
      const base =
        this.config.pensionFund.cap != null
          ? Math.min(gross, this.config.pensionFund.cap)
          : gross
      contribs.push({
        code: 'PENSION_PAT',
        label: 'Retraite complémentaire (employeur)',
        base,
        rate: this.config.pensionFund.employerRate,
        amount: this.roundCfa(base * this.config.pensionFund.employerRate),
        cap: this.config.pensionFund.cap,
      })
    }

    // --- Prestations familiales ---
    if (this.config.familyAllowances) {
      const base =
        this.config.familyAllowances.cap != null
          ? Math.min(gross, this.config.familyAllowances.cap)
          : gross
      contribs.push({
        code: 'PF_PAT',
        label: 'Prestations familiales (employeur)',
        base,
        rate: this.config.familyAllowances.rate,
        amount: this.roundCfa(base * this.config.familyAllowances.rate),
        cap: this.config.familyAllowances.cap,
      })
    }

    // --- Accident du travail / maladie professionnelle ---
    if (this.config.workAccident) {
      contribs.push({
        code: 'AT_PAT',
        label: 'Accident du travail / maladie professionnelle (employeur)',
        base: gross,
        rate: this.config.workAccident.rate,
        amount: this.roundCfa(gross * this.config.workAccident.rate),
      })
    }

    // --- Formation professionnelle ---
    if (this.config.professionalTraining) {
      contribs.push({
        code: 'FP_PAT',
        label: 'Formation professionnelle (employeur)',
        base: gross,
        rate: this.config.professionalTraining.rate,
        amount: this.roundCfa(gross * this.config.professionalTraining.rate),
      })
    }

    return contribs
  }

  // ---------------------------------------------------------------------------
  // Calcul progressif de l'impôt par tranches (IUTS / IRPP)
  // ---------------------------------------------------------------------------

  protected calculateIncomeTaxFromBrackets(taxableIncome: number): number {
    if (taxableIncome <= 0) return 0

    let tax = 0

    for (const bracket of this.config.incomeTaxBrackets) {
      if (taxableIncome <= bracket.from) break

      const upperBound = bracket.to !== null ? bracket.to : Infinity
      const taxableInBracket = Math.min(taxableIncome, upperBound) - bracket.from
      if (taxableInBracket <= 0) continue

      tax += taxableInBracket * bracket.rate
    }

    return this.roundCfa(tax)
  }

  // ---------------------------------------------------------------------------
  // Taux de cotisations sociales (pour affichage / export)
  // ---------------------------------------------------------------------------

  getSocialContributionRates(_asOf: Date): SocialContributionRates {
    return {
      cnss: {
        employee: this.config.cnss.employeeRate,
        employer: this.config.cnss.employerRate,
        cap: this.config.cnss.cap,
      },
      pension: this.config.pensionFund
        ? {
            employee: this.config.pensionFund.employeeRate,
            employer: this.config.pensionFund.employerRate,
            cap: this.config.pensionFund.cap,
          }
        : undefined,
      familyAllowances: this.config.familyAllowances
        ? {
            rate: this.config.familyAllowances.rate,
            cap: this.config.familyAllowances.cap,
          }
        : undefined,
      workAccident: this.config.workAccident
        ? { rate: this.config.workAccident.rate }
        : undefined,
      professionalTraining: this.config.professionalTraining
        ? { rate: this.config.professionalTraining.rate }
        : undefined,
    }
  }

  // ---------------------------------------------------------------------------
  // Barème d'imposition
  // ---------------------------------------------------------------------------

  getIncomeTaxBrackets(_fiscalYear: number): IncomeTaxBracket[] {
    return this.config.incomeTaxBrackets
  }

  // ---------------------------------------------------------------------------
  // SMIG
  // ---------------------------------------------------------------------------

  getMinimumWage(_asOf: Date): number {
    return this.config.minimumWage
  }

  // ---------------------------------------------------------------------------
  // Indemnité de licenciement — règle générique OHADA
  //
  // Barème standard OHADA (art. 73 Code du Travail OHADA) :
  //   ≤ 5 ans  → 30 % du salaire mensuel brut × années
  //   6–10 ans → 35 % du salaire mensuel brut × années
  //   > 10 ans → 40 % du salaire mensuel brut × années
  //
  // Les moteurs pays peuvent surcharger cette méthode pour appliquer le droit
  // national (ex. Sénégal : art. L 119 Code du Travail / CI : art. 77 CT).
  // ---------------------------------------------------------------------------

  calculateSeverancePay(input: SeveranceInput): SeveranceCalculation {
    const { monthlyGrossSalary, yearsOfService, reasonForTermination } = input
    const years = Math.max(0, yearsOfService)

    // Taux applicable selon l'ancienneté
    let percentage: number
    if (years <= 5) {
      percentage = 0.30
    } else if (years <= 10) {
      percentage = 0.35
    } else {
      percentage = 0.40
    }

    const totalAmount = this.roundCfa(monthlyGrossSalary * percentage * years)

    // Régime fiscal : licenciement économique → exonéré d'IRPP/IUTS
    const isEconomic = reasonForTermination === 'ECONOMIC'
    const taxableAmount = isEconomic ? 0 : totalAmount
    const exemptAmount = isEconomic ? totalAmount : 0

    return {
      totalAmount,
      basis: monthlyGrossSalary,
      yearsConsidered: years,
      formula: `${(percentage * 100).toFixed(0)} % × ${monthlyGrossSalary.toLocaleString('fr-FR')} × ${years} an(s)`,
      taxableAmount,
      exemptAmount,
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Arrondi à l'entier le plus proche (XOF / XAF n'ont pas de décimales).
   * Les moteurs pays avec décimales (MUR, KMF, GNF …) peuvent surcharger.
   */
  protected roundCfa(amount: number): number {
    return Math.round(amount)
  }
}
