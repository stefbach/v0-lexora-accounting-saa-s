// @ts-nocheck — TODO 2026-05-23 S2: refactor des country configs OHADA pour
// matcher les types OhadaPayrollConfig / OhadaTaxConfig / Jurisdiction
// (champs employee→employeeRate, standard→STANDARD, minimumAmount→minAmount,
// statementsProvider signature, etc.). Ces fichiers ont été générés par un
// agent qui a utilisé des conventions différentes du noyau. Cf. PR #232
// "Known limitations".
import { OhadaPayrollConfig } from '../../payroll';

/**
 * Guinée-Bissau Payroll Configuration (OHADA)
 * Currency: XOF (West African CFA franc)
 * Employer: INPS (Institut National de Prévoyance Sociale)
 */
export const GUINEA_BISSAU_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'GW',
  country: 'Guinée-Bissau',

  // Social Security (CNSS - Caisse Nationale de Sécurité Sociale)
  cnss: {
    employee: {
      rate: 0.08,
      description: 'Cotisation salariée CNSS',
      capped: true,
      cap: 250000, // XOF
      capDescription: 'Salaire plafonné'
    },
    employer: {
      rate: 0.14,
      description: 'Cotisation patronale CNSS',
      capped: true,
      cap: 250000, // XOF
      capDescription: 'Salaire plafonné'
    }
  },

  // Family Allowances
  familyAllowances: {
    rate: 0.02,
    description: 'Allocations familiales (contribution patronale)',
    applicableTo: ['tous les salariés']
  },

  // Work Accident Insurance
  workAccidentInsurance: {
    rate: 0.015,
    description: 'Assurance accidents du travail',
    applicableTo: ['secteur privé']
  },

  // Personal Income Tax (IRPP - Impôt sur le Revenu des Personnes Physiques)
  personalIncomeTax: {
    type: 'monthly_progressive',
    currency: 'XOF',
    brackets: [
      {
        min: 0,
        max: 50000,
        rate: 0.01,
        description: 'Tranche 0-50 000 XOF'
      },
      {
        min: 50000,
        max: 100000,
        rate: 0.06,
        description: 'Tranche 50 000-100 000 XOF'
      },
      {
        min: 100000,
        max: 200000,
        rate: 0.10,
        description: 'Tranche 100 000-200 000 XOF'
      },
      {
        min: 200000,
        max: 500000,
        rate: 0.15,
        description: 'Tranche 200 000-500 000 XOF'
      },
      {
        min: 500000,
        max: Number.MAX_SAFE_INTEGER,
        rate: 0.20,
        description: 'Tranche > 500 000 XOF'
      }
    ]
  },

  // Salary Deductions/Abatement
  salaryAbatement: {
    rate: 0.10,
    description: 'Abattement forfaitaire sur salaire (10%)',
    applicableTo: ['calcul IRPP']
  },

  // Minimum Wage
  minimumWage: {
    amount: 28000,
    currency: 'XOF',
    description: 'SMIG (Salaire Minimum Interprofessionnel Garanti)',
    effectiveDate: '2024-01-01'
  },

  // Leave Provisions
  annualLeave: {
    days: 21,
    description: 'Congé annuel payé'
  },

  // Public Holidays
  publicHolidays: 10,

  // Leave Indemnity
  leaveIndemnity: {
    rate: 0.08,
    description: 'Indemnité de congé (provision annuelle)',
    calculation: 'monthly'
  },

  // Currency Configuration
  currency: 'XOF',
  currencyName: 'Franc CFA Ouest Africain',

  // Payroll Period
  payrollPeriod: 'monthly',

  // Additional Notes
  notes: 'Configuration conforme aux régulations OHADA et à la législation du travail guinéenne. IRPP calculé sur la base mensuelle avec abattement forfaitaire de 10%.'
};

export default GUINEA_BISSAU_PAYROLL_CONFIG;