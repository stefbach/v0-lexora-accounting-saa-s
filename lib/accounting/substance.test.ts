import { describe, it, expect } from 'vitest'
import { evaluateCompliance, ciganesInMauritius, SUBSTANCE_REQUIREMENTS } from './substance'

describe('substance — evaluateCompliance', () => {
  it('compliant si dépenses et employés ≥ seuils', () => {
    expect(evaluateCompliance('investment_holding', 5_000_000, 1)).toBe('compliant')
  })
  it('at_risk si dépenses ≥ 80% du seuil', () => {
    expect(evaluateCompliance('investment_holding', 4_000_000, 0)).toBe('at_risk')
  })
  it('non_compliant si en-dessous des seuils', () => {
    expect(evaluateCompliance('investment_holding', 1_000_000, 0)).toBe('non_compliant')
  })
  it('headquartering exige 8.5M + 3 employés', () => {
    expect(evaluateCompliance('headquartering', 10_000_000, 3)).toBe('compliant')
    expect(evaluateCompliance('headquartering', 10_000_000, 2)).toBe('at_risk')
  })
})

describe('substance — ciganesInMauritius', () => {
  it('compte les activités CIGA à Maurice', () => {
    expect(ciganesInMauritius([
      { activity_type: 'board_meeting', date: '2025-01-15', location: 'Mauritius', description: '' },
      { activity_type: 'board_meeting', date: '2025-03-10', location: 'Dubai', description: '' },
      { activity_type: 'investment_decision', date: '2025-06-01', location: 'Maurice (Port Louis)', description: '' },
    ])).toBe(2)
  })
  it('retourne 0 si aucune activité à MU', () => {
    expect(ciganesInMauritius([
      { activity_type: 'board_meeting', date: '2025-01-15', location: 'Dubai', description: '' },
    ])).toBe(0)
  })
})

describe('substance — SUBSTANCE_REQUIREMENTS', () => {
  it('contient les 11 activités attendues', () => {
    expect(Object.keys(SUBSTANCE_REQUIREMENTS).length).toBe(11)
    expect(SUBSTANCE_REQUIREMENTS.fund_management.min_expenditure_mur).toBe(10_000_000)
    expect(SUBSTANCE_REQUIREMENTS.professional.min_employees).toBe(1)
  })
})
