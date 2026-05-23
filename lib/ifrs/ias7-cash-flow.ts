/**
 * IAS 7 Statement of Cash Flows
 * Supports both direct and indirect methods.
 */

export interface CashFlowStatement {
  period: { start: Date; end: Date }
  method: 'DIRECT' | 'INDIRECT'
  operatingActivities: CashFlowSection
  investingActivities: CashFlowSection
  financingActivities: CashFlowSection
  netChange: number
  beginningCash: number
  endingCash: number
  effectOfFXChanges: number
  reconciliation: boolean
}

export interface CashFlowSection {
  total: number
  lines: CashFlowLine[]
}

export interface CashFlowLine {
  code: string
  label: string
  amount: number
}

export interface IndirectMethodInputs {
  netIncome: number
  depreciation: number
  amortization: number
  impairmentLoss: number
  gainOnSale: number
  fxLoss: number

  // Working capital changes
  changeInReceivables: number  // (+) = increase = use of cash
  changeInInventory: number
  changeInPayables: number  // (+) = increase = source of cash
  changeInAccruals: number
  changeInProvisions: number

  interestPaid: number
  taxesPaid: number
}

export interface InvestingActivities {
  ppePurchases: number
  ppeSales: number
  intangiblesPurchases: number
  investmentPurchases: number
  investmentSales: number
  loansGranted: number
  interestReceived: number
  dividendsReceived: number
}

export interface FinancingActivities {
  proceedsFromBorrowings: number
  repaymentOfBorrowings: number
  proceedsFromShareIssuance: number
  shareRepurchases: number
  dividendsPaid: number
  leasePayments: number  // IFRS 16 lease principal
}

/**
 * Generate cash flow statement using indirect method.
 */
export function generateCashFlowIndirect(
  period: { start: Date; end: Date },
  operating: IndirectMethodInputs,
  investing: InvestingActivities,
  financing: FinancingActivities,
  beginningCash: number,
  endingCash: number,
  fxEffect: number = 0
): CashFlowStatement {
  // Operating activities (indirect method)
  const operatingLines: CashFlowLine[] = [
    { code: 'OP1', label: 'Net Income', amount: operating.netIncome },
    { code: 'OP2', label: 'Depreciation', amount: operating.depreciation },
    { code: 'OP3', label: 'Amortization', amount: operating.amortization },
    { code: 'OP4', label: 'Impairment loss', amount: operating.impairmentLoss },
    { code: 'OP5', label: 'Gain on sale', amount: -operating.gainOnSale },
    { code: 'OP6', label: 'FX loss', amount: operating.fxLoss },
    { code: 'OP7', label: 'Change in receivables', amount: -operating.changeInReceivables },
    { code: 'OP8', label: 'Change in inventory', amount: -operating.changeInInventory },
    { code: 'OP9', label: 'Change in payables', amount: operating.changeInPayables },
    { code: 'OP10', label: 'Change in accruals', amount: operating.changeInAccruals },
    { code: 'OP11', label: 'Change in provisions', amount: operating.changeInProvisions },
    { code: 'OP12', label: 'Interest paid', amount: -operating.interestPaid },
    { code: 'OP13', label: 'Taxes paid', amount: -operating.taxesPaid },
  ]

  const operatingTotal = operatingLines.reduce((s, l) => s + l.amount, 0)

  // Investing activities
  const investingLines: CashFlowLine[] = [
    { code: 'INV1', label: 'PP&E purchases', amount: -investing.ppePurchases },
    { code: 'INV2', label: 'PP&E sales', amount: investing.ppeSales },
    { code: 'INV3', label: 'Intangibles purchases', amount: -investing.intangiblesPurchases },
    { code: 'INV4', label: 'Investment purchases', amount: -investing.investmentPurchases },
    { code: 'INV5', label: 'Investment sales', amount: investing.investmentSales },
    { code: 'INV6', label: 'Loans granted', amount: -investing.loansGranted },
    { code: 'INV7', label: 'Interest received', amount: investing.interestReceived },
    { code: 'INV8', label: 'Dividends received', amount: investing.dividendsReceived },
  ]

  const investingTotal = investingLines.reduce((s, l) => s + l.amount, 0)

  // Financing activities
  const financingLines: CashFlowLine[] = [
    { code: 'FIN1', label: 'Proceeds from borrowings', amount: financing.proceedsFromBorrowings },
    { code: 'FIN2', label: 'Repayment of borrowings', amount: -financing.repaymentOfBorrowings },
    { code: 'FIN3', label: 'Share issuance', amount: financing.proceedsFromShareIssuance },
    { code: 'FIN4', label: 'Share repurchases', amount: -financing.shareRepurchases },
    { code: 'FIN5', label: 'Dividends paid', amount: -financing.dividendsPaid },
    { code: 'FIN6', label: 'Lease payments (IFRS 16)', amount: -financing.leasePayments },
  ]

  const financingTotal = financingLines.reduce((s, l) => s + l.amount, 0)

  const netChange = operatingTotal + investingTotal + financingTotal

  // Reconciliation check
  const reconciliation = Math.abs((endingCash - beginningCash - fxEffect) - netChange) < 1

  return {
    period,
    method: 'INDIRECT',
    operatingActivities: { total: operatingTotal, lines: operatingLines },
    investingActivities: { total: investingTotal, lines: investingLines },
    financingActivities: { total: financingTotal, lines: financingLines },
    netChange,
    beginningCash,
    endingCash,
    effectOfFXChanges: fxEffect,
    reconciliation,
  }
}
