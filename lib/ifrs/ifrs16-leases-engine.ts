/**
 * IFRS 16 Leases - Right-of-Use Asset & Lease Liability Engine
 */

export interface LeaseAgreement {
  leaseId: string
  description: string
  startDate: Date
  endDate: Date
  paymentAmount: number  // Per payment period
  paymentFrequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL'
  paymentTiming: 'IN_ADVANCE' | 'IN_ARREARS'
  discountRate: number  // Incremental Borrowing Rate (IBR), as decimal
  currency: string
  isIndexLinked: boolean
  indexRate?: number  // Annual index increase if indexed (CPI)
  initialDirectCosts: number
  restorationCosts: number  // Provision for dismantling/restoration
  prepayments: number
  incentivesReceived: number  // Lease incentives reduce RoU
  optionsToRenew?: {
    additionalYears: number
    reasonablyCertain: boolean
  }
  optionsToTerminate?: {
    earliestDate: Date
    reasonablyCertain: boolean
  }
}

export interface LeasePayment {
  date: Date
  paymentNumber: number
  contractualPayment: number
  interestPortion: number
  principalPortion: number
  openingLiability: number
  closingLiability: number
}

export interface IFRS16Calculation {
  leaseId: string
  initialMeasurement: {
    pvOfLeasePayments: number
    rouAsset: number  // RoU = PV + IDC + restoration + prepayments - incentives
    leaseLiability: number  // = PV
  }
  leaseTerm: {
    months: number
    paymentsCount: number
  }
  schedule: LeasePayment[]
  amortization: {
    method: 'STRAIGHT_LINE'
    annualDepreciation: number
    accumulatedDepreciation: number  // As at calculation date
    rouNetBookValue: number
  }
  totalCost: {
    totalPayments: number
    totalInterest: number
    totalDepreciation: number
  }
  remeasurements?: LeaseRemeasurement[]
}

export interface LeaseRemeasurement {
  date: Date
  reason: 'INDEX_CHANGE' | 'TERM_CHANGE' | 'ASSESSMENT_CHANGE' | 'MODIFICATION'
  oldLiability: number
  newLiability: number
  oldRou: number
  newRou: number
  pnlImpact: number
}

const PAYMENTS_PER_YEAR: Record<LeaseAgreement['paymentFrequency'], number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMI_ANNUAL: 2,
  ANNUAL: 1,
}

/**
 * Calculate Present Value of lease payments using effective interest method.
 */
function calculatePV(
  payment: number,
  numPayments: number,
  ratePerPeriod: number,
  timing: 'IN_ADVANCE' | 'IN_ARREARS'
): number {
  if (ratePerPeriod === 0) return payment * numPayments

  // PV of annuity formula
  let pv = payment * (1 - Math.pow(1 + ratePerPeriod, -numPayments)) / ratePerPeriod

  // Adjust for advance payments
  if (timing === 'IN_ADVANCE') {
    pv = pv * (1 + ratePerPeriod)
  }

  return pv
}

/**
 * Generate the full amortization schedule for a lease.
 */
function generateSchedule(
  lease: LeaseAgreement,
  initialLiability: number,
  ratePerPeriod: number,
  numPayments: number
): LeasePayment[] {
  const schedule: LeasePayment[] = []
  let openingLiability = initialLiability

  const periodsPerYear = PAYMENTS_PER_YEAR[lease.paymentFrequency]
  const monthsBetweenPayments = 12 / periodsPerYear

  for (let i = 0; i < numPayments; i++) {
    const paymentDate = new Date(lease.startDate)
    paymentDate.setMonth(paymentDate.getMonth() + i * monthsBetweenPayments)

    // Apply indexation if applicable
    let currentPayment = lease.paymentAmount
    if (lease.isIndexLinked && lease.indexRate) {
      const yearsFromStart = (i * monthsBetweenPayments) / 12
      currentPayment = lease.paymentAmount * Math.pow(1 + lease.indexRate, Math.floor(yearsFromStart))
    }

    let interestPortion = 0
    let principalPortion = currentPayment

    if (lease.paymentTiming === 'IN_ARREARS') {
      interestPortion = openingLiability * ratePerPeriod
      principalPortion = currentPayment - interestPortion
    } else {
      // In advance: principal paid first, then interest accrues on remaining
      principalPortion = currentPayment
      const afterPaymentBalance = openingLiability - currentPayment
      interestPortion = afterPaymentBalance * ratePerPeriod
    }

    const closingLiability = openingLiability - principalPortion +
      (lease.paymentTiming === 'IN_ARREARS' ? 0 : interestPortion)

    schedule.push({
      date: paymentDate,
      paymentNumber: i + 1,
      contractualPayment: currentPayment,
      interestPortion: Math.max(0, interestPortion),
      principalPortion,
      openingLiability,
      closingLiability: Math.max(0, closingLiability),
    })

    openingLiability = Math.max(0, closingLiability)
  }

  return schedule
}

/**
 * Calculate initial IFRS 16 measurement and amortization schedule.
 */
export function calculateIFRS16(lease: LeaseAgreement, asOfDate?: Date): IFRS16Calculation {
  const periodsPerYear = PAYMENTS_PER_YEAR[lease.paymentFrequency]
  const ratePerPeriod = lease.discountRate / periodsPerYear

  // Lease term (months)
  let termMonths = Math.round(
    (lease.endDate.getTime() - lease.startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  )

  // Include renewal options if reasonably certain
  if (lease.optionsToRenew?.reasonablyCertain) {
    termMonths += lease.optionsToRenew.additionalYears * 12
  }

  const numPayments = Math.ceil(termMonths / (12 / periodsPerYear))

  // Initial liability = PV of lease payments
  const pv = calculatePV(lease.paymentAmount, numPayments, ratePerPeriod, lease.paymentTiming)

  // RoU Asset = PV + IDC + Restoration - Incentives + Prepayments
  const rouAsset = pv
    + lease.initialDirectCosts
    + lease.restorationCosts
    - lease.incentivesReceived
    + lease.prepayments

  // Amortization (straight-line over lease term)
  const annualDepreciation = rouAsset / (termMonths / 12)

  // Calculate accumulated depreciation
  const now = asOfDate ?? new Date()
  const monthsElapsed = Math.max(0,
    (now.getTime() - lease.startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  )
  const accumulatedDepreciation = Math.min(rouAsset, (annualDepreciation / 12) * monthsElapsed)
  const rouNetBookValue = rouAsset - accumulatedDepreciation

  // Generate schedule
  const schedule = generateSchedule(lease, pv, ratePerPeriod, numPayments)

  // Totals
  const totalPayments = schedule.reduce((s, p) => s + p.contractualPayment, 0)
  const totalInterest = schedule.reduce((s, p) => s + p.interestPortion, 0)

  return {
    leaseId: lease.leaseId,
    initialMeasurement: {
      pvOfLeasePayments: pv,
      rouAsset,
      leaseLiability: pv,
    },
    leaseTerm: {
      months: termMonths,
      paymentsCount: numPayments,
    },
    schedule,
    amortization: {
      method: 'STRAIGHT_LINE',
      annualDepreciation,
      accumulatedDepreciation,
      rouNetBookValue,
    },
    totalCost: {
      totalPayments,
      totalInterest,
      totalDepreciation: rouAsset,
    },
  }
}

/**
 * Generate IFRS 16 journal entries for a specific period.
 */
export interface IFRS16JournalEntries {
  initialRecognition: Array<{ account: string; debit: number; credit: number; description: string }>
  monthlyEntries: Array<{ account: string; debit: number; credit: number; description: string }>
}

export function generateIFRS16Entries(calc: IFRS16Calculation): IFRS16JournalEntries {
  const monthlyDepreciation = calc.amortization.annualDepreciation / 12
  const firstPayment = calc.schedule[0]

  return {
    initialRecognition: [
      { account: '2152', debit: calc.initialMeasurement.rouAsset, credit: 0, description: 'Right-of-Use Asset' },
      { account: '167', debit: 0, credit: calc.initialMeasurement.leaseLiability, description: 'Lease Liability' },
    ],
    monthlyEntries: [
      // Depreciation
      { account: '6812', debit: monthlyDepreciation, credit: 0, description: 'Depreciation of RoU asset' },
      { account: '28152', debit: 0, credit: monthlyDepreciation, description: 'Accumulated depreciation RoU' },
      // Interest expense
      { account: '671', debit: firstPayment?.interestPortion ?? 0, credit: 0, description: 'Interest on lease liability' },
      // Lease payment
      { account: '167', debit: firstPayment?.principalPortion ?? 0, credit: 0, description: 'Reduction of lease liability' },
      { account: '512', debit: 0, credit: firstPayment?.contractualPayment ?? 0, description: 'Lease payment' },
    ],
  }
}
