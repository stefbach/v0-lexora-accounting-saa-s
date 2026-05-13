/**
 * Substance requirements (CIGA) — ITA §73A + FSC Guidelines.
 * Une GBC doit prouver substance pour bénéficier du PER.
 */

export type SubstanceActivity =
  | 'investment_holding' | 'headquartering' | 'fund_management'
  | 'shipping' | 'aircraft_leasing' | 'ict_ip_holding'
  | 'financial_services' | 'insurance' | 'professional' | 'trading' | 'other'

export type ComplianceStatus = 'compliant' | 'at_risk' | 'non_compliant' | 'pending'

export const SUBSTANCE_REQUIREMENTS: Record<SubstanceActivity, { min_expenditure_mur: number; min_employees: number }> = {
  investment_holding:  { min_expenditure_mur:  4800000, min_employees: 1 },
  headquartering:      { min_expenditure_mur:  8500000, min_employees: 3 },
  fund_management:     { min_expenditure_mur: 10000000, min_employees: 2 },
  shipping:            { min_expenditure_mur:  5000000, min_employees: 2 },
  aircraft_leasing:    { min_expenditure_mur:  5000000, min_employees: 2 },
  ict_ip_holding:      { min_expenditure_mur:  6000000, min_employees: 2 },
  financial_services:  { min_expenditure_mur:  5000000, min_employees: 2 },
  insurance:           { min_expenditure_mur:  5000000, min_employees: 2 },
  professional:        { min_expenditure_mur:   600000, min_employees: 1 },
  trading:             { min_expenditure_mur:   600000, min_employees: 1 },
  other:               { min_expenditure_mur:   600000, min_employees: 1 },
}

export function evaluateCompliance(
  activity: SubstanceActivity,
  actualExpenditureMur: number,
  actualEmployees: number,
): ComplianceStatus {
  const req = SUBSTANCE_REQUIREMENTS[activity]
  const expOk = actualExpenditureMur >= req.min_expenditure_mur
  const empOk = actualEmployees >= req.min_employees
  if (expOk && empOk) return 'compliant'
  if (actualExpenditureMur >= req.min_expenditure_mur * 0.8 || actualEmployees >= Math.ceil(req.min_employees * 0.8)) return 'at_risk'
  return 'non_compliant'
}

export type CigaActivity = {
  activity_type: 'board_meeting' | 'investment_decision' | 'risk_management' | 'strategy_meeting' | 'other'
  date: string         // ISO YYYY-MM-DD
  location: string     // 'Mauritius' attendu pour CIGA
  description: string
  attendees?: string[]
}

export function ciganesInMauritius(activities: CigaActivity[]): number {
  return activities.filter(a => a.location?.toLowerCase().includes('mauritius') || a.location?.toLowerCase().includes('maurice')).length
}
