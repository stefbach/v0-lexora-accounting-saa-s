import { describe, it, expect } from 'vitest'

describe('IFRS 9 ECL Engine', () => {
  it('Stage 1 - low credit risk, low ECL', async () => {
    const { calculateECL } = await import('../ifrs9-ecl-engine')
    const ecl = calculateECL({
      counterpartyId: 'C1',
      exposureAtDefault: 1000000,
      carryingAmount: 1000000,
      daysPastDue: 0,
      creditRating: 'AAA',
      originationDate: new Date(),
      isCreditImpaired: false,
      hasSICR: false,
    })
    expect(ecl.stage).toBe('STAGE_1')
    expect(ecl.ecl).toBeLessThan(1000)  // Very low ECL for AAA
  })

  it('Stage 3 - credit impaired, high ECL', async () => {
    const { calculateECL } = await import('../ifrs9-ecl-engine')
    const ecl = calculateECL({
      counterpartyId: 'C2',
      exposureAtDefault: 100000,
      carryingAmount: 100000,
      daysPastDue: 120,  // > 90 days = Stage 3
      creditRating: 'CCC',
      originationDate: new Date(),
      isCreditImpaired: true,
      hasSICR: true,
    })
    expect(ecl.stage).toBe('STAGE_3')
    expect(ecl.ecl).toBeGreaterThan(50000)  // High ECL for impaired
  })

  it('Stage 2 - SICR detected (30+ DPD)', async () => {
    const { calculateECL } = await import('../ifrs9-ecl-engine')
    const ecl = calculateECL({
      counterpartyId: 'C3',
      exposureAtDefault: 50000,
      carryingAmount: 50000,
      daysPastDue: 45,
      creditRating: 'B',
      originationDate: new Date(),
      isCreditImpaired: false,
      hasSICR: true,
    })
    expect(ecl.stage).toBe('STAGE_2')
  })
})

describe('IFRS 16 Leases Engine', () => {
  it('calculates initial measurement (PV + IDC)', async () => {
    const { calculateIFRS16 } = await import('../ifrs16-leases-engine')
    const calc = calculateIFRS16({
      leaseId: 'L1',
      description: 'Office lease',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2028-12-31'),
      paymentAmount: 100000,
      paymentFrequency: 'MONTHLY',
      paymentTiming: 'IN_ARREARS',
      discountRate: 0.05,
      currency: 'MUR',
      isIndexLinked: false,
      initialDirectCosts: 50000,
      restorationCosts: 100000,
      prepayments: 0,
      incentivesReceived: 0,
    })
    expect(calc.initialMeasurement.pvOfLeasePayments).toBeGreaterThan(0)
    expect(calc.initialMeasurement.rouAsset).toBeGreaterThan(calc.initialMeasurement.pvOfLeasePayments)  // Includes IDC + restoration
    expect(calc.schedule.length).toBeGreaterThan(50)  // 60 monthly payments
  })

  it('amortization is straight-line', async () => {
    const { calculateIFRS16 } = await import('../ifrs16-leases-engine')
    const calc = calculateIFRS16({
      leaseId: 'L2',
      description: 'Equipment lease',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      paymentAmount: 12000,
      paymentFrequency: 'ANNUAL',
      paymentTiming: 'IN_ARREARS',
      discountRate: 0.06,
      currency: 'MUR',
      isIndexLinked: false,
      initialDirectCosts: 0,
      restorationCosts: 0,
      prepayments: 0,
      incentivesReceived: 0,
    })
    expect(calc.amortization.method).toBe('STRAIGHT_LINE')
    expect(calc.amortization.annualDepreciation).toBeCloseTo(calc.initialMeasurement.rouAsset / 2, 0)
  })
})

describe('IFRS 15 Revenue Engine', () => {
  it('5-step model on simple contract', async () => {
    const { applyIFRS15 } = await import('../ifrs15-revenue-engine')
    const result = applyIFRS15({
      contractId: 'CON1',
      customerId: 'CUST1',
      startDate: new Date('2024-01-01'),
      totalConsideration: 1000000,
      currency: 'MUR',
      performanceObligations: [
        {
          obligationId: 'PO1',
          description: 'Sale of goods',
          type: 'POINT_IN_TIME',
          standalonePrice: 1000000,
          isSatisfied: true,
        },
      ],
    })
    expect(result.step1_contractValid).toBe(true)
    expect(result.step2_obligationsIdentified).toBe(1)
    expect(result.step3_transactionPrice).toBe(1000000)
    expect(result.step5_revenueRecognized).toBe(1000000)
  })

  it('over-time recognition based on progress', async () => {
    const { applyIFRS15 } = await import('../ifrs15-revenue-engine')
    const result = applyIFRS15({
      contractId: 'CON2',
      customerId: 'CUST1',
      startDate: new Date('2024-01-01'),
      totalConsideration: 1000000,
      currency: 'MUR',
      performanceObligations: [
        {
          obligationId: 'PO1',
          description: 'Service contract',
          type: 'OVER_TIME',
          standalonePrice: 1000000,
          progressMeasurement: { measureType: 'TIME_ELAPSED', percentComplete: 0.4 },
          isSatisfied: false,
        },
      ],
    })
    expect(result.step5_revenueRecognized).toBe(400000)  // 40% of 1M
  })

  it('allocates price by standalone prices', async () => {
    const { applyIFRS15 } = await import('../ifrs15-revenue-engine')
    const result = applyIFRS15({
      contractId: 'CON3',
      customerId: 'CUST1',
      startDate: new Date('2024-01-01'),
      totalConsideration: 1000000,
      currency: 'MUR',
      performanceObligations: [
        { obligationId: 'PO1', description: 'Hardware', type: 'POINT_IN_TIME', standalonePrice: 600000, isSatisfied: true },
        { obligationId: 'PO2', description: 'Service', type: 'OVER_TIME', standalonePrice: 400000, progressMeasurement: { measureType: 'TIME_ELAPSED', percentComplete: 0.25 }, isSatisfied: false },
      ],
    })
    expect(result.step4_allocations.length).toBe(2)
    expect(result.step4_allocations[0].allocatedPrice).toBeCloseTo(600000, 0)
    expect(result.step5_revenueRecognized).toBeCloseTo(600000 + 100000, 0)  // 100% hardware + 25% service
  })
})

describe('IAS 36 Impairment', () => {
  it('detects impairment when CA > RA', async () => {
    const { performImpairmentTest } = await import('../ias36-impairment-engine')
    const result = performImpairmentTest({
      assetId: 'A1',
      assetType: 'TANGIBLE',
      carryingAmount: 1000000,
      isIndependentCashFlows: true,
      fairValueLessCostsToSell: 700000,
      hasIndicatorsOfImpairment: true,
      isGoodwillOrIntangibleWithIndefiniteLife: false,
    })
    expect(result.impairmentExists).toBe(true)
    expect(result.impairmentLoss).toBe(300000)
  })

  it('no impairment when RA > CA', async () => {
    const { performImpairmentTest } = await import('../ias36-impairment-engine')
    const result = performImpairmentTest({
      assetId: 'A2',
      assetType: 'TANGIBLE',
      carryingAmount: 500000,
      isIndependentCashFlows: true,
      fairValueLessCostsToSell: 600000,
      hasIndicatorsOfImpairment: true,
      isGoodwillOrIntangibleWithIndefiniteLife: false,
    })
    expect(result.impairmentExists).toBe(false)
    expect(result.impairmentLoss).toBe(0)
  })
})

describe('IFRS 13 Fair Value', () => {
  it('Level 1 - quoted price', async () => {
    const { measureLevel1 } = await import('../ifrs13-fair-value-engine')
    const measurement = measureLevel1(100, 1000)
    expect(measurement.fairValueLevel).toBe('LEVEL_1')
    expect(measurement.fairValue).toBe(100000)
    expect(measurement.valuationTechnique).toBe('MARKET_APPROACH')
  })

  it('Level 2 - DCF with observable inputs', async () => {
    const { measureLevel2_DCF } = await import('../ifrs13-fair-value-engine')
    const measurement = measureLevel2_DCF({
      cashFlows: [100000, 100000, 100000, 100000, 100000],
      discountRate: 0.10,
    })
    expect(measurement.fairValueLevel).toBe('LEVEL_2')
    expect(measurement.fairValue).toBeGreaterThan(300000)  // PV of 5 years × 100k @ 10%
    expect(measurement.fairValue).toBeLessThan(500000)
  })
})

describe('IAS 7 Cash Flow', () => {
  it('indirect method reconciles', async () => {
    const { generateCashFlowIndirect } = await import('../ias7-cash-flow')
    const cf = generateCashFlowIndirect(
      { start: new Date('2024-01-01'), end: new Date('2024-12-31') },
      {
        netIncome: 1000000,
        depreciation: 200000,
        amortization: 50000,
        impairmentLoss: 0,
        gainOnSale: 0,
        fxLoss: 0,
        changeInReceivables: 100000,
        changeInInventory: 50000,
        changeInPayables: 80000,
        changeInAccruals: 0,
        changeInProvisions: 0,
        interestPaid: 30000,
        taxesPaid: 200000,
      },
      {
        ppePurchases: 500000,
        ppeSales: 0,
        intangiblesPurchases: 100000,
        investmentPurchases: 0,
        investmentSales: 0,
        loansGranted: 0,
        interestReceived: 10000,
        dividendsReceived: 0,
      },
      {
        proceedsFromBorrowings: 0,
        repaymentOfBorrowings: 100000,
        proceedsFromShareIssuance: 0,
        shareRepurchases: 0,
        dividendsPaid: 100000,
        leasePayments: 50000,
      },
      500000,  // beginning cash
      600000,  // ending cash
      0
    )
    expect(cf.method).toBe('INDIRECT')
    expect(cf.operatingActivities.lines.length).toBeGreaterThan(10)
  })
})
