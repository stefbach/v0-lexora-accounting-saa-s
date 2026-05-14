/**
 * IFRS 16 Leases — helpers TypeScript.
 *
 * IFRS 16 §22-28 : reconnaissance Right-of-Use (RoU) + Lease Liability.
 * Exemptions §5 : leases ≤ 12 mois (short-term) ou actifs < USD 5,000 (low-value).
 */

export type AssetCategory = 'property' | 'vehicle' | 'equipment' | 'it' | 'other'
export type PaymentFrequency = 'monthly' | 'quarterly' | 'annual'

export const LOW_VALUE_THRESHOLD_USD = 5_000
export const SHORT_TERM_THRESHOLD_MONTHS = 12

/**
 * Présente la valeur actuelle d'un lease à l'inception.
 * PV = PMT × [1 − (1+r)^−n] / r
 */
export function computeLeasePresentValue(opts: {
  monthlyPayment: number
  termMonths: number
  annualRatePct: number
  paymentInAdvance?: boolean
}): number {
  if (opts.annualRatePct === 0) return opts.monthlyPayment * opts.termMonths
  const r = opts.annualRatePct / 100 / 12
  let pv = opts.monthlyPayment * (1 - Math.pow(1 + r, -opts.termMonths)) / r
  if (opts.paymentInAdvance ?? true) pv = pv * (1 + r)
  return Math.round(pv * 100) / 100
}

/** Vérifie si un lease bénéficie d'une exemption IFRS 16 §5 */
export function qualifiesForExemption(opts: {
  termMonths: number
  assetValueUsd?: number
}): { shortTerm: boolean; lowValue: boolean } {
  return {
    shortTerm: opts.termMonths <= SHORT_TERM_THRESHOLD_MONTHS,
    lowValue: (opts.assetValueUsd ?? 0) < LOW_VALUE_THRESHOLD_USD,
  }
}

/** Calcule un échéancier complet (amortization schedule) */
export type ScheduleEntry = {
  periodNumber: number
  periodDate: Date
  paymentAmount: number
  interestAmount: number
  principalAmount: number
  liabilityBalance: number
}

export function generateAmortizationSchedule(opts: {
  monthlyPayment: number
  termMonths: number
  annualRatePct: number
  commencementDate: Date
  initialLiability?: number
}): ScheduleEntry[] {
  const initialLiab = opts.initialLiability ?? computeLeasePresentValue({
    monthlyPayment: opts.monthlyPayment,
    termMonths: opts.termMonths,
    annualRatePct: opts.annualRatePct,
    paymentInAdvance: true,
  })
  const r = opts.annualRatePct / 100 / 12
  let balance = initialLiab
  const schedule: ScheduleEntry[] = []

  for (let i = 1; i <= opts.termMonths; i++) {
    const interest = Math.round(balance * r * 100) / 100
    const principal = Math.round((opts.monthlyPayment - interest) * 100) / 100
    balance = Math.max(0, balance - principal)
    const date = new Date(opts.commencementDate)
    date.setMonth(date.getMonth() + i - 1)
    schedule.push({
      periodNumber: i, periodDate: date,
      paymentAmount: opts.monthlyPayment,
      interestAmount: interest, principalAmount: principal,
      liabilityBalance: Math.round(balance * 100) / 100,
    })
  }
  return schedule
}

/**
 * Génère les écritures comptables d'un paiement de lease selon IFRS 16.
 * Doit être appelée à chaque période :
 *   Débit 1751/1752 (lease liability) du montant principal
 *   Débit 6611 (intérêts lease) du montant intérêts
 *   Crédit 512 (banque) du montant total
 * + à part : Débit 6811 (amort RoU), Crédit 28151 (cumul amort) pour amort du RoU.
 */
export function buildLeasePaymentEntries(opts: {
  periodEntry: ScheduleEntry
  totalLeaseTermMonths: number
  rouInitialValue: number
}): Array<{ compte: string; debit_mur: number; credit_mur: number; description: string }> {
  const { periodEntry } = opts
  const monthlyAmort = Math.round((opts.rouInitialValue / opts.totalLeaseTermMonths) * 100) / 100
  return [
    // Paiement
    { compte: '1752', debit_mur: periodEntry.principalAmount, credit_mur: 0,
      description: `Lease — remboursement principal période ${periodEntry.periodNumber}` },
    { compte: '6611', debit_mur: periodEntry.interestAmount, credit_mur: 0,
      description: `Lease — charges d'intérêts période ${periodEntry.periodNumber}` },
    { compte: '512',  debit_mur: 0, credit_mur: periodEntry.paymentAmount,
      description: `Lease — paiement période ${periodEntry.periodNumber}` },
    // Amortissement RoU
    { compte: '6811',  debit_mur: monthlyAmort, credit_mur: 0,
      description: `Amortissement droit d'utilisation période ${periodEntry.periodNumber}` },
    { compte: '28151', debit_mur: 0, credit_mur: monthlyAmort,
      description: `Amortissement cumulé RoU période ${periodEntry.periodNumber}` },
  ]
}
