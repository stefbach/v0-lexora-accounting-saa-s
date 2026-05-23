// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import type { OhadaPayrollConfig } from '../../payroll/base-payroll-engine'

export const DRC_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'CD',
  cnss: {
    employeeRate: 0.05,  // INSS Cotisation salarié 5%
    employerRate: 0.13,  // INSS Cotisation patronale 13%
    cap: null,  // Pas de plafond
  },
  familyAllowances: { rate: 0.063 },  // Allocations familiales 6.3%
  workAccident: { rate: 0.015 },  // Accident du travail 1.5%
  // Barème IPR RDC 2024 (annuel en CDF)
  incomeTaxBrackets: [
    { from: 0, to: 1944000, rate: 0.03 },
    { from: 1944000, to: 21600000, rate: 0.15 },
    { from: 21600000, to: 43200000, rate: 0.30 },
    { from: 43200000, to: null, rate: 0.40 },
  ],
  taxableIncomeRules: {
    abatementSalaire: 0.30,  // 30% abattement pour frais professionnels
    chargeDeFamilleAllowance: 0,
    maxDependents: 0,
  },
  minimumWage: 212250,  // SMIG 2024: 7075 CDF/jour ≈ 212250 CDF/mois
}