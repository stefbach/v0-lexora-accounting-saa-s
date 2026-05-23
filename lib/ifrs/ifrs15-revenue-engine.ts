/**
 * IFRS 15 Revenue Recognition - 5-step model
 * Step 1: Identify the contract
 * Step 2: Identify performance obligations
 * Step 3: Determine transaction price
 * Step 4: Allocate price to obligations
 * Step 5: Recognize revenue when obligations satisfied
 */

export interface Contract {
  contractId: string
  customerId: string
  startDate: Date
  endDate?: Date
  totalConsideration: number
  currency: string
  variableConsideration?: VariableConsideration
  performanceObligations: PerformanceObligation[]
  financingComponent?: number  // Significant financing component
}

export interface PerformanceObligation {
  obligationId: string
  description: string
  type: 'POINT_IN_TIME' | 'OVER_TIME'
  standalonePrice: number
  allocatedPrice?: number  // Computed in Step 4
  satisfactionMethod?: 'OUTPUT' | 'INPUT' | 'PROGRESS'  // For OVER_TIME
  expectedSatisfactionDate?: Date
  progressMeasurement?: {
    measureType: 'OUTPUT' | 'INPUT' | 'COST_TO_COST' | 'TIME_ELAPSED'
    percentComplete: number  // 0-1
  }
  isSatisfied: boolean
  satisfactionDate?: Date
}

export interface VariableConsideration {
  type: 'DISCOUNT' | 'REBATE' | 'REFUND' | 'BONUS' | 'PENALTY'
  estimatedAmount: number
  probability: number  // For most-likely-amount or expected-value method
  method: 'EXPECTED_VALUE' | 'MOST_LIKELY_AMOUNT'
  constraintApplied: boolean  // True if highly probable threshold not met
}

export interface RevenueRecognitionResult {
  contractId: string
  step1_contractValid: boolean
  step2_obligationsIdentified: number
  step3_transactionPrice: number
  step4_allocations: Array<{
    obligationId: string
    standalonePrice: number
    allocationRatio: number
    allocatedPrice: number
  }>
  step5_revenueRecognized: number
  unsatisfiedObligations: PerformanceObligation[]
  satisfiedObligations: PerformanceObligation[]
  contractAsset: number  // Revenue earned not yet billed
  contractLiability: number  // Cash received in advance
  refundLiability: number  // For variable consideration
}

/**
 * Step 1: Verify the contract meets IFRS 15 criteria.
 */
function validateContract(contract: Contract): { valid: boolean; reason?: string } {
  if (!contract.customerId) return { valid: false, reason: 'No customer identified' }
  if (!contract.totalConsideration || contract.totalConsideration <= 0) {
    return { valid: false, reason: 'No consideration agreed' }
  }
  if (!contract.performanceObligations || contract.performanceObligations.length === 0) {
    return { valid: false, reason: 'No performance obligations identified' }
  }
  return { valid: true }
}

/**
 * Step 3: Determine transaction price (with variable consideration & financing).
 */
function determineTransactionPrice(contract: Contract): number {
  let price = contract.totalConsideration

  // Adjust for variable consideration (constrained)
  if (contract.variableConsideration) {
    const vc = contract.variableConsideration
    if (!vc.constraintApplied) {
      if (vc.method === 'EXPECTED_VALUE') {
        price += vc.estimatedAmount * vc.probability
      } else {
        // Most likely amount (if probability > 50%, recognize it)
        if (vc.probability > 0.5) {
          price += vc.estimatedAmount
        }
      }
    }
  }

  // Adjust for significant financing component
  if (contract.financingComponent) {
    price -= contract.financingComponent
  }

  return price
}

/**
 * Step 4: Allocate transaction price to performance obligations based on standalone prices.
 */
function allocatePrice(
  obligations: PerformanceObligation[],
  transactionPrice: number
) {
  const totalStandalone = obligations.reduce((sum, o) => sum + o.standalonePrice, 0)

  if (totalStandalone === 0) {
    // Equal allocation if no standalone prices
    return obligations.map(o => ({
      obligationId: o.obligationId,
      standalonePrice: o.standalonePrice,
      allocationRatio: 1 / obligations.length,
      allocatedPrice: transactionPrice / obligations.length,
    }))
  }

  return obligations.map(o => {
    const ratio = o.standalonePrice / totalStandalone
    return {
      obligationId: o.obligationId,
      standalonePrice: o.standalonePrice,
      allocationRatio: ratio,
      allocatedPrice: transactionPrice * ratio,
    }
  })
}

/**
 * Step 5: Calculate revenue recognized based on obligation satisfaction.
 */
function calculateRevenueRecognized(
  obligations: PerformanceObligation[],
  allocations: ReturnType<typeof allocatePrice>
): number {
  return obligations.reduce((sum, obligation) => {
    const alloc = allocations.find(a => a.obligationId === obligation.obligationId)
    if (!alloc) return sum

    if (obligation.type === 'POINT_IN_TIME') {
      // Recognize fully when satisfied
      return sum + (obligation.isSatisfied ? alloc.allocatedPrice : 0)
    } else {
      // Recognize over time based on progress
      const progress = obligation.progressMeasurement?.percentComplete ?? 0
      return sum + alloc.allocatedPrice * progress
    }
  }, 0)
}

/**
 * Apply the full 5-step IFRS 15 model to a contract.
 */
export function applyIFRS15(contract: Contract): RevenueRecognitionResult {
  // Step 1: Validate
  const validation = validateContract(contract)

  // Step 2: Already done - obligations are provided
  const obligationsCount = contract.performanceObligations.length

  // Step 3: Transaction price
  const transactionPrice = determineTransactionPrice(contract)

  // Step 4: Allocate
  const allocations = allocatePrice(contract.performanceObligations, transactionPrice)

  // Step 5: Recognize revenue
  const revenueRecognized = calculateRevenueRecognized(contract.performanceObligations, allocations)

  // Calculate contract assets/liabilities
  const satisfiedRevenue = revenueRecognized
  const cashReceived = transactionPrice  // Simplified - in reality from payment data

  let contractAsset = 0
  let contractLiability = 0
  if (satisfiedRevenue > cashReceived) {
    contractAsset = satisfiedRevenue - cashReceived
  } else {
    contractLiability = cashReceived - satisfiedRevenue
  }

  // Refund liability for variable consideration
  const refundLiability = contract.variableConsideration?.constraintApplied
    ? contract.variableConsideration.estimatedAmount
    : 0

  return {
    contractId: contract.contractId,
    step1_contractValid: validation.valid,
    step2_obligationsIdentified: obligationsCount,
    step3_transactionPrice: transactionPrice,
    step4_allocations: allocations,
    step5_revenueRecognized: revenueRecognized,
    unsatisfiedObligations: contract.performanceObligations.filter(o => !o.isSatisfied),
    satisfiedObligations: contract.performanceObligations.filter(o => o.isSatisfied),
    contractAsset,
    contractLiability,
    refundLiability,
  }
}

/**
 * Generate journal entries for revenue recognition.
 */
export function generateIFRS15Entries(result: RevenueRecognitionResult, isSale: boolean = true) {
  const entries = []

  if (result.step5_revenueRecognized > 0) {
    if (isSale) {
      entries.push(
        { account: '411', debit: result.step5_revenueRecognized, credit: 0, description: 'Customer receivable' },
        { account: '701', debit: 0, credit: result.step5_revenueRecognized, description: 'Revenue recognized' },
      )
    } else {
      entries.push(
        { account: '4181', debit: result.step5_revenueRecognized, credit: 0, description: 'Contract asset' },
        { account: '706', debit: 0, credit: result.step5_revenueRecognized, description: 'Service revenue' },
      )
    }
  }

  if (result.contractLiability > 0) {
    entries.push(
      { account: '512', debit: result.contractLiability, credit: 0, description: 'Cash received in advance' },
      { account: '419', debit: 0, credit: result.contractLiability, description: 'Contract liability (deferred revenue)' },
    )
  }

  if (result.refundLiability > 0) {
    entries.push(
      { account: '658', debit: result.refundLiability, credit: 0, description: 'Variable consideration expense' },
      { account: '4191', debit: 0, credit: result.refundLiability, description: 'Refund liability' },
    )
  }

  return entries
}
