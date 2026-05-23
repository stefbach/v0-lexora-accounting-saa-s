import { OhadaPayrollConfig } from '@/lib/types/jurisdiction';

export const CAR_PAYROLL_CONFIG: OhadaPayrollConfig = {
  jurisdiction: 'CF',
  country: 'Central African Republic',
  region: 'CEMAC',
  currency: 'XAF',

  // Minimum Wage
  minimumWage: 35000, // XAF monthly

  // CNSS (Caisse Nationale de Sécurité Sociale / OCSS)
  socialSecurity: {
    cnss: {
      employee: 0.03, // 3%
      employer: 0.19, // 19%
      cap: 600000, // XAF - maximum insurable earnings
    },
  },

  // Family Allowances
  familyAllowances: {
    rate: 0.12, // 12% of salary
  },

  // Work Accident Insurance
  workAccident: {
    employer: 0.03, // 3%
  },

  // Income Tax (IRPP - Impôt sur le Revenu des Personnes Physiques)
  // RCA (Revenu Catégorique des Salaires) - Monthly brackets in XAF
  incomeTax: {
    taxType: 'IRPP_RCA',
    brackets: [
      {
        min: 0,
        max: 50000,
        rate: 0.00, // 0%
      },
      {
        min: 50000,
        max: 100000,
        rate: 0.08, // 8%
      },
      {
        min: 100000,
        max: 200000,
        rate: 0.15, // 15%
      },
      {
        min: 200000,
        max: 400000,
        rate: 0.28, // 28%
      },
      {
        min: 400000,
        max: Infinity,
        rate: 0.40, // 40%
      },
    ],
  },

  // Salary Deductions/Abatements
  salaryAbatement: {
    rate: 0.15, // 15% abatement (déduction forfaitaire)
  },

  // Tax-Free Allowances
  taxFreeAllowances: [
    {
      name: 'Family allowances',
      percentage: 0.00,
    },
  ],

  // Deduction Order
  deductionOrder: [
    'SOCIAL_SECURITY',
    'WORK_ACCIDENT',
    'FAMILY_ALLOWANCES',
    'INCOME_TAX',
  ],

  // Payroll Frequency
  payrollFrequency: 'MONTHLY',

  // Contribution Caps
  contributionCaps: {
    cnssEmployeeMonthly: 600000, // XAF
    cnssEmployerMonthly: 600000, // XAF
  },

  // Filing Requirements
  filingRequirements: {
    payrollTaxFilingDueDateDays: 15, // 15 days after month-end
    annualDeclartionDueDateDays: 60, // 60 days after year-end
  },

  // Penalties
  penalties: {
    latePaymentPerDay: 0.001, // 0.1% per day
    underReportingPenalty: 0.10, // 10%
  },
};
